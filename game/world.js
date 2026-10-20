// Place de la République-style map. Uses pieces from assets/paris_kit.glb (Blender, B1)
// and falls back to plain boxes for any piece the kit doesn't have yet.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { signTex, plaqueTex, shutterTex, chalkGunTex, softDotTex } from './textures.js';

export const HALF_X = 45, HALF_Z = 35, GAP = 7;
export const SPAWNS = [new THREE.Vector3(0, 0, -HALF_Z - 6), new THREE.Vector3(0, 0, HALF_Z + 6), new THREE.Vector3(-HALF_X - 6, 0, 0),
  new THREE.Vector3(-22, 0, 27), new THREE.Vector3(22, 0, -27)];
export const SIDE_SPAWN = new THREE.Vector3(72, 0, 0);
export const WALLBUY = { pos: new THREE.Vector3(-HALF_X + 1.1, 1.6, 14), price: 750 };
export const GATE = { pos: new THREE.Vector3(HALF_X + 1, 0, 0), price: 1000 };
export const OBSTACLES = [{ x: 0, z: 0, r: 8.5 }];

const loader = new GLTFLoader();
const tex = new THREE.TextureLoader();

export async function buildWorld(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(), colliders = new THREE.Group();
  scene.add(root); scene.add(colliders);
  const worldMeshes = [];
  let kit = null;
  try { kit = (await loader.loadAsync('assets/paris_kit.glb')).scene; } catch { console.warn('paris_kit.glb missing, using boxes'); }

  // Sky + light.
  const hdr = await tex.loadAsync('assets/tex/sky.jpg'); hdr.colorSpace = THREE.SRGBColorSpace; // LDR copy of the Poly Haven HDRI (web-safe for publishing)
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = hdr; scene.environment = hdr; scene.environmentIntensity = 0.7;
  scene.fog = new THREE.Fog(0xc9d3dc, 60, 170);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-40, 60, 30); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 200 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  sun.layers.enableAll(); scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6a604f, 0.6); hemi.layers.enableAll(); scene.add(hemi);

  // Ground: Poly Haven cobblestone (CC0).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({
    map: rep(tex.load('assets/tex/cobblestone_floor_04_diffuse.jpg'), 120, true),
    normalMap: rep(tex.load('assets/tex/cobblestone_floor_04_nor_gl.jpg'), 120),
    roughnessMap: rep(tex.load('assets/tex/cobblestone_floor_04_rough.jpg'), 120),
  }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground); worldMeshes.push(ground);
  colliders.add(new THREE.Mesh(new THREE.BoxGeometry(220, 1, 220).translate(0, -0.5, 0)));

  function piece(name, x, z, rotY = 0, fallback = [2, 2, 2], s = 1) {
    let obj = kit?.getObjectByName(name)?.clone(true);
    if (obj) {
      obj.traverse(o => {
        if (!o.isMesh) return;
        if (o.name.startsWith('col_') || o.material?.name === 'mat_collider') { o.visible = false; o.userData.col = true; }
        else { o.castShadow = o.receiveShadow = true; worldMeshes.push(o); }
      });
    } else {
      const [w, h, d] = fallback;
      obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.9 }));
      obj.castShadow = obj.receiveShadow = true; obj.userData.box = true; worldMeshes.push(obj);
    }
    obj.position.set(x, 0, z); obj.rotation.y = rotY; obj.scale.setScalar(s); root.add(obj);
    obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isMesh && (o.userData.col || o.userData.box)) { const c = new THREE.Mesh(o.geometry); c.applyMatrix4(o.matrixWorld); colliders.add(c); } });
    return obj;
  }
  function plane(texture, w, h, x, y, z, rotY, emissive = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent: true, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? texture : null, emissiveIntensity: emissive ? 1.2 : 0 }));
    m.position.set(x, y, z); m.rotation.y = rotY; root.add(m); return m;
  }

  // Building ring: 6 m modules facing the plaza, with street gaps in the middle of N, S and W, and the side street on E.
  const sides = [
    { axis: 'x', fixed: -HALF_Z, rot: 0, len: HALF_X }, { axis: 'x', fixed: HALF_Z, rot: Math.PI, len: HALF_X },
    { axis: 'z', fixed: -HALF_X, rot: Math.PI / 2, len: HALF_Z }, { axis: 'z', fixed: HALF_X, rot: -Math.PI / 2, len: HALF_Z },
  ];
  const signs = [['BOULANGERIE', '#7a1d1d', '#f3e3c3'], ['TÉLÉPHONE', '#f2c230', '#1b1b1b'], ['TABAC', '#a51d2d', '#fff'], ['PHARMACIE', '#1f7a3e', '#fff'], ['CAFÉ DE LA PLACE', '#1d2f4a', '#f3e3c3']];
  let k = 0;
  for (const s of sides) {
    for (let t = -s.len + 3; t <= s.len - 3; t += 6) {
      if (Math.abs(t) < GAP) continue;
      const x = s.axis === 'x' ? t : s.fixed, z = s.axis === 'x' ? s.fixed : t;
      const b = piece(k % 2 ? 'facade_B' : 'facade_A', x, z, s.rot, [6, 18, 1]);
      piece('mansard_roof', x, z, s.rot, [6, 3, 1]).position.y = 18;
      const n = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
      if (k % 3 === 0) { const [txt, bg, fg] = signs[k % signs.length]; plane(signTex(txt, bg, fg), 4.2, 1, x + n.x * 0.62, 4.1, z + n.z * 0.62, s.rot); }
      if (k % 4 === 1) plane(shutterTex(k + 3), 4, 3, x + n.x * 0.42, 1.6, z + n.z * 0.42, s.rot);
      k++; void b;
    }
  }
  // Gap blockers (player only; enemies walk in through them).
  for (const [x, z, w, d] of [[0, -HALF_Z - 3, GAP * 2, 1], [0, HALF_Z + 3, GAP * 2, 1], [-HALF_X - 3, 0, 1, GAP * 2]])
    colliders.add(new THREE.Mesh(new THREE.BoxGeometry(w, 8, d).translate(x, 4, z)));
  for (const [x, z, r] of [[-3, -HALF_Z - 1, 0], [3, HALF_Z + 1, Math.PI], [-HALF_X - 1, 2, Math.PI / 2]]) {
    piece('pallet_stack', x, z, r, [2.4, 1.4, 1.2]); piece('crowd_barrier', x + 4, z, r, [2.5, 1.1, 0.2]); piece('crowd_barrier', x - 4, z, r, [2.5, 1.1, 0.2]);
  }
  plane(plaqueTex('RUE DES', 'CROISSANTS'), 1.2, 0.75, -HALF_X + 0.62, 4.6, -GAP - 1.5, Math.PI / 2);

  // Side street east of the square (unlocked with points).
  for (let x = HALF_X + 3; x <= HALF_X + 33; x += 6) {
    piece('facade_A', x, -6, 0, [6, 18, 1]); piece('facade_B', x, 6, Math.PI, [6, 18, 1]);
  }
  colliders.add(new THREE.Mesh(new THREE.BoxGeometry(1, 8, 12).translate(HALF_X + 36, 4, 0)));
  const gate = new THREE.Group(); root.add(gate);
  const gateBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, GAP * 2).translate(GATE.pos.x, 4, 0)); colliders.add(gateBlock);
  for (const z of [-4, 0, 4]) {
    const before = colliders.children.length;
    gate.add(piece('pallet_stack', GATE.pos.x, z, Math.PI / 2, [2.4, 1.4, 1.2]));
    for (let i = before; i < colliders.children.length; i++) colliders.children[i].userData.gate = true;
  }

  // Centre: monument, trees, lamps, metro, cafés, wrecks.
  piece('monument', 0, 0, 0, [10, 14, 10]);
  for (const z of [-18, 18]) for (let x = -36; x <= 36; x += 9) { if (Math.abs(x) < 10) continue; piece('plane_tree', x, z, Math.random() * 6, [0.6, 4, 0.6]); }
  for (const [x, z] of [[-14, -9], [14, 9], [-14, 9], [14, -9], [-30, -26], [30, 26]]) piece('lamp_post', x, z, 0, [0.3, 4.5, 0.3]);
  for (const [x, z, r] of [[-22, 27, Math.PI], [22, -27, 0]]) piece('metro_arch', x, z, r, [4, 3.5, 0.4]);
  for (const [x, z] of [[-34, 24], [-31, 26], [-34, 28], [-37, 26]]) { piece('cafe_table', x, z, 0, [0.6, 0.75, 0.6]); piece('cafe_chair', x + 0.8, z, -Math.PI / 2, [0.45, 0.9, 0.45]); }
  for (const [x, z, r] of [[-26, -8, 0.3], [24, 14, -0.4], [10, -22, 1.2], [-12, 22, 2.4], [32, -6, 0.9]]) piece(Math.random() > 0.5 ? 'pallet_stack' : 'crowd_barrier', x, z, r, [2.4, 1.2, 1]);
  for (const [x, z] of [[-30, 0], [30, -18]]) piece('bench', x, z, Math.PI / 2, [2, 0.9, 0.6]);
  const props = [];
  for (const [file, x, z, r] of [['car', -25, 10, 0.5], ['car', 28, -12, 2.2], ['dumpster', 36, 22, 0], ['dumpster', -38, -22, 1.6]]) {
    const g = (await loader.loadAsync(`assets/${file}.glb`)).scene;
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (file === 'car') { o.material = o.material.clone(); o.material.color.multiplyScalar(0.18); o.material.roughness = 1; } worldMeshes.push(o); } });
    g.position.set(x, 0, z); g.rotation.y = r; root.add(g); g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    colliders.add(new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.85, size.y, size.z * 0.85).translate(c.x, c.y, c.z)));
    if (file === 'car') props.push(new THREE.Vector3(x, 1, z));
  }
  OBSTACLES.push({ x: -25, z: 10, r: 2.6 }, { x: 28, z: -12, r: 2.6 });

  // Wall-buy chalk outline.
  const chalk = plane(chalkGunTex(`SHOTGUN · ${WALLBUY.price}`), 2.4, 1.2, WALLBUY.pos.x, WALLBUY.pos.y, WALLBUY.pos.z, Math.PI / 2, true);
  chalk.material.depthWrite = false;

  // Fire + smoke particles (burning cars and columns behind the rooftops).
  const smokeTex = softDotTex('rgba(40,40,44,.9)', 'rgba(40,40,44,0)'), fireTex = softDotTex('rgba(255,180,60,1)', 'rgba(255,60,0,0)');
  const emitters = [...props.map(p => ({ p, fire: true })), { p: new THREE.Vector3(-70, 15, -55) }, { p: new THREE.Vector3(35, 15, -75) }, { p: new THREE.Vector3(80, 15, 40) }];
  const parts = [];
  for (const e of emitters) for (let i = 0; i < (e.fire ? 26 : 30); i++) {
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: e.fire && i < 10 ? fireTex : smokeTex, transparent: true, depthWrite: false, blending: e.fire && i < 10 ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true }));
    sm.userData = { e, fire: e.fire && i < 10, t: Math.random() }; root.add(sm); parts.push(sm);
  }
  function updateParticles(dt) {
    for (const s of parts) {
      const u = s.userData; u.t += dt * (u.fire ? 1.4 : 0.12); if (u.t > 1) u.t -= 1;
      const big = u.e.fire ? 1 : 6, rise = u.fire ? 2.5 : u.e.fire ? 9 : 45;
      s.position.set(u.e.p.x + Math.sin(u.t * 7 + u.e.p.z) * big * 0.3 + u.t * big * 1.2, u.e.p.y + u.t * rise, u.e.p.z + Math.cos(u.t * 5) * big * 0.3);
      s.scale.setScalar((u.fire ? 1.4 - u.t : 0.6 + u.t * 2.2) * big * (u.fire ? 1 : 1.4));
      s.material.opacity = u.fire ? 1 - u.t : Math.sin(u.t * Math.PI) * 0.75;
    }
  }

  colliders.visible = false;
  colliders.updateMatrixWorld(true);
  ctx.octree.fromGraphNode(colliders);
  return {
    worldMeshes, updateParticles,
    openGate() {
      gate.visible = false; colliders.remove(gateBlock);
      const gateMeshes = new Set(); gate.traverse(o => gateMeshes.add(o));
      for (let i = worldMeshes.length - 1; i >= 0; i--) if (gateMeshes.has(worldMeshes[i])) worldMeshes.splice(i, 1);
      // Rebuild collisions without the gate (gate pieces' own colliders are removed with it).
      for (let i = colliders.children.length - 1; i >= 0; i--) { const c = colliders.children[i]; if (c.userData.gate) colliders.remove(c); }
      ctx.octree = new Octree(); ctx.octree.fromGraphNode(colliders);
    },
  };
}

function rep(t, n, srgb) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
