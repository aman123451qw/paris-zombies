// Weapons. Recoil/recovery/heat, ADS spread, bob and the muzzle-flash star are adapted from
// roryford/agentofduty src/weapons/WeaponsSystem.js (MIT): computeSpreadDirection(),
// createMuzzleFlashGeometry(), recoil kick L730-733 + recovery L477-483, bob L614-621.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEFS = {
  rifle:   { name: 'RIFLE',   mag: 30, reserve: 180, rpm: 600, dmg: 24, pellets: 1, spread: 0.006, reload: 1.8, kickP: 0.018, kickY: 0.006, recovery: 8, auto: true },
  shotgun: { name: 'SHOTGUN', mag: 6,  reserve: 36,  rpm: 72,  dmg: 14, pellets: 8, spread: 0.06,  reload: 0.5, kickP: 0.06,  kickY: 0.015, recovery: 6, auto: false, perShell: true },
};
const HIP_FOV = 75, ADS_FOV = 50, RANGE = 120;

export function computeSpreadDirection(f, ro, uo, spread, out) {
  const fl = f.length() || 1, fx = f.x / fl, fy = f.y / fl, fz = f.z / fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  return out.set(fx + rx * ro * spread + ux * uo * spread, fy + uy * uo * spread, fz + rz * ro * spread + uz * uo * spread).normalize();
}
function muzzleFlashGeometry(spikes = 8) {
  const n = spikes * 2, pos = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = i % 2 === 0 ? 0.045 : 0.017, r1 = (i + 1) % 2 === 0 ? 0.045 : 0.017;
    pos.set([0, 0, 0, Math.cos(a0) * r0, Math.sin(a0) * r0, 0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0], i * 9);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
}
function shotgunMesh() {
  const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); };
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 10).rotateX(Math.PI / 2), dark, 0, 0.03, -0.2);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.45, 10).rotateX(Math.PI / 2), dark, 0, -0.005, -0.15);
  add(new THREE.BoxGeometry(0.05, 0.06, 0.22), dark, 0, 0.01, 0.12);
  add(new THREE.BoxGeometry(0.045, 0.05, 0.16), wood, 0, -0.005, -0.18);
  add(new THREE.BoxGeometry(0.045, 0.09, 0.26).rotateX(-0.25), wood, 0, -0.04, 0.33);
  g.userData.muzzleZ = -0.52;
  return g;
}

