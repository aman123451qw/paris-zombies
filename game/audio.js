// Synthesised sound effects (Web Audio). No files.
let ac, master, noiseBuf;

function init() {
  if (ac) return;
  ac = new AudioContext();
  master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function noise({ dur = 0.1, freq = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.002, pan = 0 }) {
  if (!ac) return;
  const t = ac.currentTime, src = ac.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ac.createStereoPanner(); p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone({ freq = 440, end = freq, dur = 0.1, type = 'sine', gain = 0.3 }) {
  if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const audio = {
  init,
  shot(kind) {
    if (kind === 'shotgun') { noise({ dur: 0.35, freq: 1800, gain: 0.9 }); tone({ freq: 120, end: 40, dur: 0.25, gain: 0.6 }); }
    else { noise({ dur: 0.12, freq: 2600, gain: 0.6 }); tone({ freq: 160, end: 60, dur: 0.08, gain: 0.35 }); }
  },
  hit(head) { tone({ freq: head ? 1800 : 1200, dur: 0.05, type: 'square', gain: 0.12 }); if (head) tone({ freq: 2600, dur: 0.08, gain: 0.1 }); },
  reload() { noise({ dur: 0.06, freq: 3000, type: 'bandpass', q: 4, gain: 0.3 }); setTimeout(() => noise({ dur: 0.08, freq: 2200, type: 'bandpass', q: 4, gain: 0.35 }), 350); },
  empty() { tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.08 }); },
  swing() { noise({ dur: 0.18, freq: 700, type: 'bandpass', q: 1.5, gain: 0.25, attack: 0.05 }); },
  hurt() { tone({ freq: 220, end: 110, dur: 0.18, type: 'sawtooth', gain: 0.12 }); noise({ dur: 0.1, freq: 400, gain: 0.3 }); },
  step(sprint) { noise({ dur: 0.07, freq: sprint ? 500 : 380, gain: 0.12 }); },
  enemyShout(pan) { noise({ dur: 0.35, freq: 600, type: 'bandpass', q: 3, gain: 0.18, attack: 0.04, pan }); },
  thud() { tone({ freq: 90, end: 40, dur: 0.2, gain: 0.3 }); noise({ dur: 0.12, freq: 300, gain: 0.25 }); },
  glass() { noise({ dur: 0.25, freq: 5000, type: 'highpass', gain: 0.35 }); },
  buy() { tone({ freq: 660, dur: 0.08, gain: 0.2 }); setTimeout(() => tone({ freq: 990, dur: 0.12, gain: 0.2 }), 80); },
  denied() { tone({ freq: 200, dur: 0.15, type: 'square', gain: 0.12 }); },
  waveStart() { [196, 233, 196, 147].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.2 }), i * 220)); },
  heartbeat() { tone({ freq: 60, end: 40, dur: 0.12, gain: 0.35 }); setTimeout(() => tone({ freq: 55, end: 38, dur: 0.12, gain: 0.25 }), 160); },
};
