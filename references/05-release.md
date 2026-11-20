# 05 打包、上传、预览、送审

这条链路里每一步都可能被平台卡住，**顺序不能跳**：自检 → 打包 → 上传包 → 上传图 → 预览二维码 → 用户扫码确认 → 送审。任何一步没做就往下走，结果都是白跑一轮审核。

## 0. 前置

1. `minitool-zip-builder` 规范 skill 已读（在线文档 `https://miniapp-sandbox.xiaohongshu.com/minitool/doc` 是唯一契约，读一次看有没有新增能力）。
2. `redapp-cli` 可用，且版本检查通过（见 `06-builtin-commands.md`）。
3. `preflight` 全 PASS（`docs/preflight.json` 在）。
4. 用户已同意「现在开始上传」——登录、上传、送审是三次不同的同意，别混。

## 1. 打包

```bash
node scripts/make-zip.js --dir ./dist --out "release/<工具名>.zip"
```

打包规则（脚本已实现，这里写清为什么）：

- **根目录直接是 `index.html`**，不许再套一层文件夹（多一层平台解压后找不到入口）。
- 排除：`node_modules/`、`.git/`、`*.map`、`src/`、`*.md`、`__MACOSX/`、`.DS_Store`、`._*`。
- 不打包开发用文件（测试脚本、方案文档）。
- 体积：zip ≤10 MiB 硬上限，**建议 ≤2 MiB**（首屏加载和审核速度都受影响）。

## 2. 自检

```bash
node scripts/preflight.js --zip "release/<工具名>.zip" \
  --name "<名字>" --slogan "<简介>" \
  --icon "release/<工具名>-图标.png" \
  --cover "release/<工具名>-封面.png" \
  --version 1.0.0
```

- 输出里 `fails` 必须为空。有 FAIL 就修源文件重新打包，**不许手动改 zip**。
- `warns` 看一眼，能在 10 分钟内解决的就解决（比如外部链接、可选链语法）。
- 把 JSON 存到 `docs/preflight.json`，报告里引用路径。

## 3. 上传代码包

```bash
# 第一次只做 dry-run，看清 plan
redapp upload --file "release/<工具名>.zip" --type pkg --agent --source thirdAgent --dry-run

# 确认无误再带 planHash 执行
redapp upload --file "release/<工具名>.zip" --type pkg --agent --source thirdAgent --confirm "<planHash>"
```

拿到返回里的 `fileId` 和 `md5`，**两个都记下来**，送审要用。写进 `release/提交记录.md`。

## 4. 上传图标和封面

```bash
redapp upload --file "release/<工具名>-图标.png" --type image --agent --source thirdAgent --dry-run
redapp upload --file "release/<工具名>-图标.png" --type image --agent --source thirdAgent --confirm "<planHash>"

redapp upload --file "release/<工具名>-封面.png" --type image --agent --source thirdAgent --dry-run
redapp upload --file "release/<工具名>-封面.png" --type image --agent --source thirdAgent --confirm "<planHash>"
```

拿到 `iconFileId`、`coverFileId`。**图片 fileId 会过期**，别提前一天传完放着——上传完图片就接着做预览送审。

## 5. 生成预览二维码（硬门禁）

```bash
# preview.json
{
  "pkgFileId": "<代码包 fileId>",
  "md5": "<代码包 md5>",
  "appName": "<名字>",
  "version": "1.0.0",
  "iconFileId": "<图标 fileId>"
}

redapp preview --file preview.json --agent --source thirdAgent --dry-run
redapp preview --file preview.json --agent --source thirdAgent --confirm "<planHash>" --qr-out ./release/preview-qr.png
```

**拿到二维码后必须把图片发给用户**（`![预览二维码](<绝对路径>)`），不能只给路径。然后说清三件事：

> 1. 用**小红书 App** 扫码，进到预览版；也可以点这个链接用手机浏览器打开（`authorizeH5Url`）。
> 2. 请在手机上真的玩一局：操作、结算、海报、保存、发笔记、关注，都点一遍。
> 3. 有任何不对的地方直接说，我改完重新出码。**确认没问题再回我「预览通过」。**

拿到用户「预览通过」之前，**不许送审**。用户说「扫了」「看到了」「应该没问题」都不算——要的是明确的那句确认。

## 6. 送审

