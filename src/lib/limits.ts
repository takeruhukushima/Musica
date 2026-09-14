// MAGI
/**
 * §15 の提案上限を一元管理する。
 * すべて「Musica独自の提案上限」であり PDS の保証値ではない（要件§15）。
 * 実測（対象端末の性能・実際の容量制限）で調整する前提のため、
 * マジックナンバーをコードに散らさずここへ集約する。
 */

const MiB = 1024 * 1024;

export const LIMITS = {
  /** 非圧縮原本の最大バイト数（提案: 5 MiB） */
  maxRawBytes: 5 * MiB,
  /** 圧縮原本 .mxl の最大バイト数（提案: 1 MiB） */
  maxCompressedBytes: 1 * MiB,
  /** .mxl 展開後の合計最大バイト数（提案: 20 MiB） */
  maxInflatedBytes: 20 * MiB,
  /** 編集用ソース（ABC 等）の最大バイト数（提案: 1 MiB） */
  maxEditSourceBytes: 1 * MiB,

  /** XML 要素のネスト深さ上限 */
  maxXmlDepth: 256,
  /** XML 要素数の上限 */
  maxXmlElements: 500_000,

  /** .mxl 内エントリ数の上限 */
  maxZipEntries: 256,
  /** .mxl の単一エントリあたり圧縮率上限（inflated/compressed）。zip bomb 検出 */
  maxCompressionRatio: 200,

  /** 描画のタイムアウト（ミリ秒, 提案: 10 秒） */
  renderTimeoutMs: 10_000,
  /** 描画ページ数の上限（提案: 100 ページ） */
  maxPages: 100,
  /** 出力 SVG の最大バイト数（無害化・挿入前チェック） */
  maxSvgBytes: 8 * MiB,
  /** 出力 SVG の最大要素数 */
  maxSvgElements: 200_000,

  /** 演奏時間の上限（秒, 提案: 30 分） */
  maxDurationSec: 30 * 60,

  // --- ABC 入力（§6: 入力長・声部数・小節数・変換時間の上限） ---
  /** ABC 入力の最大文字数 */
  maxAbcChars: 200_000,
  /** ABC の声部数上限 */
  maxAbcVoices: 64,
  /** ABC の小節数上限 */
  maxAbcMeasures: 5_000,
  /** ABC→MusicXML 変換のタイムアウト（ミリ秒） */
  abcConvertTimeoutMs: 15_000,
} as const;

export type Limits = typeof LIMITS;
// /MAGI
