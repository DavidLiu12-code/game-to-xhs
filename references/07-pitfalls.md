# 07 踩坑清单（已实测的坑，别再踩一遍）

来源：11 个已上架/已开发的小工具实测。**每一条都对应一次真实的失败**，不是理论风险。

排错顺序：先看「现象」找到你的问题 → 看「原因」确认为什么 → 按「正确做法」改 → 回到对应门禁重验。

---

## A. 加载与 CSP（页面根本起不来）

### A1 白屏，控制台报 CSP 拒绝执行内联脚本

**原因**：容器 CSP 禁止内联 `<script>`、行内 `on*` 事件、`javascript:` URI。
**正确做法**：所有 JS 放外置 `.js` 文件，用 `<script src>` 引入；事件一律 `addEventListener`，不写 `onclick="..."`。

### A2 白屏，报加载不到 `app.js` / 路径 404

**原因**：zip 里多套了一层目录，或用了绝对路径 `/app.js`。
**正确做法**：zip 根目录直接是 `index.html`；引用写相对路径 `./app.js`（`./` 别省）。

### A3 `fetch is not defined` / `XMLHttpRequest` 报错

**原因**：容器禁网。任何 `fetch`、XHR、外链 CDN、图片外链都会失败。
**正确做法**：所有资源打进 zip。需要数据就写死在 js 里或用 JSON 内联。**没有例外**。

### A4 `eval` / `new Function` / ESM `import` 直接报错

**原因**：容器禁 `eval`、`new Function`、WASM；脚本按传统脚本执行，不支持 `<script type="module">`。
**正确做法**：用传统 IIFE：
```js
(function () {
  'use strict';
  // 全部逻辑
})();
```

### A5 上传时某个文件被拒

**原因**：白名单里**没有** mp3 / wav / ogg / m4a / webm 等音频与视频扩展名。
**正确做法**：音频用 Web Audio 程序化合成（见 E 节）。**不许**改扩展名绕过，**不许**静音交付还标「音频通过」。

---

## B. 安全区与布局（内容被状态栏/Home 条压住）

### B1 顶部标题被状态栏压住，底部按钮被 Home 条挡住

**原因**：容器里 `env(safe-area-inset-*)` **恒为 0**，CSS 的 `padding-top: env(safe-area-inset-top)` 等于没写。
**正确做法**：用 `getWindowInfo()`（9.49+）取真实值，写成 CSS 变量：

```js
(function () {
  var info = null;
  try {
    if (window.xhs && window.xhs.miniTool && window.xhs.miniTool.getWindowInfo) {
      info = window.xhs.miniTool.getWindowInfo();
    }
  } catch (e) { info = null; }

  var top = 44, bottom = 34;                    // 兜底值
  if (info && typeof info.statusBarHeight === 'number') top = info.statusBarHeight;
  if (info && info.safeArea && typeof info.safeArea.bottom === 'number') {
    bottom = Math.max(0, info.screenHeight - info.safeArea.bottom);
  }

  var root = document.documentElement;
  root.style.setProperty('--safe-top', top + 'px');
  root.style.setProperty('--safe-bottom', bottom + 'px');
})();
```

CSS 兜底：

```css
.page {
  padding-top: max(env(safe-area-inset-top), var(--safe-top, 44px));
  padding-bottom: max(env(safe-area-inset-bottom), var(--safe-bottom, 34px));
}
.stage { height: 100vh; height: 100dvh; }   /* 100vh 必须在前，做兜底 */
```

### B2 页面高度不对，底部被截掉一截

**原因**：只写了 `100dvh`，Chrome 61 不认；或用了 `height: 100%` 但父级没定高。
**正确做法**：`100vh` 在前 `100dvh` 在后（浏览器不认就退回前者）；`html, body { height: 100%; }` 显式给。

### B3 弹窗/关卡在 320 宽屏幕上横向溢出

