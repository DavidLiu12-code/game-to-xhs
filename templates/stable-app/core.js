/**
 * core.js —— 纯逻辑层（不碰 DOM / Canvas / 时间）
 *
 * 只暴露 4 个方法：create(seed) / input(state,x,y) / tick(state,dt) / snapshot(state)
 * 规则：
 *   - 所有随机走可注入 RNG，同 seed 结果完全一致（可测可复现）
 *   - 不读 Math.random、不读 performance.now，dt 由外部传
 *   - 状态机 ready → playing → result 只能单向走一次
 */
(function (global) {
  'use strict';

  var CONFIG = {
    duration: 30,        // 一局秒数
    targetLife: 1.25,    // 目标停留基准秒数
    lifeFloor: 0.62,     // 最短停留
    hitRadius: 0.145,    // 判定半径（归一化，比视觉略大，手感更友好）
    basePoints: 10,
    comboStep: 2,        // 每层连击额外加分
    comboCap: 20
  };

  var RATING = [
    { min: 900, label: '星球毁灭者' },
    { min: 600, label: '手速惊人' },
    { min: 350, label: '小有手感' },
    { min: 150, label: '刚热身' },
    { min: 0, label: '再来一次' }
  ];

  // xorshift32：可复现的伪随机
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function spawnTarget(state) {
    var t = Math.min(1, state.time / CONFIG.duration);
    var life = CONFIG.targetLife - (CONFIG.targetLife - CONFIG.lifeFloor) * t;
    state.target = {
      id: state.nextId,
      x: 0.14 + state.rand() * 0.72,
      y: 0.18 + state.rand() * 0.64,
      born: state.time,
      life: life
    };
    state.nextId += 1;
  }

  function create(seed) {
    var s = (seed === undefined || seed === null) ? 1 : (seed | 0);
    var state = {
      seed: s,
      rand: makeRng(s),
      phase: 'playing',
      time: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      hits: 0,
      misses: 0,
      target: null,
      nextId: 1
    };
    spawnTarget(state);
    return state;
  }

  function input(state, x, y) {
    if (!state || state.phase !== 'playing') return { type: 'ignored' };
    var t = state.target;
    if (!t) return { type: 'ignored' };

    var dx = x - t.x;
    var dy = y - t.y;
    if (Math.sqrt(dx * dx + dy * dy) > CONFIG.hitRadius) {
      return { type: 'miss', combo: 0 };
    }

    state.combo += 1;
    state.hits += 1;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    var bonus = Math.min(CONFIG.comboStep * (state.combo - 1), CONFIG.comboCap);
    var points = CONFIG.basePoints + bonus;
    state.score += points;

    spawnTarget(state);
    return { type: 'hit', points: points, combo: state.combo, x: t.x, y: t.y };
  }

  function tick(state, dt) {
    if (!state || state.phase !== 'playing') return { type: 'idle' };
    if (!(dt > 0)) return { type: 'idle' };
    if (dt > 0.05) dt = 0.05;          // 切后台回来不跳帧

    state.time += dt;

    if (state.time >= CONFIG.duration) {
      state.time = CONFIG.duration;
      state.phase = 'result';
      state.target = null;
      return { type: 'end' };
    }

    var t = state.target;
    if (t && state.time - t.born >= t.life) {
      state.misses += 1;
      state.combo = 0;
      spawnTarget(state);
      return { type: 'expire' };
    }

    return { type: 'idle' };
  }

  function rating(score) {
    for (var i = 0; i < RATING.length; i++) {
      if (score >= RATING[i].min) return RATING[i].label;
    }
    return RATING[RATING.length - 1].label;
  }

  function snapshot(state) {
    var t = state.target;
    var age = t ? (state.time - t.born) : 0;
    return {
      phase: state.phase,
      score: state.score,
      combo: state.combo,
      maxCombo: state.maxCombo,
      hits: state.hits,
      misses: state.misses,
      time: state.time,
      timeLeft: Math.max(0, Math.ceil(CONFIG.duration - state.time)),
      progress: Math.min(1, state.time / CONFIG.duration),
      rating: rating(state.score),
      target: t ? {
        id: t.id,
        x: t.x,
        y: t.y,
        life: t.life,
        age: age,
        remain: Math.max(0, (t.life - age) / t.life)
      } : null
    };
  }

  global.MiniCore = {
    CONFIG: CONFIG,
    RATING: RATING,
    create: create,
    input: input,
    tick: tick,
    snapshot: snapshot,
    rating: rating
  };
})(window);
