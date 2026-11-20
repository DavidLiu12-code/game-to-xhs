import './styles.css';
import { create, input, tick, snapshot } from './core.js';
import {
  STATUS, cap, initSafeArea, store, saveImage, share, followAuthor, haptic, toast,
} from './platform.js';
import { unlock, play, setMuted, isMuted } from './audio.js';

const STEP = 1000 / 60;
const MAX_FRAME = 100;

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

const ui = {
  stage: $('stage'),
  target: $('target'),
  score: $('score'),
  combo: $('combo'),
  clock: $('clock'),
  progress: $('progress'),
  screenStart: $('screenStart'),
  screenResult: $('screenResult'),
  btnStart: $('btnStart'),
  btnAgain: $('btnAgain'),
  btnPoster: $('btnPoster'),
  btnShare: $('btnShare'),
  btnFollow: $('btnFollow'),
  final: $('final'),
  best: $('best'),
  maxCombo: $('maxCombo'),
  medal: $('medal'),
  tip: $('tip'),
};

let state = null;
let running = false;
let lastTs = 0;
let acc = 0;
let currentTargetId = -1;
let pendingTarget = null;
let pendingTimer = 0;
let bestScore = 0;

function renderTarget(snap) {
  if (!snap.target) {
    ui.target.className = 'target';
    return;
  }
  if (snap.target.id === currentTargetId) return;
  currentTargetId = snap.target.id;

  ui.target.className = 'target hit';
  pendingTarget = { x: snap.target.x, y: snap.target.y };
  if (pendingTimer) window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => {
    if (!pendingTarget) return;
    ui.target.style.left = `${(pendingTarget.x * 100).toFixed(2)}%`;
    ui.target.style.top = `${(pendingTarget.y * 100).toFixed(2)}%`;
    ui.target.className = 'target on';
  }, 90);
}

function renderHud(snap) {
  ui.score.textContent = String(snap.score);
  ui.combo.textContent = String(snap.combo);
  ui.clock.textContent = String(snap.timeLeft);
  ui.progress.style.transform = `scaleX(${(1 - snap.progress).toFixed(4)})`;
}

function render() {
  if (!state) return;
  const snap = snapshot(state);
  renderHud(snap);
  renderTarget(snap);
}