```bash
# submit.json（新建，不带 appId）
{
  "appName": "<名字>",
  "slogan": "<简介>",
  "iconFileId": "<图标 fileId>",
  "coverFileId": "<封面 fileId>",
  "version": "1.0.0",
  "pkgFileId": "<代码包 fileId>",
  "md5": "<代码包 md5>",
  "categories": ["<分类 code>"],
  "authorizations": []
}

redapp submit --file submit.json --agent --source thirdAgent
```

字段规矩：

- `version` 三段数字，新建必须 `1.0.0`。
- `categories` **恰好一个** code（分类清单用 `redapp list` 或官方文档确认，别自己编）。
- `authorizations` 没有就 `[]`，不要省略字段。
- 新建**省略** `appId`；给已有工具发新版本才带 `appId`。
- `source` 走命令行，**不许写进 JSON**；多写字段 CLI 会直接拒。

送审成功后状态是「审核中」（status=1）。**这不是发布成功**，告诉用户：

> 已送审，现在是「审核中」。审核通过后我再帮你确认状态；这期间别改这个版本，要改就等结果出来发新版本。

## 7. 状态查询与后续

```bash
redapp status --app-id <appId> --agent --source thirdAgent
redapp history --app-id <appId> --agent --source thirdAgent
```

状态码：`0` 未发布 / `1` 审核中 / `2` 已发布 / `3` 未通过 / `4` 已下架。

## 8. 驳回处理

用户说「被拒了 / 没通过」时：

1. **先要原文**：把平台给的驳回原因一字不差贴出来（截图也行）。不要凭猜测改。
2. 对照原因分类：

| 常见原因 | 处理 |
|---|---|
| 内容/玩法违规（含赌博、诱导、低俗） | 改玩法或文案，删掉敏感元素，必要时换题材 |
| 素材侵权（角色/logo/音乐） | 全部重做成原创，不接受「差不多」 |
| 名字/图标/封面不合规（撞名、含平台词、图不清） | 按 `04-branding.md` 重做，换名字 |
| 功能不可用（进不去、白屏、某个按钮报错） | 按原因复现，修完 P6 回归 |
| 描述与实际不符 | 改简介和实际功能对齐 |
| 疑似马甲包/重复提交 | 说明改动，或换差异化的内容 |

3. 改完**必须发新版本**（`1.0.1`），**不能重发同一个包**。
4. 新版本同样要走：preflight → 上传 → **新预览码** → 用户确认 → 送审。驳回后的重提**预览也要重做**。

## 9. 授权边界（写清，别越界）

| 动作 | 需要用户同意 | 说明 |
|---|---|---|
| 安装 CLI / 依赖 | 是 | 联网、写磁盘，先说明再装 |
| 登录授权 | 是 | 出二维码，用户扫；不扫就停下 |
| 上传包/图 | 是 | 会产生线上记录 |
| 生成预览码 | 是（通常和上传一起问） | 用户要知道「现在要扫码验收了」 |
| 送审 | 是，且必须已拿到「预览通过」 | 送审 = 进入人工审核 |
| 发布/上架 | 平台自动，不需你操作 | 别承诺时间 |

**已经同意上传 ≠ 同意送审 ≠ 同意发布。** 每步单独确认。

## 10. 提交记录（每次都要写）

`release/提交记录.md`：

```markdown
| 日期 | 版本 | 包 size | md5 | pkgFileId | iconFileId | coverFileId | 预览码 | 送审时间 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-20 | 1.0.0 | 1.2MB | a1b2... | f_xxx | i_xxx | c_xxx | release/preview-qr.png | 15:20 | 审核中 |
```

## 常见报错对照

| 报错/现象 | 原因 | 处理 |
|---|---|---|
| md5 不匹配 | 上传后又改了包 / 传错文件 | 重新上传，用新的 md5 |
| fileId 无效/过期 | 图片传太早或传到了别的环境 | 重传图片，再做预览 |
| 字段不允许 | JSON 里多写了字段（常见 `source`、`appId` 放错） | 严格按字段表重写 |
| 解压找不到 index.html | zip 多套了一层目录 | 用 `make-zip.js` 重打 |
| 体积超限 | 素材太大 | 压图、去 map、拆大图 |
| 名字/简介超长 | 超过 14 字符 | 改短，用 preflight 量 |
| 图片比例不对 | 图标不是 1:1 / 封面不是 3:4 | 重出图，不要拉伸 |
| 登录失效 | token 过期 | 重新出二维码给用户扫 |
