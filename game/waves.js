// Waves, points and purchases. Scaling formulas copied from Gauthambinoy20/warzone
// src/game-logic.js (MIT): enemiesPerWave() L261, waveSpeedMult() L266, ENEMY_UNLOCK_WAVE L308,
// unlockedEnemyTypes() L328, ENEMY_PAYOUT L337 (types renamed, values retuned).
import { TYPES } from './enemies.js';
import { WALLBUY, GATE } from './world.js';

export const enemiesPerWave = wave => Math.floor(4 + wave * 2);
export const waveSpeedMult = wave => Math.min(1.4, 1 + wave * 0.05);
const ENEMY_UNLOCK_WAVE = { runner: 1, thrower: 2, heavy: 3 };
const WEIGHT = { runner: 6, thrower: 2, heavy: 2 };
export const unlockedEnemyTypes = wave => Object.keys(ENEMY_UNLOCK_WAVE).filter(t => wave >= ENEMY_UNLOCK_WAVE[t]);
const MAX_ALIVE = 14, BREAK = 6;

export function createWaves(ctx) {
  const { hud, audio } = ctx;
  const w = {
    wave: 0, score: 0, points: 0, kills: 0, toSpawn: 0, spawnT: 0, breakT: 0, gateOpen: false, nearby: null,
    hpMult: () => 1 + Math.max(0, w.wave - 5) * 0.08,
    speedMult: () => waveSpeedMult(w.wave),
    reset() {
      Object.assign(w, { wave: 0, score: 0, points: 500, kills: 0, toSpawn: 0, spawnT: 0, breakT: 2, gateOpen: false });
      hud.setPoints(w.points); hud.setWave(''); hud.prompt('');
    },
    onHit() { w.add(10); },
    onKill(type, head) { w.kills++; w.add(TYPES[type].points + (head ? 30 : 0)); w.score += TYPES[type].points * 10; },
    add(n) { w.points += n; w.score += n; hud.setPoints(w.points); hud.popup(`+${n}`); },
    pickType() {
      const types = unlockedEnemyTypes(w.wave), total = types.reduce((s, t) => s + WEIGHT[t], 0);
      let r = Math.random() * total;
      for (const t of types) if ((r -= WEIGHT[t]) < 0) return t;
      return 'runner';
    },
    interact() {
      const n = w.nearby; if (!n) return;
      if (w.points < n.price) { audio.denied(); return; }
      if (n.kind === 'wallbuy') { w.points -= n.price; ctx.weapons.give('shotgun'); }
      if (n.kind === 'gate') { w.points -= n.price; w.gateOpen = true; ctx.world.openGate(); hud.banner('RUE OUVERTE', 2); }
      hud.setPoints(w.points); audio.buy();
    },
    update(dt) {
      // Purchase prompts.
      const p = ctx.camera.position;
      w.nearby = null;
      if (p.distanceTo(WALLBUY.pos) < 2.6) w.nearby = { kind: 'wallbuy', price: ctx.weapons.owns('shotgun') ? 250 : WALLBUY.price, label: ctx.weapons.owns('shotgun') ? 'shotgun ammo' : 'SHOTGUN' };
      else if (!w.gateOpen && Math.hypot(p.x - GATE.pos.x, p.z - GATE.pos.z) < 4) w.nearby = { kind: 'gate', price: GATE.price, label: 'clear the barricade' };
      hud.prompt(w.nearby ? `Press F: ${w.nearby.label} [${w.nearby.price}]` : '');

      // Wave flow.
      if (w.toSpawn <= 0 && ctx.enemies.alive() === 0) {
        if (w.breakT <= 0) {
          w.breakT = BREAK; hud.setLeft(0);
          if (w.wave > 0) { ctx.weapons.refill('rifle', 90); ctx.weapons.refill('shotgun', 12); hud.banner('WAVE CLEARED · AMMO', 2.5); }
        }
        if ((w.breakT -= dt) <= 0) {
          w.wave++; w.toSpawn = enemiesPerWave(w.wave); w.spawnT = 0.5;
          hud.setWave(w.wave); hud.banner(`WAVE ${w.wave}`); audio.waveStart();
        }
        return;
      }
      hud.setLeft(w.toSpawn + ctx.enemies.alive());
      w.spawnT -= dt;
      if (w.toSpawn > 0 && w.spawnT <= 0 && ctx.enemies.alive() < MAX_ALIVE) {
        ctx.enemies.spawn(w.pickType(), w.gateOpen); w.toSpawn--; w.spawnT = Math.max(0.35, 1.1 - w.wave * 0.06);
      }
      if (ctx.player.hp < 30 && Math.floor(ctx.now) !== w._hb) { w._hb = Math.floor(ctx.now); audio.heartbeat(); }
    },
  };
  return w;
}
