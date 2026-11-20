/**
 * 纯逻辑层：不碰 DOM，不吃 Math.random / Date.now。
 * 同 seed 完全可复现，方便写测试和回放 bug。
 */

export const CONFIG = {
  duration: 30,
  targetLife: 1.25,
  lifeFloor: 0.62,
  hitRadius: 0.145,
  basePoints: 10,
  comboStep: 2,
  comboCap: 20,
};

const RATING = [
  { min: 900, label: '星球毁灭者' },
  { min: 600, label: '手速惊人' },
  { min: 350, label: '小有手感' },
  { min: 150, label: '刚热身' },
  { min: 0, label: '再来一次' },
];

/** xorshift32：可复现伪随机 */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function spawn(state) {
  const t = Math.min(1, state.time / CONFIG.duration);
  const life = CONFIG.targetLife - (CONFIG.targetLife - CONFIG.lifeFloor) * t;
  state.target = {
    id: state.nextId,
    x: 0.14 + state.rand() * 0.72,
    y: 0.18 + state.rand() * 0.64,
    born: state.time,
    life,
  };
  state.nextId += 1;
}

export function create(seed = 1) {
  const state = {
    seed,
    rand: makeRng(seed),
    phase: 'playing',
    time: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    target: null,
    nextId: 1,
  };
  spawn(state);
  return state;
}

export function input(state, x, y) {
  if (state.phase !== 'playing' || !state.target) return { type: 'ignored' };
  const t = state.target;
  const dx = x - t.x;
  const dy = y - t.y;
  if (Math.sqrt(dx * dx + dy * dy) > CONFIG.hitRadius) {
    return { type: 'miss' };
  }

  state.combo += 1;
  state.hits += 1;
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;

  const bonus = Math.min(CONFIG.comboStep * (state.combo - 1), CONFIG.comboCap);
  const points = CONFIG.basePoints + bonus;
  state.score += points;

  spawn(state);
  return { type: 'hit', points, combo: state.combo, x: t.x, y: t.y };
}

export function tick(state, dt) {
  if (state.phase !== 'playing') return { type: 'idle' };
  if (!(dt > 0)) return { type: 'idle' };
  const step = Math.min(dt, 0.05);   // 切后台回来不跳帧

  state.time += step;

  if (state.time >= CONFIG.duration) {
    state.time = CONFIG.duration;
    state.phase = 'result';
    state.target = null;
    return { type: 'end' };
  }

  const t = state.target;
  if (t && state.time - t.born >= t.life) {
    state.misses += 1;
    state.combo = 0;
    spawn(state);
    return { type: 'expire' };
  }

  return { type: 'idle' };
}

export function rating(score) {
  for (const r of RATING) {
    if (score >= r.min) return r.label;
  }
  return RATING[RATING.length - 1].label;
}

export function snapshot(state) {
  const t = state.target;
  return {
    phase: state.phase,
    score: state.score,
    combo: state.combo,
    maxCombo: state.maxCombo,
    hits: state.hits,
    misses: state.misses,
    progress: Math.min(1, state.time / CONFIG.duration),
    timeLeft: Math.max(0, Math.ceil(CONFIG.duration - state.time)),
    rating: rating(state.score),
    target: t ? { id: t.id, x: t.x, y: t.y } : null,
  };
}
