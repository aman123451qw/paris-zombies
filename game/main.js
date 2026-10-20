import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { createPlayer, STEPS_PER_FRAME } from './player.js';
import { createWeapons } from './weapons.js';
import { createHud } from './hud.js';
import { audio } from './audio.js';
import { buildWorld } from './world.js';
import { createEnemies } from './enemies.js';
import { createWaves } from './waves.js';
import { softDotTex } from './textures.js';
import { buildRiot } from './riot.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.autoClear = false; renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ'; scene.add(camera);
const vmLight = new THREE.DirectionalLight(0xffffff, 1.4); vmLight.position.set(1, 2, 1); vmLight.layers.set(1); camera.add(vmLight);
const vmAmb = new THREE.AmbientLight(0xffffff, 0.8); vmAmb.layers.set(1); scene.add(vmAmb);

const keys = {};
const ctx = { scene, camera, renderer, keys, audio, octree: new Octree(), hitTargets: [], worldMeshes: [], now: 0, state: 'loading' };
ctx.hud = createHud();
ctx.player = createPlayer(ctx);

// Simple FX: impact puffs + camera shake.
const puffTex = softDotTex('rgba(200,195,185,.9)', 'rgba(200,195,185,0)');
const puffs = [];
ctx.fx = {
  impact(p, color = 0xd8d0c0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false }));
    s.position.copy(p); s.scale.setScalar(0.25); s.userData.t = 0; scene.add(s); puffs.push(s);
  },
};
let shakeAmt = 0;
ctx.shake = a => { shakeAmt = Math.min(0.12, shakeAmt + a); };

const $ = id => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);

async function boot() {
  $('playBtn').textContent = 'LOADING…'; $('playBtn').disabled = true;
  const world = await buildWorld(ctx);
  ctx.world = world;
  ctx.worldMeshes = world.worldMeshes;
  ctx.riot = buildRiot(ctx);
  ctx.weapons = await createWeapons(ctx);
  ctx.enemies = await createEnemies(ctx);
  ctx.waves = createWaves(ctx);
  ctx.player.spawn({ x: 0, z: 22, yaw: 0 });
  $('playBtn').textContent = 'PLAY'; $('playBtn').disabled = false;
  ctx.state = 'menu';
}

function start() {
  audio.init(); audio.startAmbience();
  if (ctx.state === 'dead' || ctx.state === 'menu') {
    ctx.enemies.reset(); ctx.weapons.reset(); ctx.waves.reset(); ctx.player.spawn({ x: 0, z: 22, yaw: 0 });
  }
  ctx.state = 'playing'; show('start', false); show('dead', false); show('paused', false);
  renderer.domElement.requestPointerLock();
}
ctx.onPlayerDeath = () => {
  ctx.state = 'dead'; document.exitPointerLock();
  $('deadStats').textContent = `Wave ${ctx.waves.wave} · ${ctx.waves.kills} down · ${ctx.waves.score} pts`;
  show('dead', true);
};
$('playBtn').onclick = start; $('againBtn').onclick = start;
$('resumeBtn').onclick = () => { ctx.state = 'playing'; show('paused', false); renderer.domElement.requestPointerLock(); };

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && ctx.state === 'playing') { ctx.state = 'paused'; show('paused', true); ctx.weapons.firing = false; }
});
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (ctx.state !== 'playing') return;
  if (e.code === 'KeyR') ctx.weapons.reload();
  if (e.code === 'KeyV') ctx.weapons.melee(ctx.now);
  if (e.code === 'KeyF') ctx.waves.interact();
  if (e.code === 'Digit1') ctx.weapons.switchTo('rifle');
  if (e.code === 'Digit2') ctx.weapons.switchTo('shotgun');
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('mousedown', e => {
  if (ctx.state !== 'playing' || !document.pointerLockElement) return;
  if (e.button === 0) ctx.weapons.firing = true;
  if (e.button === 2) ctx.weapons.aiming = true;
});
document.addEventListener('mouseup', e => { if (e.button === 0) ctx.weapons.firing = false; if (e.button === 2) ctx.weapons.aiming = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => { if (document.pointerLockElement && ctx.state === 'playing') ctx.player.look(e.movementX, e.movementY); });
document.addEventListener('wheel', () => { if (ctx.state === 'playing') ctx.weapons.switchTo(ctx.weapons.current === 'rifle' ? 'shotgun' : 'rifle'); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// F3 frame counter for perf checks.
const fpsEl = Object.assign(document.createElement('div'), { className: 'hud', style: 'right:10px;top:8px;font-size:14px;display:none' });
document.body.appendChild(fpsEl);
addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none'; } });
let frames = 0, fpsT = 0, stepT = 0;

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  if (ctx.state === 'playing') {
    ctx.now += dt;
    for (let i = 0; i < STEPS_PER_FRAME; i++) ctx.player.update(dt / STEPS_PER_FRAME, ctx.now);
    ctx.weapons.update(dt, ctx.now);
    ctx.enemies.update(dt, ctx.now);
    ctx.waves.update(dt, ctx.now);
    if (ctx.player.moving && (stepT -= dt * (ctx.player.sprinting ? 1.5 : 1)) <= 0) { stepT = 0.42; audio.step(ctx.player.sprinting); }
  }
  ctx.world?.updateParticles(dt); ctx.riot?.update(dt);
  for (let i = puffs.length - 1; i >= 0; i--) {
    const s = puffs[i]; s.userData.t += dt * 2.5; s.scale.setScalar(0.25 + s.userData.t * 0.6); s.material.opacity = 1 - s.userData.t;
    if (s.userData.t >= 1) { scene.remove(s); s.material.dispose(); puffs.splice(i, 1); }
  }
  ctx.hud.update(dt, ctx.player.hp, ctx.player.maxHp);

  const sx = (Math.random() - 0.5) * shakeAmt, sy = (Math.random() - 0.5) * shakeAmt;
  camera.rotation.x += sy; camera.rotation.y += sx; shakeAmt *= Math.exp(-14 * dt);
  renderer.info.reset(); renderer.clear();
  camera.layers.set(0); renderer.render(scene, camera);
  const bg = scene.background; scene.background = null;
  renderer.clearDepth(); camera.layers.set(1); renderer.render(scene, camera);
  scene.background = bg; camera.layers.set(0);
  camera.rotation.x -= sy; camera.rotation.y -= sx;

  frames++; if ((fpsT += dt) > 0.5) { fpsEl.textContent = `${Math.round(frames / fpsT)} fps · ${renderer.info.render.calls} calls`; frames = 0; fpsT = 0; }
});

window.__ctx = ctx; // for headless QA
boot();
