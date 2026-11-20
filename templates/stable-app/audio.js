/**
 * audio.js —— 程序化音效（Web Audio 合成，零音频文件）
 *
 * 为什么不用 mp3：平台上传白名单里没有音频扩展名，音频文件根本传不上去。
 * 所以音效全部用 Oscillator 合成：体积 0，还能按连击动态升调。
 *
 * 用法：
 *   Sfx.unlock()          // 首次用户手势里调一次，否则音频被浏览器挂起
 *   Sfx.play('hit')       // 'hit' | 'miss' | 'start' | 'end' | 'tap'
 *   Sfx.setMuted(true)    // 静音开关
 */
(function (global) {
  'use strict';

  var ctx = null;
  var muted = false;

  var PRESET = {
    tap:   { start: 520,  end: 520,  dur: 0.05, wave: 'sine',     gain: 0.08 },
    hit:   { start: 880,  end: 1320, dur: 0.09, wave: 'triangle', gain: 0.12 },
    miss:  { start: 220,  end: 130,  dur: 0.16, wave: 'sawtooth', gain: 0.09 },
    start: { start: 440,  end: 880,  dur: 0.18, wave: 'triangle', gain: 0.10 },
    end:   { start: 660,  end: 990,  dur: 0.28, wave: 'sine',     gain: 0.10 }
  };

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended' && typeof c.resume === 'function') {
      try { c.resume(); } catch (e) { /* 忽略 */ }
    }
  }

  // 连击越高，音高越高（最多升 8 个半音）
  function hit(combo) {
    var step = Math.min(8, Math.max(0, (combo || 1) - 1));
    var p = PRESET.hit;
    var ratio = Math.pow(2, step / 12);
    tone(p.start * ratio, p.end * ratio, p.dur, p.wave, p.gain);
  }

  function tone(freqStart, freqEnd, dur, wave, gainValue) {
    var c = ensure();
    if (!c || muted) return;
    try {
      if (c.state === 'suspended' && typeof c.resume === 'function') c.resume();
      var t0 = c.currentTime;
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = wave || 'sine';
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
    } catch (e) { /* 出不了声也不影响玩 */ }
  }

  function play(type, combo) {
    if (muted) return;
    if (type === 'hit') { hit(combo); return; }
    var p = PRESET[type];
    if (!p) return;
    tone(p.start, p.end, p.dur, p.wave, p.gain);
  }

  function setMuted(value) {
    muted = !!value;
    return muted;
  }

  function isMuted() { return muted; }

  global.Sfx = { unlock: unlock, play: play, setMuted: setMuted, isMuted: isMuted };
})(window);
