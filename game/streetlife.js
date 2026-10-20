// Street life: police roadblocks with flashing lights, burning/overturned/abandoned cars, animated
// protesters milling behind each barricade, and crowd cut-outs (Higgsfield) filling the streets.
// Background only: nothing here is in ctx.hitTargets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { softDotTex } from './textures.js';
import { HALF_X, HALF_Z, OBSTACLES } from './world.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const loader = new GLTFLoader();

function policeDecal() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1b3f9c'; g.fillRect(0, 22, 512, 52); g.fillStyle = '#d8262b'; g.fillRect(0, 74, 512, 8);
  g.fillStyle = '#fff'; g.font = 'bold 50px Oswald, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('POLICE', 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function buildStreetLife(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const car = (await loader.loadAsync('assets/car.gltf.json')).scene;
  const fireTex = softDotTex('rgba(255,190,80,1)', 'rgba(255,60,0,0)'), smokeTex = softDotTex('rgba(40,39,41,.85)', 'rgba(40,39,41,0)');
  const decalMat = new THREE.MeshStandardMaterial({ map: policeDecal(), roughness: 0.5 });
  const whiteBody = new THREE.MeshStandardMaterial({ color: 0xf1f1ef, roughness: 0.35, metalness: 0.3 });
  const blueOn = new THREE.MeshBasicMaterial({ color: 0x2f6bff }), blueOff = new THREE.MeshBasicMaterial({ color: 0x0b1b44 });
  const sprites = [], flashers = [], walkers = [];

  function placeCar(x, z, rot, { police = false, burnt = false, flipped = false } = {}) {
    const g = car.clone(true);
    g.traverse(o => {
      if (!o.isMesh) return; o.castShadow = o.receiveShadow = true;
      if (police && o.material.name === 'car_body') o.material = whiteBody;
      if (burnt) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.14); o.material.roughness = 1; o.material.metalness = 0; }
    });
    const holder = new THREE.Group(); holder.add(g); root.add(holder);
    const bb = new THREE.Box3().setFromObject(g); g.position.y = -bb.min.y;
    const top = bb.max.y - bb.min.y;
    if (police) {
      for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), decalMat); d.position.set(0, 0.72, s * 0.945); d.rotation.y = s > 0 ? 0 : Math.PI; holder.add(d); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x222 })); bar.position.set(-0.2, top + 0.05, 0); holder.add(bar);
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.45), blueOff); l.position.set(-0.2, top + 0.14, s * 0.28); l.userData.phase = s > 0 ? 0 : 0.5; holder.add(l); flashers.push(l); }
    }
    if (flipped) { holder.rotation.z = Math.PI; holder.position.y = top; }
    holder.position.x = x; holder.position.z = z; holder.rotation.y = rot;
    OBSTACLES.push({ x, z, r: 2.4 });
    if (burnt) for (let i = 0; i < 8; i++) {
      const flame = i < 3;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flame ? fireTex : smokeTex, transparent: true, depthWrite: false, blending: flame ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.userData = { x: x + rnd(-1, 1), z: z + rnd(-0.6, 0.6), y: top * 0.6, t: Math.random(), flame }; root.add(s); sprites.push(s);
    }
    return holder;
  }

  // Police roadblocks at the far end of each open street, lights flashing.
  const blocks = [[0, -HALF_Z - 41, 0], [0, HALF_Z + 41, 0], [-HALF_X - 41, 1, Math.PI / 2]];
  for (const [x, z, r] of blocks) {
    const across = r === 0;
    placeCar(x + (across ? -3 : 0), z + (across ? 0 : -3), r + 0.35, { police: true });
    placeCar(x + (across ? 3 : 0), z + (across ? 0 : 3), r - 0.35, { police: true });
    const light = new THREE.PointLight(0x3a6cff, 0, 22, 2); light.position.set(x, 2.2, z); root.add(light); flashers.push(light);
  }
  // A police car caught in the square, plus burning, overturned and abandoned cars everywhere.
  placeCar(31, -24, 0.9, { police: true, burnt: true });
  for (const [x, z, r, f] of [[-34, -27, 1.2, false], [36, 12, 2.6, true], [-14, -28, 0.2, true], [16, 28, 2.9, false], [-3, -HALF_Z - 22, 1.4, true], [5, HALF_Z + 24, 0.4, false],
    [-HALF_X - 24, -4, 0.3, false], [HALF_X + 14, -3, 1.7, true], [HALF_X + 24, 5, 0.2, false]]) placeCar(x, z, r, { burnt: true, flipped: f });
  for (const [x, z, r] of [[-6.5, -HALF_Z - 30, Math.PI / 2], [6.5, HALF_Z + 32, -Math.PI / 2], [-HALF_X - 30, -5.5, 0], [HALF_X + 30, 7.5, Math.PI], [-6.5, HALF_Z + 18, Math.PI / 2]]) placeCar(x, z, r);

  // Animated protesters milling behind each barricade (the crew models, slowed to a jog/sway).
  const crews = [];
  for (const t of ['runner', 'heavy', 'thrower']) try { crews.push(await loader.loadAsync(`assets/crew_${t}.gltf.json`)); } catch { /* optional */ }
  const zones = [{ x: 0, z: -HALF_Z - 22, w: 14, d: 10, along: 'x' }, { x: 0, z: HALF_Z + 22, w: 14, d: 10, along: 'x' }, { x: -HALF_X - 22, z: 1, w: 10, d: 14, along: 'z' }];
  if (crews.length) for (const zn of zones) for (let i = 0; i < 6; i++) {
    const src = crews[i % crews.length], m = SkeletonUtils.clone(src.scene);
    const h = new THREE.Box3().setFromObject(src.scene).getSize(new THREE.Vector3()).y || 1.8;
    m.scale.setScalar(rnd(1.65, 1.85) / h); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(m), a = mixer.clipAction(src.animations[0]); a.timeScale = rnd(0.35, 0.6); a.time = Math.random(); a.play();
    m.position.set(zn.x + rnd(-zn.w / 2, zn.w / 2), 0, zn.z + rnd(-zn.d / 2, zn.d / 2)); root.add(m);
    walkers.push({ m, mixer, zn, dir: Math.random() < 0.5 ? 1 : -1, speed: rnd(0.6, 1.4) });
  }

  // Crowd cut-outs layered down each street, facing the square.
  const crowdTex = [];
  for (const n of [1, 2, 3]) try { const t = await new THREE.TextureLoader().loadAsync(`assets/tex/crowd_${n}.webp`); t.colorSpace = THREE.SRGBColorSpace; crowdTex.push(t); } catch { /* optional */ }
  const boards = [];
  if (crowdTex.length) {
    ctx.riot?.crowd && (ctx.riot.crowd.visible = false);
    const layer = (x, z, rotY, w, k) => {
      const t = crowdTex[k % crowdTex.length], ar = t.image.width / t.image.height, h = w / ar;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
      b.position.set(x, 0, z); b.rotation.y = rotY; b.userData.ph = Math.random() * 6; root.add(b); boards.push(b);
    };
    let k = 0;
    for (const d of [21, 26, 31]) { layer(rnd(-2, 2), -HALF_Z - d, 0, 16, k++); layer(rnd(-2, 2), HALF_Z + d, Math.PI, 16, k++); layer(-HALF_X - d, rnd(-1, 3), Math.PI / 2, 16, k++); }
    for (const d of [38, 43]) layer(HALF_X + d, 1, -Math.PI / 2, 16, k++);
  }

  let t = 0;
  return {
    update(dt) {
      t += dt;
      const on = Math.floor(t * 4) % 2 === 0;
      for (const f of flashers) {
        if (f.isLight) f.intensity = on ? 9 : 2;
        else f.material = ((Math.floor(t * 4) + (f.userData.phase ? 1 : 0)) % 2 === 0) ? blueOn : blueOff;
      }
      for (const s of sprites) {
        const u = s.userData; u.t += dt * (u.flame ? 1.5 : 0.25); if (u.t > 1) u.t -= 1;
        s.position.set(u.x + u.t * (u.flame ? 0.2 : 2), u.y + u.t * (u.flame ? 2 : 9), u.z);
        s.scale.setScalar(u.flame ? 1.6 * (1.2 - u.t) : 2.4 * (0.6 + u.t * 2.2));
        s.material.opacity = u.flame ? 1 - u.t : Math.sin(u.t * Math.PI) * 0.7;
      }
      for (const w of walkers) {
        w.mixer.update(dt);
        const p = w.m.position, along = w.zn.along === 'x';
        if (along) { p.x += w.dir * w.speed * dt; if (Math.abs(p.x - w.zn.x) > w.zn.w / 2) w.dir *= -1; w.m.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { p.z += w.dir * w.speed * dt; if (Math.abs(p.z - w.zn.z) > w.zn.d / 2) w.dir *= -1; w.m.rotation.y = w.dir > 0 ? 0 : Math.PI; }
      }
      for (const b of boards) b.position.y = Math.abs(Math.sin(t * 1.6 + b.userData.ph)) * 0.08;
    },
  };
}
