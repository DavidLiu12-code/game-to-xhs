#!/usr/bin/env node
/**
 * 小红书小工具打包：把一个目录打成容器能直接加载的 zip
 *
 * 零依赖，自己写 ZIP（deflateRaw + CRC32 + local header/central directory/EOCD）。
 * 关键约束：
 *   - zip 根目录直接是 index.html（不套目录）
 *   - 排除 node_modules / .git / *.map / 源文件 / 文档 / 系统垃圾
 *   - 不做任何压缩失败的静默降级：每个文件要么 deflate 要么 store，都记录在案
 *
 * 用法：
 *   node scripts/make-zip.js --dir ./dist --out "release/名字.zip"
 *   node scripts/make-zip.js --dir ./dist --out out.zip --verbose
 */
const { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } = require('node:fs');
const { join, relative, extname, resolve, dirname, sep } = require('node:path');
const { deflateRawSync } = require('node:zlib');

const ZIP_MAX = 10 * 1024 * 1024;
const ZIP_WARN = 2 * 1024 * 1024;

// 不打包的东西
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'src', '.vscode', '.idea', '__MACOSX', 'release', 'dist_old']);
const EXCLUDE_EXTS = new Set(['.md', '.map', '.ts', '.tsx', '.scss', '.sass', '.less', '.psd', '.ai', '.zip', '.log', '.lock', '.bak', '.tmp']);
const EXCLUDE_FILES = new Set(['.DS_Store', 'Thumbs.db', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json', 'vite.config.js', 'vite.config.js', '.gitignore']);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    }
  }
  return out;
}

function shouldInclude(rel) {
  const segs = rel.split('/');
  if (segs.some((s) => EXCLUDE_DIRS.has(s))) return false;
  const base = segs[segs.length - 1];
  if (EXCLUDE_FILES.has(base)) return false;
  if (base.startsWith('._')) return false;
  if (base.startsWith('.') && base !== '.wellknown') return false;
  if (EXCLUDE_EXTS.has(extname(base).toLowerCase())) return false;
  return true;
}

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    const rel = relative(base, full).split(sep).join('/');
    if (st.isDirectory()) walk(full, base, acc);
    else if (st.isFile() && shouldInclude(rel)) acc.push({ full, rel, size: st.size });
  }
  return acc;
}

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

function buildZip(files) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  const stats = [];

  for (const f of files) {
    const raw = readFileSync(f.full);
    const crc = crc32(raw);
    let method = 8;
    let data = deflateRawSync(raw, { level: 9 });
    if (data.length >= raw.length) { method = 0; data = raw; }

    const nameBuf = Buffer.from(f.rel, 'utf8');
    const gpFlag = /[^\x20-\x7e]/.test(f.rel) ? 0x0800 : 0x0000; // UTF-8 名字标记

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(gpFlag, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);      // version made by: unix, 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(gpFlag, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk
    central.writeUInt16LE(0, 36);          // internal attr
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attr: regular file
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    stats.push({ rel: f.rel, raw: raw.length, packed: data.length, method: method === 8 ? 'deflate' : 'store' });
    offset += local.length + nameBuf.length + data.length;
  }

  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return { buffer: Buffer.concat([...locals, cdBuf, eocd]), stats };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.dir !== 'string' || typeof args.out !== 'string') {
    console.error('用法：node scripts/make-zip.js --dir ./dist --out "release/名字.zip" [--verbose]');
    process.exit(2);
  }
  const dir = resolve(args.dir);
  const out = resolve(args.out);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`源目录不存在：${dir}`);
    process.exit(2);
  }
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(`源目录根下没有 index.html：${dir}`);
    console.error('容器解压后要求根目录直接是 index.html，如果产物在 dist/ 子目录里，请把 --dir 指向它。');
    process.exit(2);
  }

  const files = walk(dir);
  if (!files.length) { console.error('没有可打包的文件'); process.exit(2); }

  const { buffer, stats } = buildZip(files);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buffer);

  const totalRaw = stats.reduce((a, b) => a + b.raw, 0);
  console.log('=== 打包完成 ===');
  console.log(`源目录：${dir}`);
  console.log(`产物：${out}`);
  console.log(`文件数：${files.length}，原始 ${(totalRaw / 1024).toFixed(0)}KB → zip ${(buffer.length / 1024).toFixed(1)}KB`);

  if (args.verbose) {
    for (const s of stats) console.log(`  ${s.rel}  ${s.raw} → ${s.packed} (${s.method})`);
  }

  if (buffer.length > ZIP_MAX) {
    console.error(`\n[FAIL] zip 超过 10MiB 上限（${(buffer.length / 1024 / 1024).toFixed(2)}MiB），平台会拒收。先压图/删大文件。`);
    process.exit(1);
  }
  if (buffer.length > ZIP_WARN) {
    console.warn(`\n[WARN] zip ${(buffer.length / 1024).toFixed(0)}KB 偏大，建议 ≤2MiB。`);
  }
  const top = [...new Set(stats.map((s) => s.rel.split('/')[0]))];
  if (top.length && !top.includes('index.html')) {
    console.warn('[WARN] 根目录条目里没看到 index.html，确认一下产物结构。');
  }
  console.log('\n下一步：node scripts/preflight.js --zip "' + out + '" --name "..." --slogan "..." --icon ... --cover ... --version 1.0.0');
}

main();
