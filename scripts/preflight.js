#!/usr/bin/env node
/**
 * 小红书小工具 preflight 自检
 *
 * 零依赖，只用 Node 内置模块。检查项对应平台真实卡点（CLI 不校验的，这里补上）。
 *
 * 用法：
 *   node scripts/preflight.js --dir ./dist
 *   node scripts/preflight.js --zip release/foo.zip \
 *        --name "泡泡捏捏乐" --slogan "30秒捏爆烦恼" \
 *        --icon release/泡泡捏捏乐-图标.png \
 *        --cover release/泡泡捏捏乐-封面.png \
 *        --version 1.0.0 --json docs/preflight.json
 *
 * 退出码：0 = 无 FAIL（可能有 WARN）；1 = 有 FAIL；2 = 参数/读取错误
 */
const { readFileSync, writeFileSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join, relative, extname, resolve, dirname, sep } = require('node:path');

const MAX_APP_NAME = 14;
const MAX_SLOGAN = 14;
const ICON_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MAX_BYTES = 10 * 1024 * 1024;
const ZIP_MAX_BYTES = 10 * 1024 * 1024;
const UNZIP_MAX_BYTES = 30 * 1024 * 1024;
const ZIP_WARN_BYTES = 2 * 1024 * 1024;

const AUDIO_VIDEO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.webm', '.mov', '.avi', '.mkv'];
const JUNK_NAMES = ['__MACOSX', '.DS_Store', 'Thumbs.db'];
const ES2020_PATTERNS = [
  [/\?\.[A-Za-z_$[(]/, '可选链 ?. （ES2020，Chrome 61 不支持）'],
  [/\?\?/, '空值合并 ?? （ES2020）'],
  [/\?\?=|\|\|=|&&=/, '逻辑赋值运算符（ES2021）'],
  [/Object\.fromEntries\s*\(/, 'Object.fromEntries（ES2019）'],
  [/\.flat\s*\(|\.flatMap\s*\(/, 'Array.flat/flatMap（ES2019）'],
  [/String\.prototype\.replaceAll|\.replaceAll\s*\(/, 'String.replaceAll（ES2021）'],
  [/Promise\.allSettled\s*\(/, 'Promise.allSettled（ES2020）'],
  [/\bBigInt\s*\(|\b\d+n\b/, 'BigInt（ES2020）'],
  [/\bglobalThis\b/, 'globalThis（ES2020）'],
  [/\bimport\.meta\b/, 'import.meta（ESM）'],
  [/^\s*import\s+[^(]/m, 'ESM import 语句（容器按传统脚本执行）'],
  [/^\s*export\s+/m, 'ESM export 语句（容器按传统脚本执行）'],
  [/\bclass\s+[A-Za-z_$][\w$]*\s*\{[^}]*#[\w$]+\s*=/, 'class 私有字段 #x（ES2022）'],
  [/\.at\s*\(\s*-/, 'Array.at（ES2022）'],
];
const CSS_WARN_PATTERNS = [
  [/(^|[;{\s])gap\s*:/, 'flex/grid gap：Chrome 61 的 flex 不支持，用 margin 隔开'],
  [/aspect-ratio\s*:/, 'aspect-ratio：Chrome 61 不支持，用 padding-top 占位法'],
  [/:has\s*\(/, ':has()：Chrome 61 不支持，用 JS 加 class'],
  [/clamp\s*\(/, 'clamp()：Chrome 61 不支持，用 min/max/calc'],
  [/(^|[;{\s])inset\s*:/, 'inset 简写：部分旧版不支持，用 top/right/bottom/left'],
];

// ---------- CLI ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

// ---------- utils ----------
function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, acc);
    else if (st.isFile()) acc.push({ full, rel: relative(base, full).split(sep).join('/'), size: st.size });
  }
  return acc;
}

const fail = (list, check, msg, file) => list.push({ check, msg, file });
const warn = (list, check, msg, file) => list.push({ check, msg, file });

// 扫代码前先去掉注释，否则「注释里提到的反例写法」会被误报
function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}
function stripLineComments(text) {
  // 保留 https:// 里的 // ，只去掉真正的行注释
  return text.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

// ---------- image size ----------
function imageSize(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { type: 'jpeg', width: 0, height: 0 };
  }
  return { type: 'unknown', width: 0, height: 0 };
}

function checkImage(fails, warns, images, key, file, expectRatio, maxBytes, minWidth) {
  if (!file) { fail(fails, 'image', `缺少 --${key} 参数（${key === 'icon' ? '图标' : '封面'}），无法校验`); return; }
  if (!existsSync(file)) { fail(fails, 'image', `图片文件不存在：${file}`, file); return; }
  const buf = readFileSync(file);
  const ext = extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) fail(fails, 'image', `图片必须是 PNG/JPG：${file}`, file);
  if (buf.length > maxBytes) fail(fails, 'image', `图片超过 ${(maxBytes / 1024 / 1024).toFixed(0)}MiB：${(buf.length / 1024).toFixed(1)}KB → ${file}`, file);
  const { type, width, height } = imageSize(buf);
  if (type === 'unknown' || !width || !height) {
    fail(fails, 'image', `读不出图片尺寸（不是有效 PNG/JPG？）：${file}`, file);
    images[key] = { file, type, bytes: buf.length, width, height };
    return;
  }
  images[key] = { file, type, bytes: buf.length, width, height, ratio: Number((width / height).toFixed(4)) };
  if (expectRatio === 'icon' && width !== height) fail(fails, 'image', `图标必须是 1:1，实际 ${width}×${height}`, file);
  if (expectRatio === 'cover' && width * 4 !== height * 3) fail(fails, 'image', `封面必须是 3:4（宽×4 === 高×3），实际 ${width}×${height}`, file);
  if (width < minWidth) warn(warns, 'image', `${key} 宽度 ${width}px 偏小，建议至少 ${minWidth}px`, file);
}

// ---------- zip ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 ZIP 中央目录（文件损坏或不是 ZIP）');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + cdSize > buf.length) throw new Error('ZIP 中央目录越界（文件被截断？）');

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`第 ${i + 1} 个中央目录条目签名错误`);
    const madeBy = buf.readUInt16LE(p + 4);
    const gpFlag = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const externalAttr = buf.readUInt32LE(p + 38);
    const usize = buf.readUInt32LE(p + 24);
    const compressed = buf.readUInt32LE(p + 20);
    const nameBuf = buf.subarray(p + 46, p + 46 + nameLen);
    const name = (gpFlag & 0x0800) ? nameBuf.toString('utf8') : nameBuf.toString('utf8');
    const unixMode = (madeBy >> 8) === 3 ? (externalAttr >>> 16) : 0;
    entries.push({
      name,
      usize,
      compressed,
      isDir: name.endsWith('/'),
      isSymlink: unixMode > 0 && (unixMode & 0o170000) === 0o120000,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function checkZip(fails, warns, zipFile) {
  const result = { file: zipFile, bytes: 0, entries: 0, totalUncompressed: 0, rootIndex: false, top: [] };
  let buf;
  try { buf = readFileSync(zipFile); } catch (e) { fail(fails, 'zip', `读不到 zip：${e.message}`, zipFile); return result; }
  result.bytes = buf.length;
  if (buf.length > ZIP_MAX_BYTES) fail(fails, 'zip', `zip 超过 10MiB（${(buf.length / 1024 / 1024).toFixed(2)}MiB），平台会拒收`, zipFile);
  else if (buf.length > ZIP_WARN_BYTES) warn(warns, 'zip', `zip ${(buf.length / 1024).toFixed(0)}KB 偏大，建议 ≤2MiB（首屏加载受影响）`, zipFile);

  let entries;
  try { entries = readZip(buf); } catch (e) { fail(fails, 'zip', e.message, zipFile); return result; }
  result.entries = entries.length;

  const seen = new Set();
  let total = 0;
  for (const e of entries) {
    total += e.usize;
    if (e.isSymlink) fail(fails, 'zip', `含软链接（平台会拒）：${e.name}`, zipFile);
    if (/^[A-Za-z]:|^\//.test(e.name)) fail(fails, 'zip', `绝对路径（ZIP Slip 风险）：${e.name}`, zipFile);
    if (e.name.split('/').includes('..')) fail(fails, 'zip', `父目录越界路径（ZIP Slip 风险）：${e.name}`, zipFile);
    if (e.name.includes('\\')) fail(fails, 'zip', `路径用了反斜杠（应统一为 /）：${e.name}`, zipFile);
    if (seen.has(e.name)) fail(fails, 'zip', `重复路径：${e.name}`, zipFile);
    seen.add(e.name);
    const segs = e.name.split('/');
    if (segs.some((s) => JUNK_NAMES.includes(s) || s.startsWith('._') || (s.startsWith('.') && s !== '.'))) {
      fail(fails, 'zip', `含系统/隐藏文件（应排除）：${e.name}`, zipFile);
    }
    if (junkExt(e.name)) fail(fails, 'zip', `含不该打包的文件：${e.name}`, zipFile);
    if (AUDIO_VIDEO_EXT.includes(extname(e.name).toLowerCase())) fail(fails, 'zip', `含音视频文件（白名单不支持）：${e.name}`, zipFile);
  }
  result.totalUncompressed = total;
  if (total > UNZIP_MAX_BYTES) fail(fails, 'zip', `解压后 ${(total / 1024 / 1024).toFixed(2)}MiB 超过 30MiB 上限`, zipFile);
  result.rootIndex = entries.some((e) => !e.isDir && e.name === 'index.html');
  if (!result.rootIndex) {
    const nested = entries.find((e) => !e.isDir && /^[^/]+\/index\.html$/.test(e.name));
    fail(fails, 'zip', nested
      ? `index.html 在子目录 ${nested.name} 里，多套了一层（平台解压后找不到入口）`
      : 'zip 根目录没有 index.html', zipFile);
  }
  result.top = [...new Set(entries.map((e) => e.name.split('/')[0]))].slice(0, 30);
  return result;
}

function junkExt(name) {
  const n = name.toLowerCase();
  return n.endsWith('.map') || n.endsWith('.md') || n.endsWith('.ts') || n.endsWith('.tsx') ||
    n.endsWith('.psd') || n.endsWith('.ai') || n.endsWith('.zip') || n.endsWith('.log') ||
    n.endsWith('.lock') || n.includes('node_modules/') || n.includes('.git/');
}

// ---------- source scan ----------
function scanSources(fails, warns, files) {
  const htmls = files.filter((f) => f.rel.toLowerCase().endsWith('.html'));
  const jss = files.filter((f) => /\.(js|mjs|cjs)$/i.test(f.rel));
  const csss = files.filter((f) => f.rel.toLowerCase().endsWith('.css'));

  if (!htmls.some((f) => f.rel === 'index.html')) fail(fails, 'src', '根目录没有 index.html');
  if (!jss.length) warn(warns, 'src', '没找到外置 JS 文件（逻辑应该外置到 .js，别写内联）');

  for (const f of htmls) {
    const text = readFileSync(f.full, 'utf8');
    const code = stripHtmlComments(text);
    // 内联脚本
    const scripts = [...code.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      const attrs = m[1];
      const hasSrc = /\bsrc\s*=/.test(attrs);
      if (!hasSrc && m[2].trim()) fail(fails, 'csp', `内联 <script>（容器 CSP 禁止）：${f.rel}`, f.rel);
      if (/type\s*=\s*["']module["']/i.test(attrs)) fail(fails, 'csp', `用了 type="module"（容器不支持 ESM）：${f.rel}`, f.rel);
    }
    // 行内事件 / javascript:
    const inline = code.match(/\son[a-z]+\s*=\s*["']/gi);
    if (inline) fail(fails, 'csp', `行内事件属性 ${inline.length} 处（CSP 禁止 ${inline[0].trim()}）：${f.rel}`, f.rel);
    if (/javascript\s*:/i.test(code)) fail(fails, 'csp', `javascript: URI（CSP 禁止）：${f.rel}`, f.rel);
    // 外部资源
    const ext = code.match(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi);
    if (ext) fail(fails, 'offline', `外链资源 ${ext.length} 处（容器不能联网）：${f.rel}`, f.rel);
    // viewport
    if (!/<meta[^>]+name=["']viewport["']/i.test(code)) warn(warns, 'src', `<meta name="viewport"> 缺失：${f.rel}`, f.rel);
    if (!/<title>[^<]+<\/title>/i.test(code)) warn(warns, 'src', `<title> 缺失或为空：${f.rel}`, f.rel);
  }

  for (const f of jss) {
    const text = stripLineComments(stripBlockComments(readFileSync(f.full, 'utf8')));
    if (/\bfetch\s*\(/.test(text)) fail(fails, 'offline', `用了 fetch（容器不能联网）：${f.rel}`, f.rel);
    if (/XMLHttpRequest/.test(text)) fail(fails, 'offline', `用了 XMLHttpRequest（容器不能联网）：${f.rel}`, f.rel);
    if (/\beval\s*\(/.test(text)) fail(fails, 'csp', `用了 eval（容器禁止）：${f.rel}`, f.rel);
    if (/new\s+Function\s*\(/.test(text)) fail(fails, 'csp', `用了 new Function（容器禁止）：${f.rel}`, f.rel);
    if (/WebAssembly|\.wasm\b/.test(text)) fail(fails, 'csp', `用了 WASM（容器禁止）：${f.rel}`, f.rel);
    for (const [re, why] of ES2020_PATTERNS) {
      if (re.test(text)) fail(fails, 'es2017', `${why}：${f.rel}`, f.rel);
    }
    if (/(?:src|href)\s*=\s*["']https?:/i.test(text)) fail(fails, 'offline', `注入外链资源：${f.rel}`, f.rel);
    if (/https?:\/\//.test(text)) warn(warns, 'offline', `JS 里有 https:// 字样（运行时会联网的必须删）：${f.rel}`, f.rel);
  }

  const allJs = jss.map((f) => stripLineComments(stripBlockComments(readFileSync(f.full, 'utf8')))).join('\n');
  const allCss = csss.map((f) => stripBlockComments(readFileSync(f.full, 'utf8'))).join('\n');
  const allHtml = htmls.map((f) => stripHtmlComments(readFileSync(f.full, 'utf8'))).join('\n');

  for (const f of csss) {
    const text = stripBlockComments(readFileSync(f.full, 'utf8'));
    for (const [re, why] of CSS_WARN_PATTERNS) {
      if (re.test(text)) warn(warns, 'css61', `${why}：${f.rel}`, f.rel);
    }
  }

  // 安全区
  const usesSafeArea = /safe-area-inset/.test(allCss + allHtml);
  const usesWindowInfo = /getWindowInfo/.test(allJs);
  if (usesSafeArea && !usesWindowInfo) {
    fail(fails, 'safe-area', '用了 env(safe-area-inset-*) 但没有 getWindowInfo()：容器里 env() 恒为 0，会内容被压住', 'index.html');
  }
  if (!usesSafeArea && !usesWindowInfo) warn(warns, 'safe-area', '既没用 safe-area 也没用 getWindowInfo()，注意状态栏/Home 条遮挡');
  if (/\b\d+dvh\b/.test(allCss) && !/\b\d+vh\b/.test(allCss.replace(/\d+dvh/g, ''))) {
    warn(warns, 'css61', '用了 dvh 但没有 vh 兜底（Chrome 61 不认 dvh）');
  }

  // 触控尺寸线索
  if (/\bwidth:\s*(2[0-9]|3[0-9])px/.test(allCss) && !/min-height:\s*44px/.test(allCss)) {
    warn(warns, 'touch', '看到小尺寸按钮但没找到 min-height:44px，注意触控区 ≥44×44');
  }

  // 存储
  if (/localStorage/.test(allJs) && !/setStorage/.test(allJs)) {
    warn(warns, 'storage', '只用了 localStorage：容器里不可靠，应优先 window.xhs.miniTool.setStorage/getStorage');
  }
  // 平台能力
  if (!/\bxhs\b/.test(allJs)) warn(warns, 'platform', '没检测 xhs 容器对象（window.xhs），平台能力可能全缺失（浏览器可玩但真机功能没有）');
}

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const fails = [];
  const warns = [];
  const images = {};
  const report = { generatedAt: new Date().toISOString(), target: null, size: null, zip: null, meta: {}, images, fails, warns };

  if (!args.dir && !args.zip) {
    console.error('用法：node scripts/preflight.js --dir ./dist | --zip release/x.zip');
    console.error('      [--name 名字] [--slogan 简介] [--icon 图标] [--cover 封面] [--version 1.0.0] [--json out.json]');
    process.exit(2);
  }

  // 文案
  if (args.name !== undefined && args.name !== true) {
    const n = String(args.name);
    report.meta.appName = n;
    if (!n.trim()) fail(fails, 'form', '名字为空');
    else if (n.length > MAX_APP_NAME) fail(fails, 'form', `名字 ${n.length} 字符，超过 ${MAX_APP_NAME} 上限：${n}`);
    else if (/[\r\n]/.test(n)) fail(fails, 'form', '名字里有换行');
  } else fail(fails, 'form', '缺少 --name（平台不校验字数，必须自己量）');

  if (args.slogan !== undefined && args.slogan !== true) {
    const s = String(args.slogan);
    report.meta.slogan = s;
    if (!s.trim()) fail(fails, 'form', '简介为空');
    else if (s.length > MAX_SLOGAN) fail(fails, 'form', `简介 ${s.length} 字符，超过 ${MAX_SLOGAN} 上限：${s}`);
  } else fail(fails, 'form', '缺少 --slogan');

  if (args.version !== undefined && args.version !== true) {
    const v = String(args.version);
    report.meta.version = v;
    if (!/^\d+\.\d+\.\d+$/.test(v)) fail(fails, 'form', `版本号必须是三段数字（如 1.0.0），当前：${v}`);
    else if (v !== '1.0.0') {
      const staged = args.allowAnyVersion === true;
      if (!staged) warn(warns, 'form', `首次送审版本必须是 1.0.0，当前 ${v}（若这是新版本可忽略本提示）`);
    }
  }

  // 图片
  checkImage(fails, warns, images, 'icon', typeof args.icon === 'string' ? args.icon : null, 'icon', ICON_MAX_BYTES, 256);
  checkImage(fails, warns, images, 'cover', typeof args.cover === 'string' ? args.cover : null, 'cover', COVER_MAX_BYTES, 540);

  // 目标
  if (typeof args.dir === 'string') {
    const dir = resolve(args.dir);
    report.target = dir;
    if (!existsSync(dir)) { fail(fails, 'dir', `目录不存在：${dir}`); }
    else {
      const files = walk(dir);
      report.size = { files: files.length, bytes: files.reduce((a, b) => a + b.size, 0) };
      if (!files.length) fail(fails, 'dir', `目录是空的：${dir}`);
      for (const f of files) {
        if (AUDIO_VIDEO_EXT.includes(extname(f.rel).toLowerCase())) fail(fails, 'assets', `含音视频文件（白名单不支持）：${f.rel}`, f.rel);
      }
      scanSources(fails, warns, files);
    }
  }

  if (typeof args.zip === 'string') {
    report.zip = checkZip(fails, warns, resolve(args.zip));
  }

  // 输出
  const lines = [];
  lines.push('=== preflight 自检 ===');
  lines.push(`目标：${report.target || report.zip?.file || '(未指定)'}`);
  if (report.size) lines.push(`源文件：${report.size.files} 个，共 ${(report.size.bytes / 1024).toFixed(0)}KB`);
  if (report.zip) {
    lines.push(`zip：${(report.zip.bytes / 1024).toFixed(1)}KB，${report.zip.entries} 条目，解压 ${(report.zip.totalUncompressed / 1024).toFixed(0)}KB，根目录 index.html：${report.zip.rootIndex ? '有' : '无'}`);
  }
  if (report.meta.appName !== undefined) lines.push(`名字：${report.meta.appName}（${String(report.meta.appName).length}/${MAX_APP_NAME} 字符）`);
  if (report.meta.slogan !== undefined) lines.push(`简介：${report.meta.slogan}（${String(report.meta.slogan).length}/${MAX_SLOGAN} 字符）`);
  for (const key of ['icon', 'cover']) {
    const img = images[key];
    if (!img) continue;
    lines.push(`${key === 'icon' ? '图标' : '封面'}：${img.width}×${img.height}（比例 ${img.ratio}），${(img.bytes / 1024).toFixed(0)}KB，${img.type}`);
  }
  lines.push('');
  if (fails.length) {
    lines.push(`FAIL ${fails.length} 项（必须全部修掉才能打包上传）：`);
    fails.forEach((f, i) => lines.push(`  ${i + 1}. [${f.check}] ${f.msg}${f.file && !f.msg.includes(f.file) ? ` ← ${f.file}` : ''}`));
  } else lines.push('FAIL：0 项 ✔');
  lines.push('');
  if (warns.length) {
    lines.push(`WARN ${warns.length} 项（能修就修）：`);
    warns.forEach((w, i) => lines.push(`  ${i + 1}. [${w.check}] ${w.msg}`));
  } else lines.push('WARN：0 项');
  lines.push('');
  lines.push(fails.length ? '结论：不通过。照上面 FAIL 改源文件，不要手改 zip。' : '结论：通过（FAIL 为 0）。可以打包/上传。');

  const text = lines.join('\n');
  console.log(text);

  const jsonPath = typeof args.json === 'string' ? resolve(args.json) : null;
  if (jsonPath) {
    try {
      writeFileSync(jsonPath, JSON.stringify({ ...report, conclusion: fails.length ? 'FAIL' : 'PASS', text }, null, 2));
      console.log(`\nJSON 已写入：${jsonPath}`);
    } catch (e) {
      console.error(`写 JSON 失败：${e.message}`);
    }
  }

  process.exit(fails.length ? 1 : 0);
}

main();
