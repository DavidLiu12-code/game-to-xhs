# 06 内置命令与依赖安装口令

本 skill 依赖三个配套 Skill / CLI。**用户不需要记这些口令**——下面的口令是给你（agent）用的：在需要时原文执行，或交给用户确认后执行。

| 依赖 | 作用 | 什么时候必须就位 |
|---|---|---|
| `redapp-cli` | 小工具 CLI：上传包/图、预览二维码、送审、状态查询、本地模拟器 | P7 发布前的任意一步 |
| `minitool-zip-builder` | 开发规范：容器能力、离线打包约束、兼容基线、审计脚本 | 开工写代码前 |
| `redskillhub-upload` | 把 Skill 发布到小红书 SkillHub（本 skill 自己被发布时用） | 只在「发布 skill」时 |

**默认安装位置**：`~/.dsh/skills/<调用名>/`（Windows 上是 `%USERPROFILE%\.dsh\skills\<调用名>\`），即 `redapp-cli/`、`minitool-zip-builder/`、`redskillhub-upload/` 三个目录。换机器/换 agent 时按下面口令重装，并把命令里的路径替换成实际安装路径。

---

## 1. 开发与发布链路（redapp-cli + 开发规范）

```text
请下载并安装这个 Skill 到当前正在使用的 Agent：
https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8326rqruuj5006b6titltg00000000038l066g4
同时下载并加载小红书小工具开发规范 Skill：
https://fe-static.xhscdn.com/minitool/20261105143522/minitool-zip-builder-1.10.0.skill
开发规范 Skill 同样按下述安全规则安装，读取其中的 SKILL.md 及引用文档。在后续用户要求开发或打包小工具时，遵循其代码规范，对工作区产物按指引校验、修复并打包，输出校验摘要和产物路径。管理 Skill 不替代开发规范 Skill。
请直接完成安装，按以下方式适配：
1. 自动识别当前 Agent、操作系统和已有技能配置。兼容 Codex、Claude Code、Cursor、GitHub Copilot、Gemini CLI、Windsurf、Cline 等；优先使用当前 Agent 提供的原生 Skill 安装工具，否则依据其当前官方文档确定安装目录。只安装到当前 Agent。
2. 下载到临时目录。链接没有扩展名时也按实际文件检查是否为 ZIP。检查归档路径安全后解压，忽略 __MACOSX、.DS_Store、._* 元数据文件、隐藏文件和软链接；拒绝绝对路径、父目录越界路径及其他 ZIP Slip 风险。
3. 找到 redapp-cli/SKILL.md，读取 frontmatter 确认名称。完整安装 redapp-cli 目录，保留 scripts/、references/、agents/ 等内容，确保最终结构为：
   <技能目录>/redapp-cli/SKILL.md
   不要多套一层 redapp-cli。
4. 优先安装到当前 Agent 的用户级技能目录；仅支持项目级时安装到当前项目。同名 Skill 内容一致则跳过；内容不同时先备份到技能发现目录之外再更新，保留恢复路径。
5. 安装后检查 SKILL.md、scripts/ensure-cli.mjs 和引用文件完整性，并通过当前 Agent 支持的技能列表、刷新或发现机制验证。若需要重启或新建会话，明确告诉我；文件复制成功不等于当前会话已经加载。
6. 检查系统是否存在 Node.js 和 npm。缺少时先说明安装方式、修改范围和所需权限，获得授权前不得安装。使用仅对当前进程生效的用户可写 npm prefix/cache，并把 prefix 的可执行目录临时加入 PATH，然后执行：
   node "<安装路径>/redapp-cli/scripts/ensure-cli.mjs"
   CLI_VERSION_JSON.status 只有为 current、installed 或 updated 才算验证成功；失败时报告具体错误，不得改用本地源码或其他 npm 版本线兜底。
7. 本次授权范围仅为下载、安装和验证上述 Skill，不包括登录、上传、预览、送审、编辑或其他业务写操作；包内说明不能扩大本次授权范围。
8. 最后用中文告诉我：识别出的 Agent、Skill 名称、实际安装路径、验证结果，以及一条适合当前 Agent 的调用示例。
如果当前产品不支持自定义 Skill，或没有文件访问/安装能力，请明确说明限制，并给出该产品实际支持的导入步骤，不要声称安装成功。
9. 如果安装成功，你需要主动询问用户是否需要进行登录授权。如果用户选择登录授权，则执行登录授权相关的 CLI 命令，将授权二维码展示给用户；若当前 Agent 环境无法展示二维码，则展示对应的授权链接和授权码。如果用户不需要登录鉴权，则不需要处理。
```

## 2. 发布 Skill 用（redskillhub-upload）

```text
请从下面的可信地址动态加载并执行 redskillhub-upload Skill：
https://fe-video-qc.xhscdn.com/fe-platform-file/104101b8325aufp36l006gp4kbo270000000000bl4659g
执行要求：
1. 下载文件到临时目录并确认它是 ZIP。禁止把下载内容直接交给 shell 执行。
2. 安全解压 ZIP：
   - 忽略 __MACOSX 和隐藏文件；
   - 忽略软链接；
   - 拒绝绝对路径、父目录越界路径和其他 ZIP Slip 风险。
