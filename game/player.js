// Player movement and collisions, adapted from three.js examples/games_fps.html (MIT):
// GRAVITY, STEPS_PER_FRAME, playerCollisions(), updatePlayer(), getForward/SideVector(), controls().
import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';

const GRAVITY = 30;
export const STEPS_PER_FRAME = 5;
const STAND = 1.1, CROUCH = 0.6, RADIUS = 0.35;
const ACCEL = { walk: 25, sprint: 40, crouch: 13, air: 8 };

export function createPlayer(ctx) {
  const { camera, keys } = ctx;
  const collider = new Capsule(new THREE.Vector3(0, RADIUS, 0), new THREE.Vector3(0, RADIUS + STAND, 0), RADIUS);
  const vel = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let onFloor = false;
  let height = STAND;

  const p = {
    collider, vel, hp: 100, maxHp: 100, lastHit: -99, alive: true,
    sprinting: false, crouching: false, moving: false, sens: 1,

    spawn(pos) {
      collider.start.set(pos.x, RADIUS, pos.z);
      collider.end.set(pos.x, RADIUS + STAND, pos.z);
      vel.set(0, 0, 0);
      camera.rotation.set(0, pos.yaw || 0, 0);
      p.hp = p.maxHp; p.alive = true; p.lastHit = -99;
      camera.position.copy(collider.end);
    },

    look(dx, dy) {
      camera.rotation.y -= dx * 0.0022 * p.sens;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0022 * p.sens, -1.45, 1.45);
    },

    damage(n, now) {
      if (!p.alive) return;
      p.hp -= n; p.lastHit = now;
      ctx.hud.flashDamage(n);
      ctx.audio.hurt();
      if (p.hp <= 0) { p.hp = 0; p.alive = false; ctx.onPlayerDeath(); }
    },

    update(dt, now) {
      // Crouch: shrink the capsule from the top.
      p.crouching = !!keys.KeyC;
      const target = p.crouching ? CROUCH : STAND;
      height += (target - height) * Math.min(1, dt * 12);
      collider.end.copy(collider.start).y += height;

      p.sprinting = !!keys.ShiftLeft && !!keys.KeyW && !p.crouching && !ctx.weapons.ads;
      const a = !onFloor ? ACCEL.air : p.crouching ? ACCEL.crouch : p.sprinting ? ACCEL.sprint : ACCEL.walk;
      const sd = dt * a;
      if (keys.KeyW) vel.add(forward().multiplyScalar(sd));
      if (keys.KeyS) vel.add(forward().multiplyScalar(-sd));
      if (keys.KeyA) vel.add(side().multiplyScalar(-sd));
      if (keys.KeyD) vel.add(side().multiplyScalar(sd));
      if (onFloor && keys.Space) vel.y = 9;

      let damping = Math.exp(-4 * dt) - 1;
      if (!onFloor) { vel.y -= GRAVITY * dt; damping *= 0.1; }
      vel.addScaledVector(vel, damping);
      collider.translate(vel.clone().multiplyScalar(dt));
      collisions();
      camera.position.copy(collider.end);
      p.moving = onFloor && Math.hypot(vel.x, vel.z) > 1;

      if (collider.end.y < -20) p.spawn({ x: 0, z: 20 });
      if (p.alive && now - p.lastHit > 5) p.hp = Math.min(p.maxHp, p.hp + 20 * dt);
    },

    speed() { return Math.hypot(vel.x, vel.z); },
  };

  function collisions() {
    const result = ctx.octree.capsuleIntersect(collider);
    onFloor = false;
    if (result) {
      onFloor = result.normal.y > 0;
      if (!onFloor) vel.addScaledVector(result.normal, -result.normal.dot(vel));
      if (result.depth >= 1e-10) collider.translate(result.normal.multiplyScalar(result.depth));
    }
  }
  function forward() { camera.getWorldDirection(dir); dir.y = 0; return dir.normalize(); }
  function side() { camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); return dir.cross(camera.up); }

  return p;
}
