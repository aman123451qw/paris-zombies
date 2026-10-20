// Riot atmosphere: street fires, flares, ground smoke, debris, a distant crowd down each street,
// and crowd/siren/bang ambience. All procedural, instanced where it repeats.
import * as THREE from 'three';
import { softDotTex } from './textures.js';
import { HALF_X, HALF_Z, OBSTACLES } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export function buildRiot(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(); scene.add(root);
  scene.fog.color.set(0xb9b6b0); scene.fog.near = 35; scene.fog.far = 170;

  // --- Fires: burning pallet barricades, bins, tyre stacks (sprite flames + smoke + a flickering light each).
  const fireTex = softDotTex('rgba(255,190,80,1)', 'rgba(255,60,0,0)'), smokeTex = softDotTex('rgba(45,44,46,.85)', 'rgba(45,44,46,0)');
  const greyTex = softDotTex('rgba(150,148,145,.55)', 'rgba(150,148,145,0)'), flareTex = softDotTex('rgba(255,60,50,1)', 'rgba(255,0,0,0)');
  const fires = [[-12, 12], [12, -12], [24, 10], [-26, -6], [-4, -HALF_Z - 12], [4, HALF_Z + 12], [-HALF_X - 12, 3], [HALF_X + 3, 6], [-16, -27], [18, 27], [34, -26], [-36, 18]];
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
  const tyreGeo = new THREE.TorusGeometry(0.36, 0.14, 8, 16).rotateX(Math.PI / 2);
  const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, fires.length * 3);
  const sprites = [], lights = [];
  fires.forEach(([x, z], fi) => {
    for (let k = 0; k < 3; k++) tyres.setMatrixAt(fi * 3 + k, new THREE.Matrix4().makeTranslation(x + rnd(-0.3, 0.3), 0.14 + k * 0.27, z + rnd(-0.3, 0.3)));
    for (let i = 0; i < 9; i++) {
      const flame = i < 4;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame ? fireTex : smokeTex, transparent: true, depthWrite: false, blending: flame ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.userData = { x, z, t: Math.random(), flame, rise: flame ? 2.2 : 11, size: flame ? 1.3 : 2.6, speed: flame ? 1.6 : 0.22 };
      root.add(s); sprites.push(s);
    }
    if (fi < 6) { const l = new THREE.PointLight(0xff8a3a, 6, 14, 2); l.position.set(x, 1.4, z); root.add(l); lights.push(l); }
  });
  tyres.castShadow = true; root.add(tyres);
  for (const [x, z] of fires.slice(0, 6)) OBSTACLES.push({ x, z, r: 1 });

  // --- Red flares lying on the road.
  for (const [x, z] of [[-8, -24], [15, 23], [-33, -12], [37, 4], [0, -45], [-52, -2]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, 0.25, z); s.scale.setScalar(1.6); s.userData = { flare: true, base: 1.6 }; root.add(s); sprites.push(s);
    for (let i = 0; i < 3; i++) { const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: greyTex, transparent: true, depthWrite: false, color: 0xff9a90 })); p.userData = { x, z, t: Math.random(), flame: false, rise: 6, size: 2, speed: 0.3 }; root.add(p); sprites.push(p); }
  }

  // --- Low smoke / tear-gas haze drifting across the square.
  const haze = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: greyTex, transparent: true, depthWrite: false, opacity: 0.35 }));
    s.position.set(rnd(-HALF_X, HALF_X), rnd(1, 3.5), rnd(-HALF_Z, HALF_Z)); s.scale.setScalar(rnd(9, 16));
    s.userData = { vx: rnd(0.3, 0.9), ph: Math.random() * 6 }; root.add(s); haze.push(s);
  }

  // --- Debris: paving stones, paper, glass glints, bottles. One instanced mesh each.
  const scatter = (geo, mat, n, y, spin = true, area = 1) => {
    const im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(rnd(-HALF_X + 1, HALF_X - 1) * area, y, rnd(-HALF_Z + 1, HALF_Z - 1) * area);
      e.set(spin ? rnd(0, 0.4) : 0, rnd(0, 6.28), spin ? rnd(0, 0.4) : 0); q.setFromEuler(e);
      im.setMatrixAt(i, m.compose(p, q, new THREE.Vector3(1, 1, 1).multiplyScalar(rnd(0.7, 1.3))));
    }
    im.receiveShadow = true; root.add(im); return im;
  };
  scatter(new THREE.BoxGeometry(0.14, 0.1, 0.14), new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 1 }), 420, 0.06);
  scatter(new THREE.PlaneGeometry(0.28, 0.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 1, side: THREE.DoubleSide }), 360, 0.035, false);
  scatter(new THREE.PlaneGeometry(0.08, 0.06).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.6 }), 500, 0.03, false);
  scatter(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.2 }), 80, 0.04, false);

  // --- Overturned bins, traffic cones, a fallen scooter or two.
  const binMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.6 }), coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 });
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10, 1, true), binMat); b.rotation.set(Math.PI / 2, 0, rnd(0, 6.28));
    b.position.set(rnd(-38, 38), 0.3, rnd(-28, 28)); b.castShadow = true; root.add(b);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 10), coneMat); const down = Math.random() < 0.5;
    c.rotation.set(down ? Math.PI / 2 : 0, 0, rnd(0, 6.28)); c.position.set(rnd(-40, 40), down ? 0.2 : 0.3, rnd(-30, 30)); c.castShadow = true; root.add(c);
  }

  // --- Distant crowd down each street, behind the barricades (not shootable, not in hit targets).
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 1 });
  const body = new THREE.CapsuleGeometry(0.28, 1.1, 3, 8).translate(0, 0.83, 0);
  const crowdSpots = [[0, -HALF_Z - 34, 14, 10], [0, HALF_Z + 34, 14, 10], [-HALF_X - 34, 1, 10, 14]];
  const per = 70, crowd = new THREE.InstancedMesh(body, crowdMat, per * crowdSpots.length), base = [];
  crowdSpots.forEach(([cx, cz, w, d], s) => { for (let i = 0; i < per; i++) base.push([cx + rnd(-w / 2, w / 2), cz + rnd(-d / 2, d / 2), Math.random() * 6, rnd(0.9, 1.1)]); });
  root.add(crowd);
  const cm = new THREE.Matrix4();

  // --- Ambience (Web Audio): crowd roar, sirens, distant bangs.
  ctx.audio.startAmbience?.();

  let t = 0;
  return {
    crowd,
    update(dt) {
      t += dt;
      for (const s of sprites) {
        const u = s.userData;
        if (u.flare) { s.scale.setScalar(u.base * (0.85 + Math.random() * 0.3)); continue; }
        u.t += dt * u.speed; if (u.t > 1) u.t -= 1;
        s.position.set(u.x + Math.sin(u.t * 6 + u.z) * 0.3 + u.t * (u.flame ? 0.2 : 2.5), 0.3 + u.t * u.rise, u.z + Math.cos(u.t * 4 + u.x) * 0.3);
        s.scale.setScalar(u.flame ? u.size * (1.2 - u.t) : u.size * (0.6 + u.t * 2.4));
        s.material.opacity = u.flame ? 1 - u.t : Math.sin(u.t * Math.PI) * 0.7;
      }
      for (const l of lights) l.intensity = 4.5 + Math.random() * 3;
      for (const h of haze) {
        const u = h.userData; h.position.x += u.vx * dt; if (h.position.x > HALF_X + 10) h.position.x = -HALF_X - 10;
        h.material.opacity = 0.22 + Math.sin(t * 0.3 + u.ph) * 0.1;
      }
      base.forEach(([x, z, ph, s], i) => {
        const bob = Math.abs(Math.sin(t * 2.2 + ph)) * 0.12;
        cm.makeScale(s, s, s).setPosition(x + Math.sin(t * 0.5 + ph) * 0.4, bob, z); crowd.setMatrixAt(i, cm);
      });
      crowd.instanceMatrix.needsUpdate = true;
    },
  };
}
