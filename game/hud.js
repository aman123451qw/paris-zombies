// HUD: DOM overlays defined in index.html.
const $ = id => document.getElementById(id);

export function createHud() {
  const el = { hit: $('hitmarker'), wave: $('wave'), points: $('points'), ammo: $('ammo'), weapon: $('weaponName'),
    prompt: $('prompt'), banner: $('banner'), vignette: $('vignette'), popups: $('popups'), hpfill: $('hpfill'), hpnum: $('hpnum'), left: $('left') };
  let hitT = 0, bannerT = 0, dmgFlash = 0;

  return {
    setAmmo(a, r) { el.ammo.innerHTML = `${a} <small>/ ${r}</small>`; },
    setWeapon(n) { el.weapon.textContent = n; },
    setWave(n) { el.wave.textContent = n; },
    setPoints(n) { el.points.textContent = n; },
    setLeft(n) { el.left.textContent = n > 0 ? `${n} LEFT` : ''; },
    hitmarker(head) {
      el.hit.classList.toggle('head', head); el.hit.style.transition = 'none'; el.hit.style.opacity = 1;
      hitT = 0.12;
    },
    popup(text) {
      const d = document.createElement('div'); d.className = 'pop'; d.textContent = text;
      d.style.left = 51 + Math.random() * 4 + '%'; el.popups.appendChild(d); setTimeout(() => d.remove(), 800);
    },
    prompt(text) { el.prompt.style.display = text ? 'block' : 'none'; if (text) el.prompt.textContent = text; },
    banner(text, secs = 2.5) { el.banner.textContent = text; el.banner.style.opacity = 1; bannerT = secs; },
    flashDamage(n) { dmgFlash = Math.min(1, dmgFlash + n / 40); },
    update(dt, hp, maxHp) {
      if (hitT > 0 && (hitT -= dt) <= 0) { el.hit.style.transition = 'opacity .12s'; el.hit.style.opacity = 0; }
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.style.opacity = 0;
      dmgFlash = Math.max(0, dmgFlash - dt * 1.5);
      const f = Math.max(0, hp / maxHp);
      el.hpfill.style.width = (f * 100).toFixed(1) + '%';
      el.hpfill.style.background = f > 0.6 ? '#e9e6dc' : f > 0.3 ? '#f2b33d' : '#d8262b';
      el.hpnum.textContent = Math.ceil(hp);
      el.vignette.style.opacity = Math.max(dmgFlash, (1 - hp / maxHp) * 0.9).toFixed(2);
    },
  };
}
