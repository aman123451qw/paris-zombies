// Headless combat QA: run in the page after boot (window.__ctx). Returns a JSON report.
window.__qaCombat = async () => {
  const c = window.__ctx, THREE = c.camera.position.constructor;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const gsleep = async sec => { const t0 = c.now; while (c.now - t0 < sec) await sleep(30); };
  const out = {};
  c.state = 'playing'; document.getElementById('start').classList.add('hidden'); document.getElementById('paused').classList.add('hidden');
  c.waves.reset(); c.waves.breakT = 9999; c.enemies.reset(); c.weapons.reset();
  c.player.spawn({ x: 0, z: 26, yaw: 0 });
  const aimAt = (p, h) => { const d = new THREE(p.x - c.camera.position.x, p.y + h - c.camera.position.y, p.z - c.camera.position.z); c.camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0, 'YXZ'); };
  for (const type of ['runner', 'heavy', 'thrower']) {
    c.enemies.spawn(type, false);
    const e = c.enemies.list.find(x => x.alive);
    e.root.position.set(0, 0, 18); e.def._speed = e.def.speed; e.def.speed = 0; e.entry = null; e.cd = 99;
    const hp0 = e.hp; let shots = 0, hits = 0;
    const before = c.waves.points;
    const t0 = c.now; while (e.alive && c.now - t0 < 30) { aimAt(e.root.position, 1.0); c.weapons.firing = true; await sleep(30); shots++; if (c.weapons.state?.rifle?.ammo === 0) c.weapons.reload(); }
    c.weapons.firing = false; e.def.speed = e.def._speed;
    out[type] = { hp0, killed: !e.alive, gameSecs: +(c.now - t0).toFixed(2), pointsGained: c.waves.points - before };
    c.enemies.reset(); c.weapons.reset();
  }
  // Headshot: aim at head height.
  c.enemies.spawn('runner', false); { const e = c.enemies.list.find(x => x.alive); e.root.position.set(0, 0, 18); e.def.speed = 0; e.cd = 99; e.entry = null;
    const head = e.headBox.getWorldPosition(new THREE()); out.headWorldY = +head.y.toFixed(2); out.rootY = e.root.position.y;
    const hp0 = e.hp; { const t1 = c.now; while (c.now - t1 < 0.12) { aimAt(head, 0); c.weapons.firing = true; await sleep(30); } } c.weapons.firing = false;
    out.headshot = { hp0, hpAfter: e.hp, alive: e.alive }; e.def.speed = 7.5; c.enemies.reset(); }
  // Melee damage: runner next to the player, measure HP over 4 s, then regen over 8 s.
  c.weapons.firing = false; c.enemies.spawn('runner', false); { const e = c.enemies.list.find(x => x.alive); e.root.position.set(0, 0, 24.8); e.entry = null; e.cd = 0;
    const hp = []; for (let i = 0; i < 8; i++) { await gsleep(0.5); hp.push(Math.round(c.player.hp)); }
    out.meleeHp = hp; c.enemies.reset();
    const regen = []; for (let i = 0; i < 8; i++) { await gsleep(1); regen.push(Math.round(c.player.hp)); } out.regenHp = regen; }
  out.now = +c.now.toFixed(1);
  return JSON.stringify(out);
};
