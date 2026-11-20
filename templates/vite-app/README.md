# Vite 模板（工程化路线）

玩法复杂（状态多、界面多、要写单测）时用这条路线。**简单玩法别用**——多一层构建就多一层出错的可能，直接复制 `templates/stable-app/` 更快。

只用 JS，不引 TypeScript：SkillHub 上传白名单里没有 `.ts`，而且这层构建本身已经能解决「ES2020 语法要转成 ES2017」的问题。真想要 TS 见文末。

## 起步

```bash
cd 你的项目目录
# 把本目录内容复制过来，然后：
npm.cmd install        # Windows 上别用 npm.ps1（执行策略会拦）
npm.cmd run build      # 产物在 dist/
```

Windows PowerShell 里如果报「无法加载 npm.ps1，因为在此系统上禁止运行脚本」，用 `npm.cmd`。

## 为什么是这几个配置（别随便改）

| 配置 | 值 | 不改的原因 |
|---|---|---|
| `build.target` | `es2017` | 真机基线 Android 8.1 / Chrome 61 |
| `output.format` | `iife` | 容器按传统脚本执行，不支持 ESM |
| `base` | `'./'` | zip 内是相对路径，绝对路径 404 |
| `assetsInlineLimit` | 1MiB | 容器不能联网，小资源全内联 |
| `cssMinify` | `false` | esbuild 压缩会把 `left/right/top/bottom` 合成 `inset:`，Chrome 61 不认，定位直接失效 |
| `stripModuleType` 插件 | 去掉 `type="module"` 和 `crossorigin` | 这两个属性会让容器不执行脚本 |

`stripModuleType` 是最容易被忽略的一步：Vite 产出的 `index.html` 一定带 `type="module" crossorigin`，容器里直接白屏。

## 产物结构

```
dist/
  index.html
  assets/
    main.js
    main.css
```

`dist/` 就是 zip 的根目录（`index.html` 必须在根）。打包：

```bash
node <skill目录>/scripts/preflight.js --dir ./dist --name "名字" --slogan "简介" \
  --icon 图标.png --cover 封面.png --version 1.0.0
node <skill目录>/scripts/make-zip.js --dir ./dist --out "release/名字.zip"
node <skill目录>/scripts/preflight.js --zip "release/名字.zip" --name "名字" --slogan "简介" \
  --icon 图标.png --cover 封面.png --version 1.0.0
```

preflight 会扫 `dist/` 里的 js/css，如果还残留 `?.`、`??`、`type="module"`、`inset:`、外链、内联脚本，会直接报出来。

## 代码组织

| 文件 | 职责 |
|---|---|
| `src/core.js` | 纯逻辑：不碰 DOM，不读 `Math.random`/`Date.now`，同 seed 可复现 |
| `src/platform.js` | 容器桥接：安全区、存储三层、能力状态归一 |
| `src/audio.js` | Web Audio 合成音效（平台不支持音频文件） |
| `src/main.js` | 界面与主循环（固定步长 1/60，dt 上限 50ms） |
| `src/styles.css` | Chrome 61 兼容样式 |

源码里可以用 ESM `import`/`export`（构建时会被打成 IIFE），但**构建产物里不能有 ESM**。

换玩法只改 `core.js` 的 `create/input/tick/snapshot`，再改 `main.js` 的渲染部分。

## 想用 TypeScript 的话

不在这套模板里，原因：SkillHub 上传白名单不含 `.ts`，带 TS 源码的 skill 包会被 CLI 直接拒。想用就在本地自己升级，别放进要上传的 skill 包：

```bash
npm.cmd install -D typescript
# 把 src/*.js 改成 *.ts，补 tsconfig.json（target ES2017、module ESNext、moduleResolution Bundler）
# 构建前先 tsc --noEmit 检查类型
```

`vite build` 的配置不用动。

## 注意

- **构建通过 ≠ 容器能跑**。必须 `redapp dev --dir ./dist` 模拟器验一遍，再真机扫码验一遍。
- 需要图片资源时放 `src/assets/` 再 `import` 进来，会被内联成 base64（单张别超过 100KB，否则 zip 会胖）。
- `npm install` 会给 devDependencies 装 esbuild 等，装完记得 `.gitignore` 掉 `node_modules`（本目录没带 `.gitignore`，因为隐藏文件会被上传校验拦）。
