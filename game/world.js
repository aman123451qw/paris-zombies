// Place de la République-style map. Street furniture from assets/paris_kit (Blender, B1); facades,
// roofs and skyline from the Higgsfield texture pack; road/sidewalk/plaza textures from Poly Haven (CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plaqueTex, chalkGunTex, softDotTex, signTex } from './textures.js';

export const HALF_X = 45, HALF_Z = 35;
const PLAZA_X = 30, PLAZA_Z = 20, WALK = 4.5, STREET = 48;
export const SPAWNS = [new THREE.Vector3(0, 0, -HALF_Z - 30), new THREE.Vector3(0, 0, HALF_Z + 30), new THREE.Vector3(-HALF_X - 30, 0, 1),
  new THREE.Vector3(-6, 0, 15), new THREE.Vector3(6, 0, -15)];
export const SIDE_SPAWN = new THREE.Vector3(HALF_X + 30, 0, 1);
export const WALLBUY = { pos: new THREE.Vector3(-HALF_X + 0.6, 1.8, 16), price: 750 };
export const GATE = { pos: new THREE.Vector3(HALF_X + 3, 0, 1), price: 1000 };
export const OBSTACLES = [{ x: 0, z: 0, r: 8.5 }];

const loader = new GLTFLoader();
const tex = new THREE.TextureLoader();
const texCache = {};
function T(name, srgb = true) {
  if (!texCache[name]) { const t = tex.load(`assets/tex/${name}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; texCache[name] = t; }
  return texCache[name];
}
function tiled(name, w, d, tile, normal) {
  const map = T(name + '_diffuse').clone(); map.repeat.set(w / tile, d / tile); map.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  if (normal) { m.normalMap = T(name + '_nor_gl', false).clone(); m.normalMap.repeat.copy(map.repeat); m.normalMap.needsUpdate = true; }
  return m;
}

export async function buildWorld(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(), colliders = new THREE.Group();
  scene.add(root); scene.add(colliders);
  let kit = null;
  try { kit = (await loader.loadAsync('assets/paris_kit.gltf.json')).scene; } catch { console.warn('paris_kit missing, using boxes'); }
  const box = (w, h, d, x, y, z) => colliders.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y, z)));

  // Sky, haze, sun.
  const sky = await tex.loadAsync('assets/tex/sky.jpg'); sky.colorSpace = THREE.SRGBColorSpace; sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky; scene.environment = sky; scene.environmentIntensity = 0.8;
  scene.fog = new THREE.Fog(0xc8ccd0, 70, 200);
  const sun = new THREE.DirectionalLight(0xffeccc, 2.8);
  sun.position.set(-40, 55, 35); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 220 });
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.layers.enableAll(); scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xdde6f0, 0x6e6455, 0.7); hemi.layers.enableAll(); scene.add(hemi);

  // Skyline ring: distant Paris rooftops visible down every street.
  const band = T('skyline_band').clone(); band.wrapS = THREE.MirroredRepeatWrapping; band.repeat.set(3, 1); band.needsUpdate = true;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 34, 64, 1, true), new THREE.MeshBasicMaterial({ map: band, side: THREE.BackSide, fog: false }));
  ring.position.y = 12; scene.add(ring);

  // Ground: asphalt everywhere, pale stone plaza, sidewalks along the buildings, granite kerbs.
  const flat = (mat, w, d, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat); m.position.set(x, y, z); m.receiveShadow = true; root.add(m); return m; };
  const ground = flat(tiled('worn_asphalt', 260, 260, 6, true), 260, 260, 0, 0, 0); ground.material.color.set(0x8f9296);
  flat(tiled('rectangular_paving', PLAZA_X * 2, PLAZA_Z * 2, 3, true), PLAZA_X * 2, PLAZA_Z * 2, 0, 0, 0.02);
  box(260, 1, 260, 0, -0.5, 0);
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.8 });
  const kerb = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), kerbMat); m.position.set(x, 0.07, z); m.receiveShadow = true; root.add(m); };
  const walkMat = (w, d) => tiled('pavement_02', w, d, 2.5, false);
  function sidewalk(w, d, x, z) { flat(walkMat(w, d), w, d, x, z, 0.03); }
  kerb(PLAZA_X * 2, 0.3, 0, -PLAZA_Z); kerb(PLAZA_X * 2, 0.3, 0, PLAZA_Z); kerb(0.3, PLAZA_Z * 2, -PLAZA_X, 0); kerb(0.3, PLAZA_Z * 2, PLAZA_X, 0);
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 });
  const stripe = (w, d, x, z) => flat(white, w, d, x, z, 0.025);
  function zebra(x, z, alongX, len) { for (let i = -len / 2; i < len / 2; i += 1.1) alongX ? stripe(0.55, 3, x + i, z) : stripe(3, 0.55, x, z + i); }

  // Facade modules: 6 m wide slab, Higgsfield facade texture on the front (2 modules per texture), zinc roof + chimneys.
  const facadeMats = ['facade_boulangerie', 'facade_telephone', 'facade_cafe', 'facade_pharmacie'].map(n => new THREE.MeshStandardMaterial({ map: T(n), roughness: 0.9 }));
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcfc2a6, roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ map: T('roof_face'), roughness: 0.6, metalness: 0.3 });
  const zincMat = new THREE.MeshStandardMaterial({ color: 0x6f767c, roughness: 0.6, metalness: 0.4 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x9a5a40, roughness: 0.9 }), potMat = new THREE.MeshStandardMaterial({ color: 0xb5653a, roughness: 0.8 });
  const uvSlice = (geo, u0, u1) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0)); return geo; };
  let mod = 0;
  function facade(x, z, rot) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
    const add = (geo, mat, px, py, pz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; m.castShadow = m.receiveShadow = true; g.add(m); };
    const pair = Math.floor(mod / 2), half = mod % 2;
    add(new THREE.BoxGeometry(6, 18, 0.9), stoneMat, 0, 9, -0.05);
    add(uvSlice(new THREE.PlaneGeometry(6, 18), half * 0.5, half * 0.5 + 0.5), facadeMats[(pair * 3 + 1) % 4], 0, 9, 0.505);
    const d = mod % 5; add(uvSlice(new THREE.PlaneGeometry(6, 4.6), d / 5, d / 5 + 0.2), roofMat, 0, 20.1, -0.3, -0.42);
    add(new THREE.BoxGeometry(6, 4.2, 3.4), zincMat, 0, 20.1, -2.4);
    if (mod % 2 === 0) { add(new THREE.BoxGeometry(1.4, 2, 0.8), brickMat, 1.5, 23, -2.6); for (const px of [1.1, 1.5, 1.9]) add(new THREE.CylinderGeometry(0.13, 0.15, 0.6, 8), potMat, px, 24.3, -2.6); }
    root.add(g); g.updateMatrixWorld(true);
    const c = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 4)); c.position.set(0, 11, -1.5); g.add(c); c.updateMatrixWorld(true);
    const cw = new THREE.Mesh(c.geometry); cw.applyMatrix4(c.matrixWorld); colliders.add(cw); g.remove(c);
    mod++;
  }

  // Square ring of buildings with 3 street mouths (N, S, W) and the unlockable east street.
  const sides = [{ ax: 'x', f: -HALF_Z, rot: 0, len: HALF_X }, { ax: 'x', f: HALF_Z, rot: Math.PI, len: HALF_X },
    { ax: 'z', f: -HALF_X, rot: Math.PI / 2, len: HALF_Z }, { ax: 'z', f: HALF_X, rot: -Math.PI / 2, len: HALF_Z }];
  for (const s of sides) for (let t = -s.len + 3; t <= s.len - 3; t += 6) {
    if (s.ax === 'x' ? Math.abs(t) < 9 : (t > -6 && t < 8)) continue;
    s.ax === 'x' ? facade(t, s.f, s.rot) : facade(s.f, t, s.rot);
  }
  sidewalk(HALF_X * 2, WALK, 0, -HALF_Z + 0.5 + WALK / 2); sidewalk(HALF_X * 2, WALK, 0, HALF_Z - 0.5 - WALK / 2);
  sidewalk(WALK, HALF_Z * 2 - 2 * WALK, -HALF_X + 0.5 + WALK / 2, 0); sidewalk(WALK, HALF_Z * 2 - 2 * WALK, HALF_X - 0.5 - WALK / 2, 0);
  const ik = 0.5 + WALK; kerb(HALF_X * 2, 0.3, 0, -HALF_Z + ik); kerb(HALF_X * 2, 0.3, 0, HALF_Z - ik); kerb(0.3, HALF_Z * 2, -HALF_X + ik, 0); kerb(0.3, HALF_Z * 2, HALF_X - ik, 0);
  // Zebra crossings from the sidewalks to the plaza, and lane dashes round the ring.
  for (const x of [-20, 0, 20]) { zebra(x, -PLAZA_Z - 5, false, 8); zebra(x, PLAZA_Z + 5, false, 8); }
  for (const z of [-10, 10]) { zebra(-PLAZA_X - 5, z, true, 8); zebra(PLAZA_X + 5, z, true, 8); }
  for (let x = -38; x <= 38; x += 4) { stripe(2, 0.15, x, -PLAZA_Z - 5.25); stripe(2, 0.15, x, PLAZA_Z + 5.25); }
  for (let z = -26; z <= 26; z += 4) { stripe(0.15, 2, -PLAZA_X - 5.25, z); stripe(0.15, 2, PLAZA_X + 5.25, z); }

  // Streets leading out of the square, lined with buildings and ending in the skyline haze.
  function street(axis, sign) {
    const m0 = axis === 'z' ? HALF_Z : HALF_X;
    for (let k = 0; k < STREET / 6; k++) {
      const out = sign * (m0 + 3 + k * 6);
      if (axis === 'z') { facade(-12, out, Math.PI / 2); facade(12, out, -Math.PI / 2); }
      else { facade(out, -9, 0); facade(out, 11, Math.PI); }
    }
    const mid = sign * (m0 + STREET / 2);
    if (axis === 'z') { sidewalk(WALK, STREET, -9.5 + WALK / 2 - 0.25, mid); sidewalk(WALK, STREET, 9.5 - WALK / 2 + 0.25, mid); for (let o = 4; o < STREET; o += 4) stripe(0.15, 2, 0, sign * (m0 + o)); }
    else { sidewalk(STREET, WALK, mid, -8.5 + WALK / 2 - 0.5); sidewalk(STREET, WALK, mid, 10.5 - WALK / 2 + 0.5); for (let o = 4; o < STREET; o += 4) stripe(2, 0.15, sign * (m0 + o), 1); }
  }
  street('z', -1); street('z', 1); street('x', -1); street('x', 1);
  // Player stays in the square + the first stretch of each street (enemies walk straight through these).
  box(24, 10, 1, 0, 5, -HALF_Z - 14); box(24, 10, 1, 0, 5, HALF_Z + 14); box(1, 10, 22, -HALF_X - 14, 5, 1); box(1, 10, 22, HALF_X + 36, 5, 1);
  for (const [x, z, r] of [[-4, -HALF_Z - 12, 0], [4, HALF_Z + 12, Math.PI], [-HALF_X - 12, 3, Math.PI / 2]]) {
    piece('pallet_stack', x, z, r, [2.4, 1.4, 1.2]); piece('crowd_barrier', x + (r ? 0 : 4), z + (r ? 4 : 0), r, [2.5, 1.1, 0.2]); piece('crowd_barrier', x - (r ? 0 : 4), z - (r ? 4 : 0), r, [2.5, 1.1, 0.2]);
  }
  plane(plaqueTex('RUE DES', 'CROISSANTS'), 1.2, 0.75, -HALF_X + 0.56, 4.6, -7, Math.PI / 2);
  plane(plaqueTex('PLACE DE LA', 'RÉPUBLIQUE'), 1.2, 0.75, -9, 4.6, -HALF_Z + 0.56, 0);

  // East street gate (cleared with points).
  const gate = new THREE.Group(); root.add(gate);
  const gateBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 16).translate(GATE.pos.x, 4, GATE.pos.z)); colliders.add(gateBlock);
  for (const z of [-4, 0, 4]) { const before = colliders.children.length; gate.add(piece('pallet_stack', GATE.pos.x, z + 1, Math.PI / 2, [2.4, 1.4, 1.2])); for (let i = before; i < colliders.children.length; i++) colliders.children[i].userData.gate = true; }

  function piece(name, x, z, rotY = 0, fallback = [2, 2, 2], s = 1) {
    let obj = kit?.getObjectByName(name)?.clone(true);
    if (obj) obj.traverse(o => { if (!o.isMesh) return; if (o.material?.name === 'mat_leaves' && !o.material.userData.tinted) { o.material.color.set(0x8a7f36); o.material.userData.tinted = true; } if (o.material?.name === 'mat_stone' && name === 'monument') o.material.color.set(0xc9bda3); if (o.name.startsWith('col_') || o.material?.name === 'mat_collider') { o.visible = false; o.userData.col = true; } else o.castShadow = o.receiveShadow = true; });
    else { const [w, h, d] = fallback; obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), stoneMat); obj.userData.box = true; }
    obj.position.set(x, 0, z); obj.rotation.y = rotY; obj.scale.setScalar(s); root.add(obj); obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isMesh && (o.userData.col || o.userData.box)) { const c = new THREE.Mesh(o.geometry); c.applyMatrix4(o.matrixWorld); colliders.add(c); } });
    return obj;
  }
  function plane(texture, w, h, x, y, z, rotY, emissive = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent: true, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? texture : null, emissiveIntensity: emissive ? 1.2 : 0 }));
    m.position.set(x, y, z); m.rotation.y = rotY; root.add(m); return m;
  }

  // Plaza: monument, plane trees, metro, benches, barricades.
  piece('monument', 0, 0, 0, [10, 14, 10]);
  for (const z of [-16, 16]) for (const x of [-27, -18, 18, 27]) piece('plane_tree', x, z, Math.random() * 6, [0.6, 4, 0.6]);
  for (const x of [-27, -18, 18, 27]) for (const z of [-HALF_Z + 4.2, HALF_Z - 4.2]) piece('plane_tree', x + 4.5, z, Math.random() * 6, [0.6, 4, 0.6]);
  for (const [x, z, r] of [[-6, 15, Math.PI], [6, -15, 0]]) piece('metro_arch', x, z, r, [4, 3.5, 0.4]);
  for (const [x, z, r] of [[-26, -6, 0.3], [24, 10, -0.4], [12, -12, 1.2], [-12, 12, 2.4], [-24, 8, 0.9], [20, -6, 1.8]]) piece(r > 1 ? 'pallet_stack' : 'crowd_barrier', x, z, r, [2.4, 1.2, 1]);
  for (const [x, z, r] of [[-28.5, 0, Math.PI / 2], [28.5, -6, -Math.PI / 2], [0, -18.5, 0]]) piece('bench', x, z, r, [2, 0.9, 0.6]);
  // Street lamps along the sidewalks, café terrace on the south sidewalk.
  for (let x = -36; x <= 36; x += 12) { piece('lamp_post', x, -HALF_Z + WALK, 0, [0.3, 4.5, 0.3]); piece('lamp_post', x + 6, HALF_Z - WALK, 0, [0.3, 4.5, 0.3]); }
  for (const z of [-24, 24]) { piece('lamp_post', -HALF_X + WALK, z, 0, [0.3, 4.5, 0.3]); piece('lamp_post', HALF_X - WALK, z, 0, [0.3, 4.5, 0.3]); }
  for (const x of [-26, -23.5, -21, -18.5]) { piece('cafe_table', x, HALF_Z - 2.6, 0, [0.6, 0.75, 0.6]); piece('cafe_chair', x - 0.7, HALF_Z - 2.6, Math.PI / 2, [0.45, 0.9, 0.45]); piece('cafe_chair', x + 0.7, HALF_Z - 2.6, -Math.PI / 2, [0.45, 0.9, 0.45]); }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(11, 0.15, 2.6), new THREE.MeshStandardMaterial({ color: 0x1f4a33, roughness: 0.8 }));
  awning.position.set(-22, 3.4, HALF_Z - 1.8); awning.rotation.x = -0.18; awning.castShadow = true; root.add(awning);

  // Potelets (Paris bollards) along the plaza and sidewalk edges, as one instanced mesh.
  const potGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8).translate(0, 0.45, 0);
  const potPts = [];
  for (let x = -PLAZA_X + 1; x <= PLAZA_X - 1; x += 2) if (Math.abs(x) % 20 > 4) potPts.push([x, -PLAZA_Z - 0.4], [x, PLAZA_Z + 0.4]);
  for (let x = -HALF_X + 2; x <= HALF_X - 2; x += 2.5) if (Math.abs(x) > 10) potPts.push([x, -HALF_Z + ik + 0.35], [x, HALF_Z - ik - 0.35]);
  const pots = new THREE.InstancedMesh(potGeo, new THREE.MeshStandardMaterial({ color: 0x2b3f2f, roughness: 0.6, metalness: 0.4 }), potPts.length);
  potPts.forEach(([x, z], i) => pots.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z))); pots.castShadow = true; root.add(pots);

  // Morris columns and green Vigipirate bins.
  const morrisTex = signTex('THÉÂTRE · CINÉMA · CONCERT', '#e9dcb5', '#1d2f4a', 'bold 44px Oswald, sans-serif');
  for (const [x, z] of [[-PLAZA_X + 2, -PLAZA_Z + 2], [PLAZA_X - 2, PLAZA_Z - 2]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const green = new THREE.MeshStandardMaterial({ color: 0x2f5a3c, roughness: 0.6 });
    for (const [geo, mat, y] of [[new THREE.CylinderGeometry(0.85, 0.9, 0.5, 20), green, 0.25], [new THREE.CylinderGeometry(0.75, 0.75, 2.8, 20, 1, true), new THREE.MeshStandardMaterial({ map: morrisTex }), 1.9], [new THREE.CylinderGeometry(0.85, 0.85, 0.2, 20), green, 3.35], [new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), green, 3.45]]) {
      const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m);
    }
    root.add(g); box(1.7, 4, 1.7, x, 2, z); OBSTACLES.push({ x, z, r: 1.2 });
  }
  const binMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.5 });
  for (const [x, z] of [[-PLAZA_X + 0.8, 6], [PLAZA_X - 0.8, -6], [10, -PLAZA_Z + 0.8], [-34, -HALF_Z + 5.4], [30, HALF_Z - 5.4]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 12, 1, true).translate(0, 0.65, 0), binMat); b.position.set(x, 0, z); b.castShadow = true; root.add(b);
  }

  // Cars: two burnt wrecks in the plaza, normal cars parked at the kerbs.
  const props = [];
  const carScene = (await loader.loadAsync('assets/car.gltf.json')).scene, dumpScene = (await loader.loadAsync('assets/dumpster.gltf.json')).scene;
  for (const [src, x, z, r, burnt] of [[carScene, -22, 4, 0.5, true], [carScene, 22, -10, 2.2, true], [carScene, -HALF_X + ik + 1.4, -20, 0, false], [carScene, -HALF_X + ik + 1.4, 22, Math.PI, false],
    [carScene, HALF_X - ik - 1.4, 20, Math.PI, false], [carScene, 10, HALF_Z - ik - 1.4, Math.PI / 2, false], [carScene, -30, -HALF_Z + ik + 1.4, -Math.PI / 2, false],
    [dumpScene, 33, HALF_Z - ik - 1.4, 0, false], [dumpScene, -38, -HALF_Z + ik + 1.5, 1.6, false]]) {
    const g = src.clone(true);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (burnt) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.16); o.material.roughness = 1; } } });
    g.position.set(x, 0, z); g.rotation.y = r; root.add(g); g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    box(size.x * 0.85, size.y, size.z * 0.85, c.x, c.y, c.z); OBSTACLES.push({ x, z, r: 2.4 });
    if (burnt) props.push(new THREE.Vector3(x, 1, z));
  }

  // Wall-buy chalk outline on the west facade.
  const chalk = plane(chalkGunTex(`SHOTGUN · ${WALLBUY.price}`), 2.4, 1.2, WALLBUY.pos.x, WALLBUY.pos.y, WALLBUY.pos.z, Math.PI / 2, true);
  chalk.material.depthWrite = false;

  // Fire + smoke particles (burning cars, plus columns rising behind the rooftops).
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

  // Merge static scenery by material; the gate stays separate so it can be removed.
  const keep = new Set([ground]); gate.traverse(o => keep.add(o));
  const merged = mergeStatic(root, keep);
  const worldMeshes = [ground, ...merged]; gate.traverse(o => { if (o.isMesh && o.visible) worldMeshes.push(o); });
  colliders.visible = false;
  colliders.updateMatrixWorld(true);
  ctx.octree.fromGraphNode(colliders);
  return {
    worldMeshes, updateParticles,
    openGate() {
      gate.visible = false; colliders.remove(gateBlock);
      const gateMeshes = new Set(); gate.traverse(o => gateMeshes.add(o));
      for (let i = worldMeshes.length - 1; i >= 0; i--) if (gateMeshes.has(worldMeshes[i])) worldMeshes.splice(i, 1);
      for (let i = colliders.children.length - 1; i >= 0; i--) if (colliders.children[i].userData.gate) colliders.remove(colliders.children[i]);
      ctx.octree = new Octree(); ctx.octree.fromGraphNode(colliders);
    },
  };
}

function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const groups = new Map(), done = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || keep.has(o) || Array.isArray(o.material)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    if (!groups.has(o.material.uuid)) groups.set(o.material.uuid, { mat: o.material, geos: [] });
    groups.get(o.material.uuid).geos.push(g); done.push(o);
  });
  for (const o of done) o.removeFromParent();
  const out = [];
  for (const { mat, geos } of groups.values()) {
    const geo = mergeGeometries(geos, false); if (!geo) continue;
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; root.add(m); out.push(m);
  }
  return out;
}