**原因**：固定 px 宽度 + 未做 `max-width`；或用 `vw` 但忽略了 safe-area 内边距。
**正确做法**：容器 `width: 100%; max-width: 430px; padding: 0 16px; box-sizing: border-box;`；所有元素 `max-width: 100%`。

### B4 按钮太小，点不动

**原因**：视觉尺寸 32px 但没扩触控区。
**正确做法**：可点元素实际盒 ≥44×44（用 `getBoundingClientRect()` 量，别目测）；视觉可以小，用 `padding` 或伪元素撑开。

---

## C. 兼容性（只在手机上崩，电脑上好好的）

Chrome 61 / Android 8.1 基线。**浏览器直跑通过 ≠ 真机通过**。

| 用了 | 在 Chrome 61 | 改用 |
|---|---|---|
| `flex` 的 `gap` | 不支持 → 元素贴在一起 | `margin` / `padding` 隔开 |
| `aspect-ratio` | 不支持 → 高度塌陷 | `padding-top: 75%` 占位法 |
| `100dvh` / `svh` | 不支持 → 用 `100vh` 兜底 | 两个都写 |
| `:has()` | 不支持 | 加 class 由 JS 控制 |
| `clamp()` | 不支持 | `min/max/calc` 组合 |
| `?.` 可选链、`??` | 不支持（ES2020） | 用 `&&`、三元 |
| `Object.fromEntries`、`flat` | 不支持 | 手写循环 |
| `BigInt`、`globalThis` | 不支持 | 换写法 |
| CSS `inset` 简写 | 部分不支持 | `top/right/bottom/left` |
| **构建工具自动合成 `inset`** | 定位全乱 | 见下面 C1 |

### C1 源码里写的是 left/right/top/bottom，构建后变成 `inset:`，真机定位全乱

**现象**：本地浏览器、模拟器都正常，真机上元素全挤在左上角或错位。
**原因**：Vite / esbuild 的 CSS 压缩会把相邻的 `left/right/top/bottom` 合并成 `inset: 0 16px`，Chrome 61 不认识这个简写，整条声明被丢弃。
**正确做法**：关掉 CSS 压缩，或构建后检查产物里没有 `inset:`。

```ts
// vite.config.js
build: {
  target: 'es2017',
  cssMinify: false,   // 必须关：否则产物里的 inset: 会让旧机型定位失效
}
```

构建后自检：`Select-String -Path dist\assets\*.css -Pattern "inset\s*:"` 应该没有输出。
（`preflight.js` 也会把产物里的 `inset:` 报成 WARN。）

ES 语法只用 **ES2017** 及以前。写 TS/Vite 的，构建目标设 `es2017` + `format: 'iife'`（见 `templates/vite-app/vite.config.js`）。

---

## D. 存储（刷新就丢分）

### D1 用 `localStorage` 存最佳成绩，真机上丢了

**原因**：`localStorage` 在容器里**不可靠**，不能当唯一持久化。
**正确做法**：优先 `window.xhs.miniTool.setStorage / getStorage`（9.46+），`localStorage` 只做降级。

```js
(function () {
  var KEY = 'best_score';
  var mem = null;                              // 第三层兜底：内存

  function available() {
    return !!(window.xhs && window.xhs.miniTool &&
              window.xhs.miniTool.setStorage && window.xhs.miniTool.getStorage);
  }

  function save(value) {
    mem = value;
    try {
      if (available()) { window.xhs.miniTool.setStorage({ key: KEY, data: String(value) }); return; }
    } catch (e) { /* 落到下一层 */ }
    try { localStorage.setItem(KEY, String(value)); } catch (e) { /* 只留内存 */ }
  }

  function load() {
    try {
      if (available()) {
        var r = window.xhs.miniTool.getStorage({ key: KEY });
        if (r && r.data != null && r.data !== '') return Number(r.data);
      }
    } catch (e) { /* 落到下一层 */ }
    try {
      var raw = localStorage.getItem(KEY);
      if (raw != null && raw !== '') return Number(raw);
    } catch (e) { /* 落到内存 */ }
    return mem;
  }

  window.Store = { save: save, load: load };
})();
```

