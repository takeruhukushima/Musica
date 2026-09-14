// MAGI
/**
 * 形式判別（§6 / §12）。
 * 拡張子や自己申告 MIME を信頼せず、内容そのものから判別する。
 * 判別結果は取り込み画面に表示する（§12）。
 */

export type SourceFormat = 'musicxml' | 'mxl' | 'abc' | 'unknown';

export interface DetectResult {
  format: SourceFormat;
  /** 画面表示用の短い理由 */
  reason: string;
}

/** ZIP のローカルファイルヘッダ "PK\x03\x04"（および空/スパンド書庫の別マジック） */
function isZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const [a, b, c, d] = bytes;
  return a === 0x50 && b === 0x4b && (c === 0x03 || c === 0x05 || c === 0x07) && (d === 0x04 || d === 0x06 || d === 0x08);
}

/** 先頭の BOM と空白を除いたテキストを返す */
function stripLeading(text: string): string {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // UTF-8/16 BOM
  return s.replace(/^\s+/, '');
}

/**
 * バイト列（ファイル取り込み）からの判別。
 * ZIP は展開せずマジックバイトのみで .mxl 候補と判定する（安全性は validate 側で担保）。
 */
export function detectBytes(bytes: Uint8Array): DetectResult {
  if (isZip(bytes)) {
    return { format: 'mxl', reason: 'ZIP書庫（圧縮MusicXML .mxl の可能性）' };
  }
  // テキストとしてデコードして判定。不正な UTF-8 は fatal で弾く。
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { format: 'unknown', reason: 'UTF-8として読めないバイナリ' };
  }
  return detectText(text);
}

/**
 * テキスト（貼り付け）からの判別。
 */
export function detectText(raw: string): DetectResult {
  const text = stripLeading(raw);
  if (text.length === 0) {
    return { format: 'unknown', reason: '空の入力' };
  }

  // XML 宣言・XML 要素で始まればMusicXML候補。
  if (text.startsWith('<?xml') || text.startsWith('<')) {
    if (/<score-partwise[\s>]/.test(text) || /<score-timewise[\s>]/.test(text)) {
      return { format: 'musicxml', reason: 'MusicXML（score要素を検出）' };
    }
    // XML だが score 要素が無い → MusicXML候補として検証に回す（検証で最終判定）。
    return { format: 'musicxml', reason: 'XML文書（MusicXMLとして検証）' };
  }

  // ABC: 行頭の情報フィールド（X: 参照番号 / K: 調 など "文字:" 形式）を検出。
  if (looksLikeAbc(text)) {
    return { format: 'abc', reason: 'ABC記譜（情報フィールドを検出）' };
  }

  return { format: 'unknown', reason: '既知の形式に一致しません' };
}

/**
 * ABC のヒューリスティック判定。
 * ABC チューンは行頭の情報フィールド（例 `X:1`, `T:...`, `M:4/4`, `L:1/8`, `K:C`）を持つ。
 * 少なくとも 1 つの情報フィールドと、調フィールド `K:` の存在をもって ABC とみなす。
 */
function looksLikeAbc(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let hasField = false;
  let hasKey = false;
  let hasRef = false;
  for (const line of lines) {
    const m = /^([A-Za-z]):/.exec(line);
    if (m) {
      hasField = true;
      const field = m[1];
      if (field === 'K') hasKey = true;
      if (field === 'X') hasRef = true;
    }
  }
  // X:（参照番号）は ABC の必須ヘッダ。K:（調）は本文開始の目印。
  return hasRef && (hasKey || hasField);
}
// /MAGI
