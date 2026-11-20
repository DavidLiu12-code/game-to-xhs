/**
 * 程序化音效（Web Audio 合成，零音频文件）
 * 平台上传白名单没有 mp3/wav，音频只能合成。
 * AudioContext 必须在用户手势里 unlock，否则真机上被挂起。
 */

const PRESET = {
  tap: { start: 520, end: 520, dur: 0.05, wave: 'sine', gain: 0.08 },
  hit: { start: 880, end: 1320, dur: 0.09, wave: 'triangle', gain: 0.12 },
  miss: { start: 220, end: 130, dur: 0.16, wave: 'sawtooth', gain: 0.09 },
  start: { start: 440, end: 880, dur: 0.18, wave: 'triangle', gain: 0.10 },
  end: { start: 660, end: 990, dur: 0.28, wave: 'sine', gain: 0.10 },
};

let ctx = null;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') {
    c.resume().catch(() => {});
  }
}

function tone(freqStart, freqEnd, dur, wave, gainValue) {
  const c = ensure();
  if (!c || muted) return;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
    }
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* 出不了声也不影响玩 */
  }
}

export function play(type, combo = 1) {
  if (muted) return;
  const p = PRESET[type];
  if (!p) return;
  if (type === 'hit') {
    const step = Math.min(8, Math.max(0, combo - 1));
    const ratio = Math.pow(2, step / 12);
    tone(p.start * ratio, p.end * ratio, p.dur, p.wave, p.gain);
    return;
  }
  tone(p.start, p.end, p.dur, p.wave, p.gain);
}

export function setMuted(value) {
  muted = value;
}

export function isMuted() {
  return muted;
}