### D2 存大对象失败

**原因**：单 key ≤1MB、总量 ≤10MB。
**正确做法**：只存必要字段（最高分、设置项、解锁状态），别存整局状态或 base64 图片。存储失败**必须能继续玩**。

---

## E. 音频（上传被拒 / 没声音）

### E1 想放 mp3，上传直接失败

**原因**：白名单没有音频扩展名。
**正确做法**：Web Audio 合成。零音频文件，体积为 0，还能动态调音高。

```js
(function () {
  var ctx = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  // 首次用户手势里调用一次，解锁音频
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }

  // type: 'tap' | 'hit' | 'fail' | 'win' | 'click'
  function beep(type) {
    var c = ensure();
    if (!c) return;
    var map = {
      tap:   { f: 660, d: 0.06, w: 'square' },
      hit:   { f: 880, d: 0.08, w: 'triangle' },
      fail:  { f: 180, d: 0.20, w: 'sawtooth' },
      win:   { f: 1046, d: 0.16, w: 'triangle' },
      click: { f: 440, d: 0.05, w: 'sine' }
    };
    var cfg = map[type] || map.click;
    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = cfg.w;
      osc.frequency.value = cfg.f;
      gain.gain.setValueAtTime(0.12, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + cfg.d);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(); osc.stop(c.currentTime + cfg.d);
    } catch (e) { /* 静音失败不影响玩 */ }
  }

  window.Sfx = { unlock: unlock, play: beep };
})();
```

要点：
- `AudioContext` 必须在**用户手势**里创建/恢复，否则被浏览器挂起。
- 任何一步抛错都吞掉，游戏照常玩。
- 静音开关要持久化（走 D 节存储），并且立刻生效。

### E2 想放背景音乐

**结论**：V1 不做 BGM。合成一段短循环费力且容易刺耳，平台也不支持音频文件。需要氛围就在音效上做（连击升调、结束和弦）。

---

## F. 平台能力（不假成功，不藏入口）

### F1 按版本号判断能力，结果真机上判断错

**原因**：真机 `getSystemInfoSync()` 可能取不到版本号。
**正确做法**：**只看方法是否存在**，三层判空 + try/catch：

```js
function can(name) {
  try {
    return !!(window.xhs && window.xhs.miniTool &&
              typeof window.xhs.miniTool[name] === 'function');
  } catch (e) { return false; }
}
```

统一状态：`SUCCESS` / `CANCELLED` / `UNSUPPORTED` / `FAILED` / `LIMIT_REACHED`。UI 按状态给不同提示，**UNSUPPORTED 就隐藏入口，不是点了才报错**。

### F2 关注作者

`followAuthor` / `getFollowStatus`（9.51+）：

- 只能关注**当前工具的作者**。
- 返回 `1` 已关注 / `2` 是作者本人 / `-1` 失败。
- 错误码：`20002` 用户取消、`15404` 当日 10 次上限、`10003` 进行中。
- 失败只 toast 提示，**不要隐藏入口**，也不要显示「关注成功」。

### F3 分享

`share`（9.53+），**仅全屏容器可用**。半屏/旧版本直接隐藏分享入口。

### F4 发笔记

`postNote`：标题 ≤20 字，正文 ≤1000 字。成功**只代表唤起了发布页**，不代表发布成功。

- 文案写「已打开编辑器，发布后回来继续玩」，**不许写「已发布」**。
- 用户可能中途取消，回来后一切照旧。

### F5 保存图片/海报

- 需要授权：用户拒绝 → 状态记为 `CANCELLED`，只提示「已取消」，**不假装成功**。
- 海报尺寸建议 1080×1440（3:4），`canvas.toDataURL('image/png')` 交给平台。
- 单条 base64 解码后 ≤1MB，别把大图塞进存储。

