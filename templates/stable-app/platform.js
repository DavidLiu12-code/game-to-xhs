/**
 * platform.js —— 容器桥接层
 *
 * 三件事：
 *   1. 安全区：容器里 env(safe-area-inset-*) 恒为 0，必须用 getWindowInfo() 取真实值写进 CSS 变量
 *   2. 存储：优先 window.xhs.miniTool.setStorage/getStorage，localStorage 降级，内存兜底
 *   3. 平台能力：只按「方法是否存在」判断，三层判空 + try/catch，返回统一状态
 *
 * 统一状态：SUCCESS / CANCELLED / UNSUPPORTED / FAILED / LIMIT_REACHED
 * 注意：所有能力参数以官方在线文档为准（miniapp-sandbox.xiaohongshu.com/minitool/doc），
 *       这里演示的是「判空 + 归一 + 失败不假成功」的结构，接新能力时照抄这个结构。
 */
(function (global) {
  'use strict';

  var STATUS = {
    SUCCESS: 'SUCCESS',
    CANCELLED: 'CANCELLED',
    UNSUPPORTED: 'UNSUPPORTED',
    FAILED: 'FAILED',
    LIMIT_REACHED: 'LIMIT_REACHED'
  };

  // 平台错误码 → 状态
  var ERR_MAP = {
    '20002': STATUS.CANCELLED,
    '15404': STATUS.LIMIT_REACHED,
    '10003': STATUS.FAILED
  };

  function sdk() {
    try {
      if (global.xhs && global.xhs.miniTool) return global.xhs.miniTool;
    } catch (e) { /* ignore */ }
    return null;
  }

  function cap(name) {
    var m = sdk();
    try {
      return !!m && typeof m[name] === 'function';
    } catch (e) {
      return false;
    }
  }

  // ---------- 安全区 ----------
  function applySafeArea() {
    var top = 44;
    var bottom = 34;
    var m = sdk();
    try {
      if (m && typeof m.getWindowInfo === 'function') {
        var info = m.getWindowInfo();
        if (info) {
          if (typeof info.statusBarHeight === 'number' && info.statusBarHeight > 0) {
            top = info.statusBarHeight;
          }
          if (info.safeArea && typeof info.safeArea.bottom === 'number' &&
              typeof info.screenHeight === 'number') {
            bottom = Math.max(0, info.screenHeight - info.safeArea.bottom);
          }
        }
      }
    } catch (e) { /* 用兜底值 */ }

    var root = document.documentElement;
    root.style.setProperty('--safe-top', Math.round(top) + 'px');
    root.style.setProperty('--safe-bottom', Math.round(bottom) + 'px');
  }

  // ---------- 存储 ----------
  var mem = {};

  function storeSet(key, value) {
    var str = typeof value === 'string' ? value : JSON.stringify(value);
    mem[key] = str;
    var m = sdk();
    try {
      if (m && typeof m.setStorage === 'function') {
        m.setStorage({ key: key, data: str });
        return true;
      }
    } catch (e) { /* 降级 */ }
    try {
      global.localStorage.setItem(key, str);
      return true;
    } catch (e) { /* 只留内存 */ }
    return false;
  }

  function storeGet(key, fallback) {
    var m = sdk();
    try {
      if (m && typeof m.getStorage === 'function') {
        var r = m.getStorage({ key: key });
        var data = r && r.data;
        if (data !== undefined && data !== null && data !== '') return data;
      }
    } catch (e) { /* 降级 */ }
    try {
      var raw = global.localStorage.getItem(key);
      if (raw !== null && raw !== undefined && raw !== '') return raw;
    } catch (e) { /* 降级 */ }
    if (mem[key] !== undefined) return mem[key];
    return fallback;
  }

  function storeNumber(key, fallback) {
    var raw = storeGet(key, null);
    if (raw === null || raw === undefined || raw === '') return fallback;
    var n = Number(raw);
    return isNaN(n) ? fallback : n;
  }

  // ---------- 能力调用 ----------
  function classify(err) {
    var code = err && (err.errno || err.errCode || err.code || err.status);
    var key = code === undefined || code === null ? '' : String(code);
    return ERR_MAP[key] || STATUS.FAILED;
  }

  function invoke(name, payload) {
    if (!cap(name)) return { status: STATUS.UNSUPPORTED, method: name };
    var m = sdk();
    try {
      var ret = m[name](payload || {});
      // 同步返回失败
      if (ret && (ret.errno || ret.errCode) && String(ret.errno || ret.errCode) !== '0') {
        return { status: classify(ret), method: name, raw: ret };
      }
      return { status: STATUS.SUCCESS, method: name, raw: ret };
    } catch (e) {
      return { status: classify(e), method: name, error: e };
    }
  }

  function saveImage(filePath) {
    return invoke('saveImageToAlbum', { filePath: filePath });
  }

  function share(payload) {
    return invoke('share', payload || {});
  }

  function followAuthor() {
    return invoke('followAuthor', {});
  }

  function followStatus() {
    return invoke('getFollowStatus', {});
  }

  function postNote(payload) {
    return invoke('postNote', payload || {});
  }

  function haptic() {
    try {
      if (cap('vibrateShort')) sdk().vibrateShort({ type: 'light' });
    } catch (e) { /* 忽略 */ }
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = String(msg);
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  global.Platform = {
    STATUS: STATUS,
    cap: cap,
    init: applySafeArea,
    store: { set: storeSet, get: storeGet, number: storeNumber },
    saveImage: saveImage,
    share: share,
    followAuthor: followAuthor,
    followStatus: followStatus,
    postNote: postNote,
    haptic: haptic,
    toast: toast
  };
})(window);
