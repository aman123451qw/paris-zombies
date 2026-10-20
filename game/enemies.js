// Masked-crew enemies (protester-style). Models: assets/crew_<type>.glb from Higgsfield 3D (our sheets),
// with assets/Soldier.glb (three.js example) painted black as the fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SPAWNS, SIDE_SPAWN, OBSTACLES, HALF_X, HALF_Z } from './world.js';

export const TYPES = {
  runner:  { hp: 60,  speed: 7.5, dmg: 20, range: 1.6, cd: 1.0, points: 60,  scale: 1.0,  move: 'run' },
  thrower: { hp: 50,  speed: 4.5, dmg: 15, range: 15,  cd: 2.5, points: 90,  scale: 0.97, move: 'run' },
  heavy:   { hp: 220, speed: 3.2, dmg: 35, range: 1.8, cd: 1.4, points: 150, scale: 1.15, move: 'walk' },
};
const BLACK = new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.92 });
const MASK = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1 });
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

export async function createEnemies(ctx) {
  // Per-type models (Higgsfield 3D from our character sheets): assets/crew_<type>.glb, textured, with a run clip.
  // Fallback: Soldier.glb painted black.
  const loader = new GLTFLoader();
  let fallback = null;
  const models = {};
  for (const type of Object.keys(TYPES)) {
    let g = null, own = true;
    try { g = await loader.loadAsync(`assets/crew_${type}.gltf.json`); } catch { g = fallback ||= await loader.loadAsync('assets/Soldier.glb'); own = false; }
    const clip = name => g.animations.find(a => a.name.toLowerCase().includes(name));
    const run = clip('run') || g.animations[0];
    models[type] = { gltf: g, own, clips: { idle: clip('idle'), run, walk: clip('walk') || run, swing: clip('swing'), throw: clip('throw'), hit: clip('hit'), death: clip('death') || clip('dying') },
      baseH: new THREE.Box3().setFromObject(g.scene).getSize(tmp).y || 1.8 };
  }
  const list = [], projectiles = [];
  const bottleGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.28, 8), bottleMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.2, transparent: true, opacity: 0.85 });

  function bone(root, part) { let b = null; root.traverse(o => { if (!b && o.isBone && o.name.toLowerCase().endsWith(part)) b = o; }); return b; }
  function attachSized(b, mesh) { b.updateWorldMatrix(true, false); const s = b.getWorldScale(tmp2); mesh.scale.divide(s); b.add(mesh); return mesh; }

  function make(type) {
    const def = TYPES[type], M = models[type], root = new THREE.Group(), model = SkeletonUtils.clone(M.gltf.scene);
    model.traverse(o => { if (o.isMesh) { if (!M.own) o.material = o.name.toLowerCase().includes('visor') ? MASK : BLACK; o.castShadow = true; o.frustumCulled = false; } });
    model.scale.setScalar((1.8 * def.scale) / M.baseH); model.rotation.y = M.own ? 0 : Math.PI;
    root.add(model); ctx.scene.add(root); root.updateMatrixWorld(true);
    const head = bone(model, 'head'), hand = bone(model, 'righthand'), arm = bone(model, 'leftforearm');
    if (head && !M.own) attachSized(head, new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), MASK)).position.set(0, 0.06 / tmp2.y, -0.01 / tmp2.z);
    if (hand && type === 'runner') attachSized(hand, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.8, 8).translate(0, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0x7a5230 })));
    if (hand && type === 'heavy') attachSized(hand, new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.6, 6).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: 0x5a1e1e, metalness: 0.6 })));
    if (arm && type === 'heavy') attachSized(arm, new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.03), new THREE.MeshStandardMaterial({ color: 0x8d8f91, metalness: 0.7, roughness: 0.45 }))).position.set(0, 0.15 / tmp2.y, 0.14 / tmp2.z);
    if (hand && type === 'thrower') attachSized(hand, new THREE.Mesh(bottleGeo, bottleMat)).position.set(0, 0.1 / tmp2.y, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * def.scale, 0.28 * def.scale, 1.45 * def.scale, 8).translate(0, 0.75 * def.scale, 0), HIT_MAT);
    root.add(body);
    const headBox = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), HIT_MAT);
    if (head) attachSized(head, headBox); else { headBox.position.y = 1.65 * def.scale; root.add(headBox); }
    const mixer = new THREE.AnimationMixer(model), acts = {};
    for (const [k, c] of Object.entries(M.clips)) if (c) acts[k] = mixer.clipAction(c);
    for (const k of ['swing', 'throw', 'hit', 'death']) if (acts[k]) { acts[k].setLoop(THREE.LoopOnce); acts[k].clampWhenFinished = true; }
    const e = { type, def, root, model, mixer, acts, body, headBox, hp: def.hp, alive: false, cd: 0, windup: 0, deadT: 0, cur: null, flash: 0, entry: null };
    const onHit = isHead => (dmg, head, point, now) => hit(e, dmg, isHead || head, point, now);
    body.userData = { onHit: onHit(false) }; headBox.userData = { onHit: onHit(true), head: true };
    list.push(e);
    return e;
  }

  function play(e, name, fade = 0.2) {
    const a = e.acts[name] || e.acts.run; if (!a || e.cur === a) return;
    a.reset().fadeIn(fade).play(); if (e.cur) e.cur.fadeOut(fade); e.cur = a;
  }

  function hit(e, dmg, head, point, now) {
    if (!e.alive) return;
    if (e.type === 'heavy' && !head) { // Shield blocks from the front ±50°.
      tmp.subVectors(ctx.camera.position, e.root.position).setY(0).normalize();
      tmp2.set(Math.sin(e.root.rotation.y), 0, Math.cos(e.root.rotation.y));
      if (tmp.dot(tmp2) > Math.cos(THREE.MathUtils.degToRad(50))) { ctx.fx.impact(point, 0xffd27a); ctx.audio.empty(); dmg *= 0.1; }
    }
    const d = head ? dmg * 2 : dmg;
    e.hp -= d; e.flash = 0.08; ctx.fx.impact(point, 0x2a2a2a); ctx.waves.onHit();
    tmp.subVectors(e.root.position, ctx.camera.position).setY(0).normalize(); e.root.position.addScaledVector(tmp, 0.12);
    if (e.hp <= 0) die(e, head, now);
  }

  function die(e, head) {
    e.alive = false; e.deadT = 0; remove(e);
    if (e.acts.death) play(e, 'death', 0.1); else e.cur?.fadeOut(0.1);
    ctx.audio.thud(); ctx.waves.onKill(e.type, head);
  }
  function remove(e) { for (const m of [e.body, e.headBox]) { const i = ctx.hitTargets.indexOf(m); if (i >= 0) ctx.hitTargets.splice(i, 1); } }

  function spawn(type, sideOpen) {
    const e = list.find(x => !x.alive && x.type === type && x.deadT > 3) || make(type);
    const pts = sideOpen ? [...SPAWNS, SIDE_SPAWN] : SPAWNS;
    const pp = ctx.camera.position;
    const options = pts.filter(p => Math.hypot(p.x - pp.x, p.z - pp.z) > 15);
    const p = (options.length ? options : pts)[Math.floor(Math.random() * (options.length || pts.length))];
    e.root.position.set(p.x + (Math.random() - 0.5) * 4, 0, p.z + (Math.random() - 0.5) * 4);
    e.root.rotation.set(0, 0, 0); e.root.visible = true; e.model.position.y = 0;
    // Spawns outside the square first walk to a point just inside their street gap.
    const outside = Math.abs(p.x) > HALF_X - 2 || Math.abs(p.z) > HALF_Z - 2;
    e.entry = outside ? new THREE.Vector3(THREE.MathUtils.clamp(p.x, -HALF_X + 4, HALF_X - 4), 0, THREE.MathUtils.clamp(p.z, -HALF_Z + 4, HALF_Z - 4)) : null;
    e.hp = e.def.hp * ctx.waves.hpMult(); e.alive = true; e.cd = 1; e.windup = 0; e.deadT = 0; e.cur = null;
    for (const a of Object.values(e.acts)) a.stop();
    play(e, e.def.move, 0);
    ctx.hitTargets.push(e.body, e.headBox);
    if (Math.random() < 0.4) ctx.audio.enemyShout((p.x - pp.x) / 60);
  }

  function throwBottle(e) {
    const m = new THREE.Mesh(bottleGeo, bottleMat); m.position.copy(e.root.position).y += 1.7;
    const target = ctx.camera.position.clone().addScaledVector(ctx.player.vel.clone().setY(0), 0.6);
    const flat = Math.hypot(target.x - m.position.x, target.z - m.position.z), t = Math.max(0.6, flat / 16);
    const v = new THREE.Vector3((target.x - m.position.x) / t, (target.y - m.position.y) / t + 0.5 * 20 * t, (target.z - m.position.z) / t);
    ctx.scene.add(m); projectiles.push({ m, v, life: 4 }); ctx.audio.swing();
  }

  function update(dt, now) {
    const pp = ctx.camera.position, speedMult = ctx.waves.speedMult();
    for (const e of list) {
      if (e.flash > 0) e.flash -= dt;
      e.mixer.update(dt);
      if (!e.alive) {
        e.deadT += dt;
        if (!e.acts.death) e.model.rotation.x = Math.max(-Math.PI / 2, -e.deadT * 6);
        if (e.deadT > 2.5) e.model.position.y -= dt * 0.6;
        if (e.deadT > 3.2) e.root.visible = false;
        continue;
      }
      const pos = e.root.position, def = e.def;
      const goal = e.entry || pp;
      if (e.entry && Math.hypot(e.entry.x - pos.x, e.entry.z - pos.z) < 2) e.entry = null;
      tmp.set(goal.x - pos.x, 0, goal.z - pos.z); const dist = Math.hypot(pp.x - pos.x, pp.z - pos.z);
      tmp.normalize();
      for (const o of list) if (o !== e && o.alive) { const dx = pos.x - o.root.position.x, dz = pos.z - o.root.position.z, d2 = dx * dx + dz * dz; if (d2 < 1.4 && d2 > 1e-4) { tmp.x += dx / d2 * 0.4; tmp.z += dz / d2 * 0.4; } }
      for (const o of OBSTACLES) { const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + 1.5) { tmp.x += dx / d * 1.2; tmp.z += dz / d * 1.2; tmp.x += -dz / d * 0.8; tmp.z += dx / d * 0.8; } }
      tmp.normalize();
      e.root.rotation.y = Math.atan2(tmp.x, tmp.z);
      e.cd -= dt;
      let move = 0;
      if (e.type === 'thrower' && !e.entry) {
        move = dist > 18 ? 1 : dist < 11 ? -0.6 : 0;
        e.root.rotation.y = Math.atan2(pp.x - pos.x, pp.z - pos.z);
        if (e.cd <= 0 && dist < 26) { e.cd = def.cd; play(e, 'throw', 0.1); setTimeout(() => e.alive && throwBottle(e), 350); }
      } else if (dist > def.range || e.entry) move = 1;
      else if (e.cd <= 0 && e.windup <= 0) { e.windup = 0.35; play(e, 'swing', 0.1); }
      if (e.windup > 0 && (e.windup -= dt) <= 0) { e.cd = def.cd; if (dist < def.range + 0.5) ctx.player.damage(def.dmg, now); }
      if (dist < 0.9 && dist > 1e-3) { pos.x += (pos.x - pp.x) / dist * (0.9 - dist); pos.z += (pos.z - pp.z) / dist * (0.9 - dist); }
      if (move) { pos.addScaledVector(tmp, def.speed * speedMult * move * dt); if (!e.windup) play(e, move > 0 ? def.move : 'walk'); }
      else if (e.windup <= 0 && e.cd > 0.3 && e.type !== 'thrower') play(e, 'idle');
      else if (e.type === 'thrower' && e.cd < def.cd - 0.8) play(e, 'idle');
      if (e.windup > 0 && !e.acts.swing) e.model.rotation.x = -0.3 * Math.sin((0.35 - e.windup) / 0.35 * Math.PI); else e.model.rotation.x = 0;
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.v.y -= 20 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 12; p.life -= dt;
      const hitPlayer = p.m.position.distanceTo(tmp2.copy(pp).setY(pp.y - 0.5)) < 0.9;
      if (hitPlayer || p.m.position.y < 0.05 || p.life <= 0) {
        if (hitPlayer) ctx.player.damage(TYPES.thrower.dmg, now);
        ctx.audio.glass(); ctx.fx.impact(p.m.position, 0x8fbf8a); ctx.scene.remove(p.m); projectiles.splice(i, 1);
      }
    }
  }

  return {
    spawn, update, list, alive: () => list.filter(e => e.alive).length,
    reset() { for (const e of list) { e.alive = false; e.deadT = 99; e.root.visible = false; remove(e); } for (const p of projectiles) ctx.scene.remove(p.m); projectiles.length = 0; },
  };
}
