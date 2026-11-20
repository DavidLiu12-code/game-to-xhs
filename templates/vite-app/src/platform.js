/**
 * 容器桥接层
 * 三件事：安全区、存储三层、能力状态归一。
 * 新增能力时：先确认方法存在 → invoke() 包一层错误归一 → 调用方按状态给 UI。
 */

export const STATUS = {
  SUCCESS: 'SUCCESS',
  CANCELLED: 'CANCELLED',
  UNSUPPORTED: 'UNSUPPORTED',
  FAILED: 'FAILED',
  LIMIT_REACHED: 'LIMIT_REACHED',
};

const ERR_MAP = {
  '20002': 'CANCELLED',
  '15404': 'LIMIT_REACHED',
  '10003': 'FAILED',
};

function sdk() {
  try {
    return window.xhs && window.xhs.miniTool ? window.xhs.miniTool : null;
  } catch {
    return null;
  }
}

export function cap(name) {
  const m = sdk();
  return !!m && typeof m[name] === 'function';
}

/** 容器里 env(safe-area-inset-*) 恒为 0，必须用 getWindowInfo() 取真实值 */
export function initSafeArea() {
  let top = 44;
  let bottom = 34;
  try {
    const m = sdk();
    if (m && typeof m.getWindowInfo === 'function') {
      const info = m.getWindowInfo();
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
  } catch {
    /* 用兜底值 */
  }
  document.documentElement.style.setProperty('--safe-top', `${Math.round(top)}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${Math.round(bottom)}px`);
}

// ---------- 存储：setStorage → localStorage → 内存 ----------
const mem = {};

export const store = {
  set(key, value) {
    mem[key] = value;
    const m = sdk();
    try {
      if (m && typeof m.setStorage === 'function') {
        m.setStorage({ key, data: value });
        return true;
      }
    } catch { /* 降级 */ }
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch { /* 只留内存 */ }
    return false;
  },
  get(key, fallback) {
    const m = sdk();
    try {
      if (m && typeof m.getStorage === 'function') {
        const r = m.getStorage({ key });
        if (r && r.data !== undefined && r.data !== '') return r.data;
      }
    } catch { /* 降级 */ }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null && raw !== '') return raw;
    } catch { /* 降级 */ }
    return mem[key] !== undefined ? mem[key] : fallback;
  },
  number(key, fallback) {
    const raw = store.get(key, '');
    if (raw === '') return fallback;
    const n = Number(raw);
    return Number.isNaN(n) ? fallback : n;
  },
};

// ---------- 能力调用 ----------
function classify(err) {
  const e = err || {};
  const code = e.errno !== undefined ? e.errno : (e.errCode !== undefined ? e.errCode : e.code);
  const key = code === undefined || code === null ? '' : String(code);
  return ERR_MAP[key] || 'FAILED';
}

function invoke(name, payload) {
  if (!cap(name)) return { status: 'UNSUPPORTED', method: name };
  const m = sdk();
  try {
    const ret = m[name](payload === undefined ? {} : payload);
    const r = ret || {};
    const code = r.errno !== undefined ? r.errno : r.errCode;
    if (code !== undefined && code !== null && String(code) !== '0') {
      return { status: classify(r), method: name, raw: ret };
    }
    return { status: 'SUCCESS', method: name, raw: ret };
  } catch (e) {
    return { status: classify(e), method: name, error: e };
  }
}

export const saveImage = (dataUrl) => invoke('saveImageToAlbum', { filePath: dataUrl });
export const share = (payload) => invoke('share', payload);
export const followAuthor = () => invoke('followAuthor');
export const postNote = (payload) => invoke('postNote', payload);

export function haptic() {
  try {
    if (cap('vibrateShort')) sdk().vibrateShort({ type: 'light' });
  } catch { /* 忽略 */ }
}

// ---------- toast ----------
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, 2200);
}