export async function createWeapons(ctx) {
  const { camera, audio, hud } = ctx;
  const rifleScene = (await new GLTFLoader().loadAsync('assets/rifle.glb')).scene;
  const models = { rifle: rifleScene, shotgun: shotgunMesh() };
  rifleScene.userData.muzzleZ = -0.515;
  const holder = new THREE.Group(); camera.add(holder);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const flash = new THREE.Mesh(muzzleFlashGeometry(), flashMat); flash.visible = false;
  // Layer 1 = view-model pass (rendered after a depth clear, so the gun never clips into walls).
  for (const m of Object.values(models)) { m.visible = false; m.traverse(o => { o.layers.set(1); if (o.isMesh) o.frustumCulled = false; }); holder.add(m); }
  flash.layers.set(1);

  const ray = new THREE.Raycaster(); ray.far = RANGE;
  const fwd = new THREE.Vector3(), d = new THREE.Vector3();
  const state = { rifle: { ammo: 30, reserve: 180 }, shotgun: null };
  let cur = 'rifle', cooldown = 0, reloading = 0, recoilP = 0, recoilY = 0, heat = 0, bob = 0, kick = 0, flashLife = 0, meleeCd = 0;

  const w = {
    ads: 0, firing: false, aiming: false,
    get current() { return cur; },
    owns(id) { return !!state[id]; },
    give(id) { if (!state[id]) state[id] = { ammo: DEFS[id].mag, reserve: DEFS[id].reserve }; else state[id].reserve = DEFS[id].reserve; w.switchTo(id); },
    switchTo(id) {
      if (!state[id]) return;
      cur = id; reloading = 0;
      for (const [k, m] of Object.entries(models)) m.visible = k === id;
      flash.removeFromParent(); models[id].add(flash); flash.position.set(0, 0.02, models[id].userData.muzzleZ);
      hud.setWeapon(DEFS[id].name); hud.setAmmo(state[id].ammo, state[id].reserve);
    },
    reload() {
      const s = state[cur], def = DEFS[cur];
      if (reloading > 0 || s.ammo >= def.mag || s.reserve <= 0) return;
      reloading = def.reload; audio.reload();
    },
    melee(now) {
      if (meleeCd > 0) return; meleeCd = 0.6; kick = 0.12; audio.swing();
      camera.getWorldDirection(fwd); ray.set(camera.position, fwd); ray.far = 2.2;
      const hit = ray.intersectObjects(ctx.hitTargets, false)[0]; ray.far = RANGE;
      if (hit) hit.object.userData.onHit(50, false, hit.point, now);
    },
    reset() { state.rifle = { ammo: 30, reserve: 180 }; state.shotgun = null; w.switchTo('rifle'); recoilP = recoilY = heat = 0; },

    update(dt, now) {
      const def = DEFS[cur], s = state[cur];
      cooldown -= dt; meleeCd -= dt;
      w.ads += ((w.aiming ? 1 : 0) - w.ads) * Math.min(1, dt * 12);
      camera.fov = HIP_FOV + (ADS_FOV - HIP_FOV) * w.ads + (ctx.player.sprinting ? 6 : 0);
      camera.updateProjectionMatrix();

      if (reloading > 0) {
        reloading -= dt;
        if (reloading <= 0) {
          const take = def.perShell ? 1 : Math.min(def.mag - s.ammo, s.reserve);
          s.ammo += take; s.reserve -= take; hud.setAmmo(s.ammo, s.reserve);
          if (def.perShell && s.ammo < def.mag && s.reserve > 0 && !w.firing) reloading = def.reload;
        }
      }
      if (w.firing && cooldown <= 0 && reloading <= 0 && !ctx.player.sprinting) {
        if (s.ammo > 0) fire(def, s, now); else if (s.reserve > 0) w.reload(); else { audio.empty(); cooldown = 0.3; }
        if (!def.auto) w.firing = false;
      }

      // Recover exactly the camera impulse still owned by the weapon (agentofduty L477-483).
      const oldP = recoilP, oldY = recoilY, rec = Math.exp(-def.recovery * dt);
      recoilP *= rec; recoilY *= rec;
      camera.rotation.x += recoilP - oldP; camera.rotation.y += recoilY - oldY;
      heat = Math.max(0, heat - dt * 1.5);

      // View-model pose, bob (agentofduty L614-621) and kick.
      const moving = ctx.player.moving;
      if (moving) bob += dt * (ctx.player.sprinting ? 14 : 10); else bob *= 0.9;
      const bs = (1 - w.ads) * Math.min(1, ctx.player.speed() / 5);
      kick *= Math.exp(-12 * dt);
      const reloadDip = reloading > 0 ? 0.08 : 0;
      holder.position.set(0.2 * (1 - w.ads) + Math.cos(bob * 0.5) * 0.008 * bs, -0.21 + 0.1 * w.ads + Math.sin(bob) * 0.012 * bs - reloadDip, -0.5 + kick);
      holder.rotation.set(kick * 1.5 + reloadDip, ctx.player.sprinting ? 0.5 : 0, 0);
      flashLife -= dt; flash.visible = flashLife > 0; flash.rotation.z = Math.random() * 3;
    },
  };

  function fire(def, s, now) {
    s.ammo--; cooldown = 60 / def.rpm; hud.setAmmo(s.ammo, s.reserve);
    const kp = def.kickP * (1 + heat * 0.4), ky = def.kickY * (Math.random() - 0.5) * 2 * (1 + heat * 0.3);
    recoilP += kp; recoilY += ky; camera.rotation.x += kp; camera.rotation.y += ky;
    heat = Math.min(1.5, heat + 0.12); kick = 0.035; flashLife = 0.04;
    audio.shot(cur); ctx.shake(cur === 'shotgun' ? 0.05 : 0.02);
    camera.getWorldDirection(fwd);
    const spread = def.spread * (1 + heat * 1.5) * (1 - w.ads * 0.75);
    const targets = ctx.hitTargets.concat(ctx.worldMeshes);
    let anyHit = false, head = false;
    for (let i = 0; i < def.pellets; i++) {
      computeSpreadDirection(fwd, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, spread, d);
      ray.set(camera.position, d);
      const hit = ray.intersectObjects(targets, false)[0];
      if (!hit) continue;
      if (hit.object.userData.onHit) {
        const falloff = def.pellets > 1 ? Math.max(0.3, 1 - Math.max(0, hit.distance - 8) / 20) : 1;
        hit.object.userData.onHit(def.dmg * falloff, !!hit.object.userData.head, hit.point, now);
        anyHit = true; head ||= !!hit.object.userData.head;
      } else ctx.fx.impact(hit.point, hit.face?.normal);
    }
    if (anyHit) { hud.hitmarker(head); audio.hit(head); }
  }

  w.switchTo('rifle');
  return w;
}
