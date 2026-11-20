# game-to-xhs · 小红书小工具工坊

[![check](https://github.com/DavidLiu12-code/game-to-xhs/actions/workflows/check.yml/badge.svg)](https://github.com/DavidLiu12-code/game-to-xhs/actions/workflows/check.yml)

把一个「想法」或「一个想复刻的小游戏」，在**同一个对话里**做成能提交审核的小红书小工具。

这个 skill 是一整套流程 + 可执行工具，不是提示词合集：它带着两套跑得起来的起步工程、一个打包前自检脚本、一个零依赖打包脚本，以及一份从真实上线项目里踩出来的平台踩坑清单。

```
想法 / 复刻链接
   → 需求引导（每轮 3–5 个问题，给选项和推荐）
   → 方案冻结（12 份文档，用户逐条确认）
   → 分阶段开发（P3 骨架 → P4 玩法 → P5 界面音频 → P6 平台能力）
   → 名字 / 简介 / 图标 / 封面（符合平台硬规格）
   → preflight 自检 → 打 zip → 上传 → 预览二维码 → 送审
```

## 它解决什么问题

常见做法是「先找 AI 聊方案 → 把方案压成一个包 + 一段提示词，丢给另一个 agent 写代码」。这个流程有四个固定失败点：

| 断点 | 这里的做法 |
|---|---|
| 方案和代码不在同一个上下文里，细节一传就丢 | 从对话到代码到送审，**全程同一个 agent**，不转包 |
| 「在我浏览器里能跑」被当成「能上线」 | 明确区分浏览器 / 模拟器 / 真机三层，只有真机能写平台功能 PASS |
| 拿不到原版数值就编一个 | 证据分级 VERIFIED / PARTIAL / UNKNOWN，UNKNOWN 只进风险表，不进代码常量 |
| 「已提交」被当成「已发布」 | 三道门禁：方案冻结、preflight 全 PASS、预览二维码 + 用户明确回复「预览通过」 |

## 依赖

这个 skill 本身是**流程与工具**，真正跟小红书平台交互靠三个配套 skill / CLI：

| 依赖 | 用途 | 是否必需 |
|---|---|---|
| `minitool-zip-builder` | 小工具开发规范：容器能力、离线打包、兼容基线 | 写代码前必需 |
| `redapp-cli` | 上传代码包/图片、生成预览二维码、送审、状态查询、本地模拟器 | 发布阶段必需 |
| `redskillhub-upload` | 把 skill 发布到小红书 SkillHub | 只有「发布 skill」时需要 |

安装口令原文在 `references/06-builtin-commands.md`，里面也写了安装后的版本校验方式（`CLI_VERSION_JSON.status` 只认 `current` / `installed` / `updated`）。

另外需要：Node.js ≥ 20（`redapp dev` 需要 20+）、一个小红书小工具创作者账号。

## 安装

克隆或下载后，把整个目录放到当前 agent 的用户级 skill 目录，目录名必须和 `SKILL.md` 里的 `name` 一致：

```bash
# macOS / Linux
git clone https://github.com/DavidLiu12-code/game-to-xhs.git ~/.dsh/skills/game-to-xhs

# Windows PowerShell
git clone https://github.com/DavidLiu12-code/game-to-xhs.git "$env:USERPROFILE\.dsh\skills\game-to-xhs"
```

也可以手动复制。装完新开会话（或重启 agent），skill 列表里应出现 `game-to-xhs`。

> 目录名写错成别的名字，多数 agent 会拒绝加载。

## 目录结构

```
game-to-xhs/
├── SKILL.md                    # 主入口：铁律、六阶段、对话规范、技术路线
├── references/
│   ├── 01-dialogue.md          # 引导对话剧本：问什么、怎么问、什么算聊清楚了
│   ├── 02-spec-package.md      # 12 份方案文档的模板与粒度
│   ├── 03-build-gates.md       # P3–P7 验证项与证据要求
│   ├── 04-branding.md          # 名字/简介/图标/封面硬规格 + 生成提示词
│   ├── 05-release.md           # 打包、上传、预览二维码、送审、驳回处理
│   ├── 06-builtin-commands.md  # 依赖安装口令原文与校验步骤
│   └── 07-pitfalls.md          # 平台踩坑清单（现象 → 原因 → 正确做法）
├── scripts/
│   ├── preflight.js            # 打包前自检（零依赖，node 直接跑）
│   └── make-zip.js             # 生成根目录含 index.html 的 zip（零依赖）
└── templates/
    ├── stable-app/             # 零构建起步工程：纯 HTML + 外置 JS（ES2017 IIFE）
    └── vite-app/               # Vite 工程化起步工程：源码 ESM，构建到 ES2017 + IIFE
```

## 自检脚本

`preflight.js` 会检查人和 CLI 都不会替你检查的东西：

- 名字 / 简介是否 ≤14 字符（按 JS `.length`，emoji 可能算 2）
- 图标是否 1:1、封面是否 3:4（直接解析 PNG IHDR / JPEG SOF，不信任文件名）
- zip 包结构：中央目录解析、根目录必须直接是 `index.html`、拒绝绝对路径 / `..` 越界 / 重复路径 / 软链 / 隐藏文件 / 音视频扩展名
- 源码扫描：内联 `<script>`、行内 `on*=`、`javascript:`、外链、`fetch` / `XHR` / `eval` / `new Function` / WASM、ES2020+ 语法、Chrome 61 不支持的 CSS、安全区兜底、存储降级链

```bash
# 检查目录
node scripts/preflight.js --dir ./dist --name "点点星球" --slogan "30秒看谁点得准" \
  --version 1.0.0 --icon icon.png --cover cover.png

# 打包
node scripts/make-zip.js --dir ./dist --out release/tool.zip

# 检查 zip
node scripts/preflight.js --zip release/tool.zip --name "点点星球" --slogan "30秒看谁点得准" \
  --version 1.0.0 --icon icon.png --cover cover.png --json docs/preflight.json
```

退出码：`0` 通过、`1` 有 FAIL、`2` 用法或输入错误。

## 开发自检 / CI

仓库自带 GitHub Actions（[`check.yml`](.github/workflows/check.yml)），每次 push 会跑：

1. `node --check` 语法检查（脚本与零构建模板）
2. 生成测试用图标（512×512）与封面（1080×1440）
3. 零构建模板 preflight → 必须 0 FAIL
4. `make-zip.js` 打包 → 再对 zip 跑一次 preflight
5. Vite 模板 `npm install` + `build` → 对 `dist/` 跑 preflight
6. **反例回归**：喂 512×600 的图标和 1000×1000 的封面，必须被拦下并报出 1:1 / 3:4 错误

本地跑同一套：

```bash
node scripts/dev-make-test-images.js .test-assets
node scripts/preflight.js --dir templates/stable-app --name 演示工具 --slogan 一句话说明 \
  --version 1.0.0 --icon .test-assets/icon.png --cover .test-assets/cover.png
```

`scripts/dev-make-test-images.js` 只是生成自检用的纯色 PNG，不是设计素材。

## 已验证 / 未验证

已验证（Windows + Node v24.19.0）：

- `templates/stable-app/`：preflight 0 FAIL 0 WARN → `make-zip.js` 打出 6 文件 / 33KB → 12.6KB 的 zip → `preflight --zip` 仍 0 FAIL
- `templates/vite-app/`：`npm install` + `vite build` 通过（产物约 16KB），构建产物 preflight 0 FAIL 0 WARN → 打包后 6.7KB
- 故意做错的输入会被拦下：图标 512×600 报「图标必须是 1:1」，封面 1000×1000 报「封面必须是 3:4」

未验证 / 会随平台变化的：

- 真机（Android / iOS）扫码后的表现只能由真实设备确认，脚本不代替这一步
- 小红书平台的表单限制、端能力权限、SkillHub 上传白名单都可能调整；`references/` 里的数值是写作时的实测结果，用之前建议核对一次官方文档

## 已知限制

- 平台**不支持直接上传 mp3 / wav 等音频文件**，音频只能走 Web Audio 程序化合成（模板里已实现）；改扩展名规避会被拒，且不要静音交付还标「通过」。
- 容器内 CSP 禁止内联脚本、行内事件、外链资源、`fetch` / `XHR`、ESM 直出，JS 必须外置并用传统 IIFE。
- 容器里 `env(safe-area-inset-*)` 恒为 0，安全区要靠 `getWindowInfo()` 取到再写成 CSS 变量（模板里已处理）。
- 平台能力按「方法是否存在」判断，不要按版本号猜；SDK 缺失时页面必须完整可玩。

## 免责声明

本项目是**第三方个人工具**，与小红书官方无隶属或背书关系。所有平台接口、限制、审核标准以官方文档和实际控制台为准；使用本项目产生的内容、账号和合规责任由使用者承担。`references/06-builtin-commands.md` 里的安装口令来自官方发布页，仅作流程内引用。

## License

MIT，见 [LICENSE.md](LICENSE.md)。
