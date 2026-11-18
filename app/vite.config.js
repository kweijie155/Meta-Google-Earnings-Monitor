import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';

// Build targets:
//   VITE_TARGET=pages     -> installable web app for GitHub Pages (dist-pages/)
//   VITE_TARGET=artifact  -> single-file page for Claude (dist-artifact[-apac]/)
const TARGET = process.env.VITE_TARGET === 'artifact' ? 'artifact' : 'pages';
const DEFAULT_EDITION = process.env.VITE_DEFAULT_EDITION === 'apac' ? 'apac' : 'global';
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();
const DATA = JSON.parse(fs.readFileSync(path.resolve('src/data.json'), 'utf8'));
const BUILD_ID = process.env.BUILD_ID || `${DATA.display[DATA.display.length - 1]}-${BUILD_TIME}`;
const cfg = JSON.parse(fs.readFileSync(path.resolve('app.config.json'), 'utf8'));
const outDir = TARGET === 'pages' ? 'dist-pages' : DEFAULT_EDITION === 'apac' ? 'dist-artifact-apac' : 'dist-artifact';

function pwa() {
  return {
    name: 'pwa-files',
    transformIndexHtml(html) {
      if (TARGET !== 'pages') return html.replace('<!--PWA-->', '');
      return html.replace('<!--PWA-->', [
        '<link rel="manifest" href="./manifest.webmanifest">',
        '<meta name="theme-color" content="#1b3a5c">',
        '<link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">',
        '<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">',
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-title" content="GOOG vs META">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
      ].join('\n'));
    },
    closeBundle() {
      const dir = path.resolve(outDir);
      if (TARGET !== 'pages') { fs.rmSync(path.join(dir, 'sw.js'), { force: true }); fs.rmSync(path.join(dir, 'manifest.webmanifest'), { force: true }); fs.rmSync(path.join(dir, 'icons'), { recursive: true, force: true }); return; }
      fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ build: BUILD_ID, time: BUILD_TIME, latest: DATA.display[DATA.display.length - 1], cutoff: DATA.cutoff }, null, 1));
      const sw = path.join(dir, 'sw.js');
      fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD_ID__', BUILD_ID));
      fs.writeFileSync(path.join(dir, '.nojekyll'), '');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), pwa()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __TARGET__: JSON.stringify(TARGET),
    __DEFAULT_EDITION__: JSON.stringify(DEFAULT_EDITION),
    __TRIGGER_ID__: JSON.stringify(cfg.triggerId || ''),
    __CLAUDE_URL__: JSON.stringify(cfg.claudeUrl || ''),
  },
  build: { outDir, emptyOutDir: true, target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000, copyPublicDir: TARGET === 'pages' },
});