function onStageTap(evt) {
  if (!state || state.phase !== 'playing') return;
  unlock();
  const rect = ui.stage.getBoundingClientRect();
  const point = evt.touches && evt.touches.length ? evt.touches[0] : evt;
  const x = (point.clientX - rect.left) / rect.width;
  const y = (point.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;

  const result = input(state, x, y);
  if (result.type === 'hit') {
    play('hit', result.combo);
    haptic();
  } else if (result.type === 'miss') {
    play('miss');
  }
  render();
}

function loop(ts) {
  if (!running || !state) return;
  if (!lastTs) lastTs = ts;
  const delta = Math.min(MAX_FRAME, ts - lastTs);
  lastTs = ts;
  acc += delta;

  let guard = 0;
  while (acc >= STEP && guard < 8) {
    const evt = tick(state, STEP / 1000);
    acc -= STEP;
    guard += 1;
    if (evt.type === 'expire') {
      play('miss');
    } else if (evt.type === 'end') {
      finish();
      return;
    }
  }

  render();
  window.requestAnimationFrame(loop);
}

function startGame() {
  unlock();
  play('start');
  currentTargetId = -1;
  pendingTarget = null;
  ui.screenStart.hidden = true;
  ui.screenResult.hidden = true;
  ui.target.className = 'target';
  state = create((Date.now() % 100000) + 1);
  running = true;
  lastTs = 0;
  acc = 0;
  render();
  window.requestAnimationFrame(loop);
}

function finish() {
  if (!state) return;
  running = false;
  const snap = snapshot(state);
  const isNewBest = snap.score > bestScore;
  if (isNewBest) {
    bestScore = snap.score;
    store.set('best_score', String(bestScore));
  }
  ui.final.textContent = String(snap.score);
  ui.best.textContent = `最佳 ${bestScore}`;
  ui.maxCombo.textContent = `最高连击 ${snap.maxCombo}`;
  ui.medal.textContent = isNewBest && bestScore > 0 ? '新纪录！' : snap.rating;
  ui.screenResult.hidden = false;
  play('end');
}

function buildPoster() {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx || !state) return null;

  const g = ctx.createLinearGradient(0, 0, 1080, 1440);
  g.addColorStop(0, '#1b1d3d');
  g.addColorStop(1, '#12132a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1440);

  const snap = snapshot(state);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '600 44px sans-serif';
  ctx.fillText('点点星球', 540, 300);

  ctx.fillStyle = '#f5f6ff';
  ctx.font = '800 220px sans-serif';
  ctx.fillText(String(snap.score), 540, 660);

  ctx.fillStyle = '#9da3c8';
  ctx.font = '400 40px sans-serif';
  ctx.fillText(`最高连击 ${snap.maxCombo} · 命中 ${snap.hits}`, 540, 760);

  ctx.fillStyle = '#ff8fab';
  ctx.font = '600 52px sans-serif';
  ctx.fillText(snap.rating, 540, 900);

  ctx.fillStyle = '#9da3c8';
  ctx.font = '400 34px sans-serif';
  ctx.fillText(`最佳成绩 ${bestScore}`, 540, 1100);
  ctx.fillText('来小红书一起挑战', 540, 1180);

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function onPoster() {
  const dataUrl = buildPoster();
  if (!dataUrl) {
    toast('成绩图生成失败，换一局再试');
    return;
  }
  const result = saveImage(dataUrl);
  if (result.status === STATUS.SUCCESS) {
    toast('已保存到相册');
    haptic();
  } else if (result.status === STATUS.CANCELLED) {
    toast('已取消保存');
  } else if (result.status === STATUS.UNSUPPORTED) {
    toast('当前环境不支持保存');
  } else {
    toast('保存失败，请检查相册权限');
  }
}

function onShare() {
  const snap = state ? snapshot(state) : null;
  const result = share({
    title: '点点星球',
    desc: `我拿了 ${snap ? snap.score : 0} 分，来挑战我`,
    imageUrl: buildPoster() || '',
  });
  if (result.status === STATUS.SUCCESS) toast('已打开分享面板');
  else if (result.status === STATUS.CANCELLED) toast('已取消分享');
  else if (result.status === STATUS.UNSUPPORTED) toast('当前环境不支持分享');
  else toast('分享失败，稍后再试');
}

function onFollow() {
  const result = followAuthor();
  if (result.status === STATUS.SUCCESS && result.raw === 2) {
    toast('你就是作者本人，不用关注啦');
  } else if (result.status === STATUS.SUCCESS) {
    toast('关注成功，谢谢你');
    haptic();
  } else if (result.status === STATUS.CANCELLED) {
    toast('已取消关注');
  } else if (result.status === STATUS.LIMIT_REACHED) {
    toast('今天关注次数用完了，明天再来');
  } else if (result.status === STATUS.UNSUPPORTED) {
    toast('当前环境不支持关注');
  } else {
    toast('关注失败，稍后再试');
  }
}

function syncSoundButton() {
  const btn = document.getElementById('btnSound');
  if (btn) btn.textContent = isMuted() ? '🔇' : '🔊';
}

function init() {
  initSafeArea();
  const soundOn = store.get('sound_on', '1') !== '0';
  setMuted(!soundOn);
  bestScore = store.number('best_score', 0);

  if (cap('saveImageToAlbum')) ui.btnPoster.hidden = false;
  if (cap('share')) ui.btnShare.hidden = false;
  if (cap('followAuthor')) ui.btnFollow.hidden = false;

  ui.btnStart.addEventListener('click', startGame);
  ui.btnAgain.addEventListener('click', startGame);
  ui.btnPoster.addEventListener('click', onPoster);
  ui.btnShare.addEventListener('click', onShare);
  ui.btnFollow.addEventListener('click', onFollow);

  if (window.PointerEvent) {
    ui.stage.addEventListener('pointerdown', onStageTap);
  } else {
    ui.stage.addEventListener('touchstart', onStageTap, { passive: true });
    ui.stage.addEventListener('mousedown', onStageTap);
  }

  let unlocked = false;
  const firstGesture = () => {
    if (unlocked) return;
    unlocked = true;
    unlock();
  };
  document.addEventListener('touchstart', firstGesture, { passive: true });
  document.addEventListener('mousedown', firstGesture);

  document.addEventListener('visibilitychange', () => {
    lastTs = 0;
    acc = 0;
  });

  const soundBtn = document.getElementById('btnSound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const next = !isMuted();
      setMuted(next);
      store.set('sound_on', next ? '0' : '1');
      syncSoundButton();
      if (!next) play('tap');
    });
  }
  syncSoundButton();

  ui.tip.textContent = '点得越准，连击越高';
}

init();
