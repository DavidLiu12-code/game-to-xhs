import { defineConfig } from 'vite';

/**
 * 容器兼容构建配置（这几个值不是随便写的）：
 *   target: 'es2017'          —— 真机基线是 Android 8.1 / Chrome 61，别用更新的语法
 *   format: 'iife'            —— 容器按传统脚本执行，不支持 ESM
 *   base: './'                —— zip 内是相对路径，绝对路径会 404
 *   assetsInlineLimit 调大    —— 容器不能联网，小资源全内联成 data:
 *   cssMinify: false          —— 关掉 CSS 压缩：esbuild 会把 left/right/top/bottom
 *                               合并成 `inset:`，Chrome 61 不认，元素定位直接失效
 *   stripModuleType 插件      —— Vite 产出的 index.html 带 type="module" crossorigin，
 *                               两个属性在容器里都会导致脚本不执行，必须去掉
 */
function stripModuleType() {
  return {
    name: 'strip-module-type',
    transformIndexHtml(html) {
      return html
        .replace(/<script([^>]*)\stype="module"([^>]*)>/g, '<script$1$2>')
        .replace(/\scrossorigin(=("|')[^"']*\2)?/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [stripModuleType()],
  build: {
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
    cssMinify: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