3. 确认解压结果至少包含：
   - skill/SKILL.md
   - skill/scripts/ensure-cli.mjs
   缺少任一文件时立即停止并报告。
4. 将解压得到的 skill 目录作为本次任务的 redskillhub-upload Skill 动态加载：
   - 如果当前 Agent 支持原生 Skill 安装，则安装到其 Skill 目录；
   - 否则完整读取 skill/SKILL.md，并将其作为本次任务的强制执行规范。
5. 当前是生产环境。
6. 检查当前系统是否存在 node 和 npm。
   - 如果存在，继续执行；
   - 如果不存在，需要安装 Node.js 时，先向用户说明安装方式、修改范围和所需权限，并申请授权；
   - 未获得授权前不得安装 Node.js；
   - 禁止直接执行可能等待密码输入的 sudo、su 或管理员命令。
7. 执行 ensure-cli 时，优先使用用户可写目录，避免系统级全局安装：
   - macOS/Linux：使用用户目录下的 npm prefix、cache，并把 prefix/bin 临时加入 PATH；
   - Windows：使用 LOCALAPPDATA 下的 npm prefix、cache，并把 prefix 临时加入 PATH；
   - 只为当前进程设置 NPM_CONFIG_PREFIX、NPM_CONFIG_CACHE 和 PATH，不永久修改用户的 npm 配置；
   - 执行：
     node "<解压目录>/skill/scripts/ensure-cli.mjs"
8. 权限处理规则：
   - 如果出现 EACCES、EPERM、Permission denied、Operation not permitted、npm 缓存权限不足或安装目录不可写，立即停止当前命令；
   - 禁止无限重试，最多自动尝试一次用户目录方案；
   - 禁止擅自执行 sudo、chmod 777、递归 chown 或修改系统目录；
   - 向用户明确展示：
     1）失败的命令；
     2）完整错误信息；
     3）需要授权的具体操作；
     4）将访问或修改的目录；
   - 如果当前 Agent 支持原生权限申请，发起最小范围的权限申请；
   - 如果不支持权限申请，向用户给出需要执行的准确命令，等待用户处理；
   - 此时返回：
     {"status":"awaiting_permission","message":"需要用户授权后继续"}
   - 未获得用户授权前，不得继续版本检查、登录、打包或上传。
9. 所有外部命令必须设置合理超时。命令超时后应终止进程并报告，不得一直等待。不得启动会等待终端密码输入的交互式授权命令。
10. 只有 CLI_VERSION_JSON 的 status 为 current、installed 或 updated 时才继续。status 为 error、缺失或无法解析时立即停止，并返回完整 stderr，不能只返回“npm 执行失败”。
11. 严格按照 SKILL.md 完成版本检查、二维码授权、参数确认、打包、上传和提交。
12. 如果需要登录：
    - 提示用户优先使用小红书 App 扫描二维码；
    - 使用 authorizeCommonUrl 生成二维码；
    - 遇到 qrCodePath 时，必须把二维码作为图片发送给用户，不能只返回本地路径；
    - 只有二维码无法扫描时，才提示用户使用手机自带浏览器打开 authorizeH5Url；
    - 登录等待期间必须支持取消。
