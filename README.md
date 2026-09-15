<!-- MAGI -->
# Musica

楽譜（MusicXML / ABC）を貼り付けると、その場で譜面を描画し、記譜された音を確認再生できる Web アプリ。
要件定義は [`Musica-Requirements-0.4.md`](./Musica-Requirements-0.4.md)。本リポジトリは**第1段階「貼る→鳴る」（認証なし）**と、**第2段階コア（AT Protocol ログイン→公開→自作品の閲覧・更新・削除）**を実装している。

## 現状

### 第1段階（認証なし）

- MusicXML・圧縮 MusicXML（`.mxl`）・ABC の貼り付け／ドロップ取り込みと**内容ベースの形式判別**
- §6 の**拒否条件による安全な検証**（DOCTYPE/外部実体の拒否、実体展開爆弾の排除、`.mxl` の zip bomb・パストラバーサル対策）
- **Verovio + Bravura** による五線譜描画（SVG は挿入前に無害化）
- **確認再生**（ピアノ1音色）と**再生位置の譜面ハイライト**
  - 記譜された音のみを鳴らし、コードシンボルや書かれていない伴奏は鳴らさない（設計原則4 / AC-10・AC-11）
- エラーを**音楽の言葉**で表示（技術詳細は折りたたみ）

### 第2段階コア（AT Protocol）

- **OAuth ログイン**（`@atproto/oauth-client-browser`）。パスワードは扱わない。
- 取り込んだ楽譜を**本人の PDS** へ公開：原本 blob（常に MusicXML）+ 作品レコード。
  - ABC 投稿時は ABC 原文を編集用ソース blob として同時保存（§9 / AC-12）。
  - rkey はクライアント採番 TID（再試行で重複作成を避ける / §9）。
- **マイ楽譜**（`/mine/`）：自作品の一覧・原本表示・**編集用ソース起点の更新**・削除。
  - 更新・削除は変更前 CID による**競合検出**（`swapRecord` / AC-20）。
- **端末内下書き**（ログイン不要・公開送信されない・書き出し可能 / AC-23）。
- Lexicon NSID は **`fm.musica.score`**（`musica.fm` の逆順、公開後不変 / §9）。

未実装（後続）：Bluesky 共有、作者ページ、MCP、他者コードの隔離実行。

## 開発

```bash
pnpm install
pnpm dev            # http://127.0.0.1:4321/  （OAuth loopback のため 127.0.0.1・base=/ で起動）
pnpm test           # Vitest 単体（検証・判別・確認再生・無害化・レコード/TID）
pnpm exec playwright install chromium webkit
pnpm test:e2e       # Playwright（chromium + iPad webkit / AC-21）
pnpm build          # 静的ビルド（dist/, base=/Musica）
```

### OAuth のしくみ

- **開発**：`127.0.0.1` / `localhost` では loopback クライアント（メタデータ配信不要）を使う。
  `pnpm dev` は `--host 127.0.0.1` かつ `BASE=/` で起動する。ブラウザは `http://127.0.0.1:4321/` を開く。
- **本番**：自オリジンの `client-metadata.json`（`src/pages/client-metadata.json.ts` が `SITE`+`BASE` から生成）を
  client_id とする。`redirect_uris` はサイトのトップ。ドメイン／リポジトリ名を変えたら `SITE`/`BASE` を上書きすれば JSON も追随する。
- ハンドル解決は `bsky.social`、スコープは `atproto transition:generic`（repo 書き込みと blob）。

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
| `atproto/lexicon.ts` | 作品レコードの型・NSID・組み立て・検証（§9） |
| `atproto/records.ts` | 本人 PDS への公開・更新（swapRecord 競合検出）・削除・一覧・blob 取得 |
| `atproto/client.ts` | OAuth クライアント（loopback / 本番メタデータ）とセッション |
| `atproto/store.ts` + `useAuth.ts` | 認証セッションの共有ストアと Preact フック |
| `atproto/tid.ts` | レコードキー（TID）生成 |
| `atproto/summary.ts` | 一覧要約（parts）とプレフィル情報の抽出 |
| `drafts.ts` / `editHandoff.ts` | 端末内下書き、マイ楽譜→取り込みの編集受け渡し |

## 軽量性（§15）

ホームは描画エンジン・フォント・音源・変換器を読み込まない。Verovio(WASM ~7.5MB) は取り込み画面で、
音源は再生操作時、ABC 変換器（Pyodide）は ABC 判別時にそれぞれ遅延ロードする。

## 同梱物

- `public/vendor/abc2xml.py` — abc2xml（Willem G. Vree, LGPL）。[NOTICE](./public/vendor/NOTICE.md) 参照。
<!-- /MAGI -->
