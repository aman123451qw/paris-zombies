// Small canvas textures for signs, graffiti shutters and particles (no files, no cost).
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function signTex(text, bg, fg, font = 'bold 84px Oswald, Impact, sans-serif') {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function plaqueTex(line1, line2) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#1d3f7a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8edf5'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#e8edf5'; g.textAlign = 'center'; g.font = 'bold 30px Oswald, sans-serif';
    g.fillText(line1, w / 2, 70); g.fillText(line2, w / 2, 110);
  });
}

export function shutterTex(seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7d8084'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { g.fillStyle = y % 16 ? '#8a8d91' : '#6c6f73'; g.fillRect(0, y, w, 3); }
    const cols = ['#e33b6b', '#2ec4b6', '#f7b801', '#7b2cbf', '#3a86ff', '#fb5607', '#111'];
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = cols[Math.floor(rnd() * cols.length)]; g.lineWidth = 6 + rnd() * 14; g.lineCap = 'round';
      g.beginPath(); let x = rnd() * w, y = 40 + rnd() * (h - 80); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (rnd() - 0.4) * 90; y += (rnd() - 0.5) * 70; g.quadraticCurveTo(x + 30, y - 40, x, y); }
      g.stroke();
    }
  });
}

export function softDotTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

export function chalkGunTex(price) {
  return canvasTex(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff4d6'; g.lineWidth = 7; g.lineJoin = 'round'; g.shadowColor = '#ffe9a8'; g.shadowBlur = 18;
    g.beginPath(); g.moveTo(40, 110); g.lineTo(380, 100); g.lineTo(470, 96); g.lineTo(470, 122); g.lineTo(300, 128);
    g.lineTo(300, 150); g.lineTo(200, 152); g.lineTo(200, 132); g.lineTo(150, 134); g.lineTo(110, 190); g.lineTo(40, 175); g.closePath(); g.stroke();
    g.font = 'bold 44px Oswald, sans-serif'; g.fillStyle = '#fff4d6'; g.textAlign = 'center'; g.fillText(price, w / 2, 230);
  });
}