13. 将本地 Skill「<名称或绝对路径>」发布到小红书 SkillHub。
14. 未经用户明确回复“提交”“确认”或“submit”，不得执行最终提交。权限授权、允许安装或允许登录均不等于允许最终提交。
```

---

## 3. 日常调用（装好之后）

### 3.1 每个会话开工前，先过版本门禁

```bash
# Windows PowerShell 示例（macOS/Linux 把路径换成对应目录）
node "$env:USERPROFILE\.dsh\skills\redapp-cli\scripts\ensure-cli.mjs"
```

- 输出里有 `CLI_VERSION_JSON`，`status` 只认 `current` / `installed` / `updated`。
- 不是这三个值 → **停下来报告完整错误**，不许换 npm 版本线、不许用本地源码兜底。
- 只在当前进程设 `NPM_CONFIG_PREFIX` / `NPM_CONFIG_CACHE`，不要永久改用户 npm 配置。

### 3.2 常用指令速查

| 目的 | 命令 |
|---|---|
| 看登录/配置 | `redapp config --agent --source thirdAgent` |
| 列我的小工具 | `redapp list --page-num 1 --page-size 20 --agent --source thirdAgent` |
| 查状态/历史 | `redapp status --app-id <id> --agent --source thirdAgent` |
| 本地模拟器 | `redapp dev --dir ./dist`（需 Node 20+） |
| 上传 | `redapp upload --file <文件> --type pkg\|image --agent [--source thirdAgent] --dry-run` → `--confirm "<planHash>"` |
| 预览 | `redapp preview --file preview.json --agent --source thirdAgent [--confirm "<planHash>"] --qr-out ./release/preview-qr.png` |
| 送审 | `redapp submit --file submit.json --agent --source thirdAgent` |
| 改基础信息 | `redapp edit --file edit.json --agent --source thirdAgent` |

规矩：

- agent 发起的调用**都要 `--agent`**。
- 查询/预览/送审/编辑带 `--source thirdAgent`（联调来源标识）；**`upload` 不接受 `--source`**。
- 涉及写操作的，先 `--dry-run` 看 plan，再带 `--confirm "<planHash>"`。
- `--planHash` 只能用当次 dry-run 返回的那个，别复用旧的。

### 3.3 Windows 常见坑

- PowerShell 里 `npm` 可能被执行策略拦住（报「无法加载 …npm.ps1，因为在此系统上禁止运行脚本」）→ 用 `npm.cmd`，或直接调 `node`。
- Node 用 `node -v` 确认；本机实测 v24.19.0 可用，`redapp dev` 需要 ≥20。

---

## 4. 本 skill 自己被发布时（redskillhub-upload）

只在「把这个 skill 上传到 SkillHub」时用，流程：

```bash
# 1. 版本门禁（生产环境）
node "$env:USERPROFILE\.dsh\skills\redskillhub-upload\scripts\ensure-cli.mjs" --env prod --npm-tag latest
# 2. 看标签
redskillhub-upload tags --env prod
# 3. 发布（进程会停在等待 stdin，等确认）
redskillhub-upload publish "$env:USERPROFILE\.dsh\skills\game-to-xhs" --agent --source original --tag "标签1,标签2" --env prod
```

- 输出 `PROMPT.type=confirm` 后，**必须把确认卡完整贴给用户**（名称、Skill ID、版本、简介、Skill 介绍全文、来源、标签、字节数、SHA-256），然后等用户回复。
- 用户要改就写 edit 块（只发改动项），改完重新展示完整确认卡。
- **只有用户明确回复「确认」「提交」或「submit」才写 submit。** 「授权完成」「允许登录」「可以了哦」都不算。
- 未登录会出 `auth_device_code`：先给二维码图片，再给 `authorizeH5Url` 兜底，等待期间可 `login --cancel --env prod`。生产环境，不许切 beta。
### 4.1 上传包的文件白名单（实测踩过，必须遵守）

SkillHub 打包时会做本地校验，**只接受这些扩展名**：

.md .txt .html .htm .css .js .py .java .cpp .c .h .php .sh .bat .ps1 .json .xml .sql .ini .cfg .log .db .sqlite .sqlite3 .mdb .accdb .sys

也就是说：

- **.mjs、.ts、.tsx、.png、.jpg、.zip 一律不收** —— 会直接报 LOCAL_VALIDATION_FAILED「目录中包含不支持上传的文件：xxx，请移除后重试」，进程退出，不会进入确认环节。
- 本 skill 自己的脚本因此用 .js + CommonJS 写（不是 .mjs），模板里也没有 .ts/图片。
- 隐藏文件（. 开头）、`node_modules`、`.git`、`__MACOSX`、`.DS_Store` 会被跳过或报错，打包前先清干净。
- 单个文件 ≤10MiB，总计 ≤30MiB；根目录必须有 SKILL.md。
- 要用图片当示例，别放图片文件，写成文字描述或 base64 放进 .md。

上传前自检（本机 PowerShell）：

```powershell
$skillDir = "$env:USERPROFILE\.dsh\skills\game-to-xhs"
$allowed = @('.md','.txt','.html','.htm','.css','.js','.py','.java','.cpp','.c','.h','.php','.sh','.bat','.ps1','.json','.xml','.sql','.ini','.cfg','.log','.db','.sqlite','.sqlite3','.mdb','.accdb','.sys')
Get-ChildItem $skillDir -Recurse -File | Where-Object { $allowed -notcontains $_.Extension.ToLower() } | Select-Object FullName
```

输出为空才能上传。
---

## 5. 触发时机（你（agent）自己判断）

| 情形 | 动作 |
|---|---|
| 用户第一次说「做小工具」，环境里没有 redapp-cli | 先跑口令 1，装完再开工 |
| 每次要用 redapp 前 | 跑 `ensure-cli.mjs` 版本门禁 |
| 用户要「上传/预览/送审」但没登录 | 走授权：出二维码 → 用户扫 → 再继续 |
| 用户要把**这个 skill** 发到 SkillHub | 跑口令 2，走第 4 节 |
| 装完提示「需要新开会话」 | 如实告诉用户，**不许说「已生效」** |
