#!/usr/bin/env node
/**
 * 生成两张合规的测试图（图标 512×512、封面 1080×1440），仅供 CI 与本地自检使用。
 * 不是打包进 zip 的素材，也不是真实设计稿。
 *
 * 用法：node scripts/dev-make-test-images.js [输出目录]
 * 默认输出到 ./.test-assets/
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const outDir = path.resolve(process.argv[2] || '.test-assets');

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

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** 生成纯色（带简单渐变）的 8bit RGB PNG */
function solidPng(width, height, rgbTop, rgbBottom) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 3);
    raw[off] = 0; // filter: none
    const t = height > 1 ? y / (height - 1) : 0;
    const r = Math.round(rgbTop[0] + (rgbBottom[0] - rgbTop[0]) * t);
    const g = Math.round(rgbTop[1] + (rgbBottom[1] - rgbTop[1]) * t);
    const b = Math.round(rgbTop[2] + (rgbBottom[2] - rgbTop[2]) * t);
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
const icon = path.join(outDir, 'icon.png');
const cover = path.join(outDir, 'cover.png');
fs.writeFileSync(icon, solidPng(512, 512, [0x12, 0x13, 0x2a], [0xff, 0xd1, 0x66]));
fs.writeFileSync(cover, solidPng(1080, 1440, [0x12, 0x13, 0x2a], [0xff, 0x8f, 0xab]));
console.log(`图标：${icon}（512×512）`);
console.log(`封面：${cover}（1080×1440）`);
