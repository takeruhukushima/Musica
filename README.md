<!-- MAGI -->
# Musica

楽譜（MusicXML / ABC）を貼り付けると、その場で譜面を描画し、記譜された音を確認再生できる Web アプリ。
要件定義は [`Musica-Requirements-0.4.md`](./Musica-Requirements-0.4.md)。本リポジトリは**第1段階「貼る→鳴る」（認証なし）**を実装している。

## 現状（第1段階の範囲）

認証なしで以下ができる：

- MusicXML・圧縮 MusicXML（`.mxl`）・ABC の貼り付け／ドロップ取り込みと**内容ベースの形式判別**
- §6 の**拒否条件による安全な検証**（DOCTYPE/外部実体の拒否、実体展開爆弾の排除、`.mxl` の zip bomb・パストラバーサル対策）
- **Verovio + Bravura** による五線譜描画（SVG は挿入前に無害化）
- **確認再生**（ピアノ1音色）と**再生位置の譜面ハイライト**
  - 記譜された音のみを鳴らし、コードシンボルや書かれていない伴奏は鳴らさない（設計原則4 / AC-10・AC-11）
- エラーを**音楽の言葉**で表示（技術詳細は折りたたみ）

第2段階（AT Protocol 公開）以降は未実装。将来の Lexicon NSID は **`fm.musica.score`** を予定（`musica.fm` の逆順、公開後不変）。

## 開発

```bash
pnpm install
pnpm dev            # http://localhost:4321/Musica/
pnpm test           # Vitest 単体（検証・判別・確認再生・無害化）
pnpm exec playwright install chromium webkit
pnpm test:e2e       # Playwright（chromium + iPad webkit / AC-21）
pnpm build          # 静的ビルド（dist/）
```

## デプロイ（GitHub Pages）

- `main` への push で `.github/workflows/deploy.yml` がビルドして Pages へ配信する。
- リポジトリ設定 → Pages → Source を **GitHub Actions** にする。
- プロジェクトページ（`<user>.github.io/Musica/`）想定で `base: '/Musica'`（`astro.config.mjs`）。
  リポジトリ名を変えるときは環境変数 `BASE`（と必要なら `SITE`）で上書きする。

## アーキテクチャ（`src/lib`）

| モジュール | 役割 |
| --- | --- |
| `detect.ts` | 内容ベースの形式判別（MusicXML / ABC / .mxl） |
| `limits.ts` | §15 の提案上限を一元管理（実測で調整） |
| `validate/xml.ts` | DOCTYPE/実体拒否・整形式・符号化・深さ・要素数・サイズ |
| `validate/mxl.ts` | ZIP 中央ディレクトリ検査 → 選択的展開（bomb/traversal 対策） |
| `render/verovio.ts` | Verovio 遅延ロード・SVG 生成・上限 |
| `render/sanitizeSvg.ts` | DOMPurify による SVG 無害化（`<use>` 保持・外部参照除去） |
| `playback/*` | Verovio MIDI → Web Audio(ピアノ) 再生 + timemap ハイライト |
| `convert/abc.ts` | ABC→MusicXML（Pyodide + abc2xml, 遅延ロード） |
| `ingest.ts` | 取り込みオーケストレーション |
| `errors/musicalErrors.ts` | 内部エラー→音楽の言葉 |

## 軽量性（§15）

ホームは描画エンジン・フォント・音源・変換器を読み込まない。Verovio(WASM ~7.5MB) は取り込み画面で、
音源は再生操作時、ABC 変換器（Pyodide）は ABC 判別時にそれぞれ遅延ロードする。

## 同梱物

- `public/vendor/abc2xml.py` — abc2xml（Willem G. Vree, LGPL）。[NOTICE](./public/vendor/NOTICE.md) 参照。
<!-- /MAGI -->
