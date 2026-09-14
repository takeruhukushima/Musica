// MAGI
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// GitHub Pages（プロジェクトページ）向け設定。
// user/organization ページや独自ドメインに切り替える場合は site/base を変更する。
// 例: https://takeruhukushima.github.io/Musica/ で配信する想定。
const SITE = process.env.SITE ?? 'https://takeruhukushima.github.io';
const BASE = process.env.BASE ?? '/Musica';

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [preact()],
  vite: {
    // Verovio(WASM) / Pyodide 等の大きな依存はチャンク分割し、
    // ホームで読み込まれないよう遅延 import する（§15 軽量性）。
    build: {
      target: 'es2022',
    },
    worker: {
      format: 'es',
    },
  },
});
// /MAGI