### F6 SDK 缺失（浏览器/旧容器）

**正确做法**：所有能力入口在启动时检测一次，缺失则隐藏对应按钮；**核心玩法必须完整可玩**。这不是降级，是基本要求。

---

## G. 性能（低端机卡顿）

- 目标 60fps，30fps 可接受；低于 30 就要优化。
- 动画用 `requestAnimationFrame`，别用 `setInterval` 驱动渲染。
- 每帧别创建对象/闭包；复用数组、提前算好常量。
- DOM 节点控制在几百个以内；粒子用 canvas 画，不要生成上千个 div。
- 别在 `scroll`/`resize` 里做重排；高频事件用节流。
- 图片尺寸按实际显示大小出，别拿 2000px 的图缩到 200px 显示。

---

## H. 玩法逻辑（最常见的功能性 bug）

### H1 快速连点导致重复结算 / 重复加分

**正确做法**：状态机 + 幂等判定。结算只能从 `playing` 进 `result` 一次；`input()` 里先检查当前状态。

### H2 同 seed 结果不一致，测试没法复现

**正确做法**：所有随机走一个可注入的 `rand()`；逻辑层不吃 `Math.random`、不吃真实时间。测试时传固定 seed。

### H3 切后台回来瞬移/连掉好几条命

**正确做法**：`tick(dt)` 的 `dt` 做上限裁剪（比如 ≤50ms），或用固定步长累加器。别用 `performance.now()` 差值直接推进。

### H4 判定手感差（明明点到了算没中）

**正确做法**：判定区比视觉区放大 10–20%（触控友好），但结算显示按视觉来；命中反馈要在 100ms 内出现。

### H5 难度只有一条曲线，玩两局就腻

**正确做法**：至少两段加速（前 20 秒教、之后提速）+ 一个随机事件；难度用配置表，不写死在循环里。

---

## I. 交付与报告（话术类坑）

| 错误说法 | 为什么错 | 应该说 |
|---|---|---|
| 「浏览器能跑，所以能上架」 | 容器层完全不同的坑 | 「浏览器通过；模拟器/真机待验」 |
| 「模拟器通过了」当平台功能 PASS | 模拟器能力可能降级 | 只有真机 PASS 才算 PASS |
| 「已提交，等审核通过就好」 | 可能被驳回 | 「已送审，状态审核中」 |
| 「笔记已发布」 | 只是唤起编辑器 | 「已打开发布页，需用户手动发」 |
| 「音频做好了」但没声音 | 假成功 | 实测有声音才写 PASS，否则 NOT_RUN |
| 「原版就是这个速度」 | 没证据 | 标 UNKNOWN，写进风险表 |
| 「图标/封面没问题」 | CLI 不校验比例字数 | 跑 preflight 量过才说 |

**统一原则**：没亲手验证的，写 `NOT_RUN`；验证过的，写清在哪个环境、哪个设备、用什么证据。

---

## J. 一分钟自检（每个项目收尾前过一遍）

- [ ] 外置 JS、无内联脚本、无 `on*`、无 `javascript:`
- [ ] 无 fetch/XHR/外链/CDN/eval/new Function/WASM/ESM
- [ ] 无音频/视频文件
- [ ] 安全区用 `getWindowInfo()`，`100vh` 兜底在
- [ ] ES2017 以内语法；CSS 无 flex gap / aspect-ratio / dvh / :has()
- [ ] 存储走 `window.xhs.miniTool`，localStorage 降级，内存兜底
- [ ] 所有能力「方法存在才显示」，失败有状态提示
- [ ] SDK 缺失可完整玩
- [ ] 同 seed 可复现；连点不重复结算
- [ ] 320 / 390 / 430 无横向滚动、触控 ≥44
- [ ] zip 根目录 index.html、≤10MiB、preflight 全 PASS
