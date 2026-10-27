let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let drone: { stop: () => void } | null = null;

function context(): AudioContext | null {
  if (!ctx) return null;
  return ctx;
}

export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.6);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      startDrone();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* autoplay or missing device */
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}

export function isMuted() {
  return muted;
}

function env(duration: number, peak: number) {
  const c = context();
  if (!c || !master) return null;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  g.connect(master);
  return g;
}

function burst(duration: number, peak: number, freq: number, q: number) {
  const c = context();
  if (!c || !noise) return;
  const g = env(duration, peak);
  if (!g) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter);
  filter.connect(g);
  src.start();
  src.stop(c.currentTime + duration + 0.02);
}

export function sfxShot() {
  const c = context();
  if (!c) return;
  burst(0.22, 0.55, 420, 0.6);
  const g = env(0.16, 0.28);
  if (!g) return;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(150, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(42, c.currentTime + 0.14);
  o.connect(g);
  o.start();
  o.stop(c.currentTime + 0.16);
}

export function sfxDry() {
  burst(0.06, 0.12, 1800, 2);
}

export function sfxWet() {
  burst(0.12, 0.22, 700, 1.2);
  burst(0.18, 0.1, 220, 0.7);
}

export function sfxKill() {
  burst(0.28, 0.3, 180, 0.5);
  burst(0.16, 0.18, 900, 0.8);
}

export function sfxHurt() {
  const c = context();
  if (!c) return;
  burst(0.2, 0.28, 140, 0.4);
  const g = env(0.18, 0.16);
  if (!g) return;
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(90, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.16);
  o.connect(g);
  o.start();
  o.stop(c.currentTime + 0.18);
}

export function sfxReload() {
  burst(0.08, 0.12, 1400, 3);
  window.setTimeout(() => burst(0.09, 0.14, 600, 2), 180);
  window.setTimeout(() => burst(0.1, 0.16, 280, 1), 420);
}

export function sfxSpit() {
  burst(0.2, 0.16, 320, 0.8);
}

export function sfxMelee() {
  burst(0.1, 0.2, 200, 0.5);
}

export function sfxPickup() {
  const c = context();
  if (!c) return;
  const g = env(0.18, 0.1);
  if (!g) return;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(520, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.12);
  o.connect(g);
  o.start();
  o.stop(c.currentTime + 0.16);
}

export function sfxStep() {
  burst(0.05, 0.05, 180, 0.6);
}

function startDrone() {
  const c = context();
  if (!c || !master || drone) return;
  const g = c.createGain();
  g.gain.value = 0.03;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 240;
  const a = c.createOscillator();
  const b = c.createOscillator();
  a.type = "sawtooth";
  b.type = "triangle";
  a.frequency.value = 46;
  b.frequency.value = 69.2;
  a.connect(filter);
  b.connect(filter);
  filter.connect(g);
  g.connect(master);
  a.start();
  b.start();
  drone = {
    stop() {
      try {
        a.stop();
        b.stop();
      } catch {
        /* already stopped */
      }
      g.disconnect();
    },
  };
}

export function disposeAudio() {
  drone?.stop();
  drone = null;
  try {
    void ctx?.close();
  } catch {
    /* ignore */
  }
  ctx = null;
  master = null;
  noise = null;
}
