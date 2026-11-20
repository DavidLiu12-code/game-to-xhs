/**
 * app.js —— 界面与循环（只读 core 的 snapshot，不改逻辑状态）
 *
 * 结构：init → 绑事件 → 开始一局 → requestAnimationFrame 主循环（固定步长）
 * 规则：
 *   - 渲染层不写游戏状态，所有状态变更走 MiniCore
 *   - dt 累加上限，切后台回来不跳帧
 *   - 平台能力按钮在启动时按「能力是否存在」决定显示/隐藏
 */
(function (global) {
  'use strict';

  var STEP = 1000 / 60;
  var MAX_FRAME = 100;

  var ui = {};
  var state = null;
  var running = false;
  var lastTs = 0;
  var acc = 0;
  var currentTargetId = -1;
  var pendingTimer = null;
  var floatTimer = null;
  var best = 0;
  var seedCounter = 1;
  var lastTotalScore = 0;

  function $(id) { return document.getElementById(id); }

  function cache() {
    ui.app = $('app');
    ui.stage = $('stage');
    ui.target = $('target');
    ui.floatScore = $('floatScore');
    ui.score = $('score');
    ui.combo = $('combo');
    ui.clock = $('clock');
    ui.progress = $('progress');
    ui.screenStart = $('screenStart');
    ui.screenResult = $('screenResult');
    ui.btnStart = $('btnStart');
    ui.btnAgain = $('btnAgain');
    ui.btnPoster = $('btnPoster');
    ui.btnShare = $('btnShare');
    ui.btnFollow = $('btnFollow');
    ui.btnSound = $('btnSound');
    ui.finalScore = $('finalScore');
    ui.finalBest = $('finalBest');
    ui.finalCombo = $('finalCombo');
    ui.medal = $('medal');
    ui.startTip = $('startTip');
    ui.resultTip = $('resultTip');
    ui.toast = $('toast');
  }

  // ---------- 声音 ----------
  function loadSoundPref() {
    var saved = Platform.store.get('sound_on', '1');
    var on = saved !== '0' && saved !== 0 && saved !== false;
    Sfx.setMuted(!on);
    ui.btnSound.textContent = on ? '🔊' : '🔇';
  }

  function toggleSound() {
    var muted = Sfx.isMuted();
    Sfx.setMuted(!muted);
    Platform.store.set('sound_on', muted ? '1' : '0');
    ui.btnSound.textContent = muted ? '🔊' : '🔇';
    if (muted) Sfx.play('tap');
    Platform.haptic();
  }

  // ---------- 渲染 ----------
  function renderTarget(snap) {
    var t = snap.target;
    if (!t) {
      ui.target.className = 'target';
      return;
    }
    if (t.id === currentTargetId) return;

    currentTargetId = t.id;
    ui.target.className = 'target is-hit';
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () {
      ui.target.style.left = (t.x * 100).toFixed(2) + '%';
      ui.target.style.top = (t.y * 100).toFixed(2) + '%';
      ui.target.className = 'target is-on';
    }, 90);
  }

  function renderHud(snap) {
    ui.score.textContent = String(snap.score);
    ui.combo.textContent = String(snap.combo);
    ui.clock.textContent = String(snap.timeLeft);
    var left = 1 - snap.progress;
    ui.progress.style.transform = 'scaleX(' + left.toFixed(4) + ')';
    if (left < 0.25) {
      ui.progress.style.background = '#fb7185';
    } else {
      ui.progress.style.background = '';
    }
  }

  function render() {
    if (!state) return;
    var snap = MiniCore.snapshot(state);
    renderHud(snap);
    renderTarget(snap);
  }

  function floatText(text, x, y, color) {
    ui.floatScore.textContent = text;
    ui.floatScore.style.left = (x * 100).toFixed(2) + '%';
    ui.floatScore.style.top = (y * 100).toFixed(2) + '%';
    ui.floatScore.style.color = color || '#6ee7b7';
    ui.floatScore.className = 'float-score is-on';
    if (floatTimer) clearTimeout(floatTimer);
    floatTimer = setTimeout(function () {
      ui.floatScore.className = 'float-score';
    }, 380);
  }

  // ---------- 交互 ----------
  function onStageTap(evt) {
    if (!state || state.phase !== 'playing') return;
    Sfx.unlock();
    var rect = ui.stage.getBoundingClientRect();
    var point = evt.touches && evt.touches.length ? evt.touches[0] : evt;
    var x = (point.clientX - rect.left) / rect.width;
    var y = (point.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    var result = MiniCore.input(state, x, y);
    if (result.type === 'hit') {
      floatText('+' + result.points, x, y, result.combo >= 5 ? '#ffd166' : '#6ee7b7');
      Sfx.play('hit', result.combo);
      Platform.haptic();
      render();
    } else if (result.type === 'miss') {
      floatText('—', x, y, '#9da3c8');
      Sfx.play('miss');
      render();
    }
  }

  // ---------- 主循环 ----------
  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    var delta = Math.min(MAX_FRAME, ts - lastTs);
    lastTs = ts;
    acc += delta;

    var guard = 0;
    while (acc >= STEP && guard < 8) {
      var evt = MiniCore.tick(state, STEP / 1000);
      acc -= STEP;
      guard += 1;
      if (evt.type === 'expire') {
        Sfx.play('miss');
      } else if (evt.type === 'end') {
        finish();
        return;
      }
    }

    render();
    global.requestAnimationFrame(loop);
  }

  // ---------- 一局 ----------
  function startGame() {
    Sfx.unlock();
    Sfx.play('start');
    currentTargetId = -1;
    lastTotalScore = 0;
    ui.screenStart.hidden = true;
    ui.screenResult.hidden = true;
    ui.target.className = 'target';
    ui.floatScore.className = 'float-score';
    seedCounter = (seedCounter + 1) % 100000;
    state = MiniCore.create((Date.now() % 100000) + seedCounter);
    running = true;
    lastTs = 0;
    acc = 0;
    render();
    global.requestAnimationFrame(loop);
  }

  function finish() {
    running = false;
    var snap = MiniCore.snapshot(state);
    var isNewBest = snap.score > best;
    if (isNewBest) {
      best = snap.score;
      Platform.store.set('best_score', String(best));
    }
    ui.finalScore.textContent = String(snap.score);
    ui.finalBest.textContent = '最佳 ' + best;
    ui.finalCombo.textContent = '最高连击 ' + snap.maxCombo;
    ui.medal.textContent = isNewBest && best > 0 ? '新纪录！' : snap.rating;
    ui.resultTip.textContent = isNewBest ? '刷新了个人最佳，存张成绩图？' : '差一点就破纪录了';
    ui.screenResult.hidden = false;
    Sfx.play('end');
  }

  // ---------- 成绩图 ----------
  function buildPoster() {
    var canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;

    var g = ctx.createLinearGradient(0, 0, 1080, 1440);
    g.addColorStop(0, '#1b1d3d');
    g.addColorStop(1, '#12132a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1440);

    // 装饰圆
    ctx.beginPath();
    ctx.arc(880, 220, 260, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.10)';
    ctx.fill();

    var snap = MiniCore.snapshot(state);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = '600 44px sans-serif';
    ctx.fillText('点点星球', 540, 300);

    ctx.fillStyle = '#f5f6ff';
    ctx.font = '800 220px sans-serif';
    ctx.fillText(String(snap.score), 540, 660);

    ctx.fillStyle = '#9da3c8';
    ctx.font = '400 40px sans-serif';
    ctx.fillText('最高连击 ' + snap.maxCombo + ' · 命中 ' + snap.hits, 540, 760);

    ctx.fillStyle = '#ff8fab';
    ctx.font = '600 52px sans-serif';
    ctx.fillText(snap.rating, 540, 900);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(140, 1010, 800, 2);

    ctx.fillStyle = '#9da3c8';
    ctx.font = '400 34px sans-serif';
    ctx.fillText('最佳成绩 ' + best, 540, 1100);
    ctx.fillText('来小红书一起挑战', 540, 1180);

    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function onPoster() {
    var dataUrl = buildPoster();
    if (!dataUrl) {
      Platform.toast('成绩图生成失败，换一局再试');
      return;
    }
    var result = Platform.saveImage(dataUrl);
    if (result.status === Platform.STATUS.SUCCESS) {
      Platform.toast('已保存到相册');
      Platform.haptic();
    } else if (result.status === Platform.STATUS.CANCELLED) {
      Platform.toast('已取消保存');
    } else if (result.status === Platform.STATUS.UNSUPPORTED) {
      Platform.toast('当前环境不支持保存');
    } else {
      Platform.toast('保存失败，请检查相册权限');
    }
  }

  function onShare() {
    var snap = state ? MiniCore.snapshot(state) : null;
    var score = snap ? snap.score : 0;
    var result = Platform.share({
      title: '点点星球',
      desc: '我拿了 ' + score + ' 分，来挑战我',
      imageUrl: buildPoster() || ''
    });
    if (result.status === Platform.STATUS.SUCCESS) {
      Platform.toast('已打开分享面板');
    } else if (result.status === Platform.STATUS.CANCELLED) {
      Platform.toast('已取消分享');
    } else if (result.status === Platform.STATUS.UNSUPPORTED) {
      Platform.toast('当前环境不支持分享');
    } else {
      Platform.toast('分享失败，稍后再试');
    }
  }

  function onFollow() {
    var result = Platform.followAuthor();
    var raw = result.raw;
    if (result.status === Platform.STATUS.SUCCESS && raw === 2) {
      Platform.toast('你就是作者本人，不用关注啦');
      return;
    }
    if (result.status === Platform.STATUS.SUCCESS) {
      Platform.toast('关注成功，谢谢你');
      Platform.haptic();
      return;
    }
    if (result.status === Platform.STATUS.CANCELLED) {
      Platform.toast('已取消关注');
    } else if (result.status === Platform.STATUS.LIMIT_REACHED) {
      Platform.toast('今天关注次数用完了，明天再来');
    } else if (result.status === Platform.STATUS.UNSUPPORTED) {
      Platform.toast('当前环境不支持关注');
    } else {
      Platform.toast('关注失败，稍后再试');
    }
  }

  // ---------- 能力按钮 ----------
  function setupCapabilityButtons() {
    // 能力不存在就隐藏入口（不是点了才报错）
    if (Platform.cap('saveImageToAlbum')) ui.btnPoster.hidden = false;
    if (Platform.cap('share')) ui.btnShare.hidden = false;
    if (Platform.cap('followAuthor')) ui.btnFollow.hidden = false;

    var missing = [];
    if (!Platform.cap('saveImageToAlbum')) missing.push('保存相册');
    if (!Platform.cap('share')) missing.push('分享');
    if (missing.length) {
      ui.startTip.textContent = '当前环境不支持' + missing.join('、') + '，玩法不受影响';
    }
  }

  // ---------- 启动 ----------
  function init() {
    cache();
    Platform.init();
    loadSoundPref();
    best = Platform.store.number('best_score', 0);
    setupCapabilityButtons();

    ui.btnStart.addEventListener('click', startGame);
    ui.btnAgain.addEventListener('click', startGame);
    ui.btnPoster.addEventListener('click', onPoster);
    ui.btnShare.addEventListener('click', onShare);
    ui.btnFollow.addEventListener('click', onFollow);
    ui.btnSound.addEventListener('click', toggleSound);

    // 舞台点击/触摸
    if (global.PointerEvent) {
      ui.stage.addEventListener('pointerdown', onStageTap);
    } else {
      ui.stage.addEventListener('touchstart', onStageTap, { passive: true });
      ui.stage.addEventListener('mousedown', onStageTap);
    }

    // 首次手势解锁音频
    var unlocked = false;
    function onFirstGesture() {
      if (unlocked) return;
      unlocked = true;
      Sfx.unlock();
    }
    document.addEventListener('touchstart', onFirstGesture, { passive: true });
    document.addEventListener('mousedown', onFirstGesture);

    // 切后台回来重置计时，避免跳帧
    document.addEventListener('visibilitychange', function () {
      lastTs = 0;
      acc = 0;
    });

    ui.startTip.textContent = ui.startTip.textContent || '点得越准，连击越高';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
