/** 用 WebAudio 合成的简单音效（无需音频文件） */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** 在用户点屏幕的事件里调用，解锁移动浏览器的音频播放。 */
export function unlockAudio() {
  const a = ac();
  if (!a) return;
  const source = a.createBufferSource();
  source.buffer = a.createBuffer(1, 1, a.sampleRate);
  source.connect(a.destination);
  source.start();
}

/** 牌敲桌面的"嗒"声：带通滤波的噪声 + 低频 */
function clack(volume = 0.5, pitch = 1) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const len = 0.08;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 6);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400 * pitch;
  bp.Q.value = 1.4;
  const g = a.createGain();
  g.gain.value = volume;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);

  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(320 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
  const og = a.createGain();
  og.gain.setValueAtTime(volume * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(og).connect(a.destination);
  o.start(t);
  o.stop(t + 0.08);
}

function tone(freqs: number[], step = 0.09, dur = 0.25, type: OscillatorType = 'triangle', volume = 0.18) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  freqs.forEach((f, i) => {
    const t = t0 + i * step;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  });
}

export const sfx = {
  discard: () => clack(0.55, 1),
  draw: () => clack(0.18, 1.3),
  call: () => tone([523, 784], 0.07, 0.22, 'square', 0.08),
  flower: () => tone([880, 1175], 0.06, 0.18, 'sine', 0.12),
  win: () => tone([523, 659, 784, 1047, 1319], 0.08, 0.5, 'triangle', 0.16),
  lose: () => tone([392, 330, 262], 0.12, 0.4, 'sine', 0.12),
  click: () => clack(0.2, 1.6),
};
