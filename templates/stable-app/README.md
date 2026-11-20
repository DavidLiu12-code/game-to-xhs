# 零构建模板（stable-app）

**这是能直接跑的最小子集，不是成品。** 复制到你的 `src/`（或直接当 `dist/` 用），然后改：

| 文件 | 改什么 |
|---|---|
| `index.html` | `<title>`、页面结构、文案 |
| `styles.css` | 配色变量 `:root`、布局 |
| `core.js` | **玩法规则**（唯一该大改的地方） |
| `app.js` | 界面流程、渲染、按钮绑定 |
| `platform.js` | 平台能力（一般不用改，加能力时照抄结构） |
| `audio.js` | 音效音色（默认够用） |

内置了一个完整的「点点星球」示例玩法，可以直接玩通，也可以整个删掉换成你的玩法。

## 已经做对的事（别改坏）

- 所有 JS 外置，无内联脚本、无 `on*`、无 `javascript:`
- 纯 ES5/ES2017 语法，Chrome 61 可跑，传统 IIFE，无 ESM
- 无 fetch/XHR/外链/CDN/eval/WASM
- 安全区用 `getWindowInfo()` 写 CSS 变量，`max(env(...), var(--safe-*))` 兜底
- `100vh` 在前 `100dvh` 在后
- 存储走 `window.xhs.miniTool.setStorage`，localStorage 降级，内存兜底
- 平台能力按「方法是否存在」判断，缺失就隐藏入口，SDK 不存在也能完整玩
- 逻辑层 `core.js` 不碰 DOM、不读 `Math.random`，同 seed 可复现
- 固定步长 1/60 主循环，`dt` 上限 50ms，切后台回来不跳帧
- 音效全程序化合成，零音频文件

## 换玩法时改哪里

1. 只改 `core.js` 的 `create/input/tick/snapshot` 四个函数，保持签名不变。
2. `app.js` 里 `renderTarget` / `renderHud` 换成你的画面。
3. 结算屏（`#screenResult`）保留「分数 + 最佳 + 再来一局 + 成绩图」，这三样是留存关键。
4. 改完跑：

```bash
node ../../scripts/preflight.js --dir . --name "名字" --slogan "简介" \
  --icon 图标.png --cover 封面.png --version 1.0.0
```

## 本地调试

直接双击 `index.html` 能玩（没有 `window.xhs` 时平台按钮自动隐藏）。
进容器调试用 `redapp dev --dir ./dist`，真机验收必须扫码。

## 注意

- 这个模板的 `stage` 用百分比定位目标，真实项目里有 canvas 需求时，把 canvas 放进 `.stage` 里并处理 DPR（`canvas.width = cssWidth * dpr`）。
- 分数存的是字符串（`setStorage` 只收字符串），读的时候用 `Number()` 转，别直接比较。
