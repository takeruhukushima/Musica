// MAGI
/**
 * 描画エンジンが出力する SVG の無害化（§7 出力の扱い / AC-16）。
 *
 * SVG を親画面へ挿入する前に、スクリプト要素・イベント属性・外部参照を除去する。
 * 原本由来のテキスト（タイトル・作曲者・歌詞・コードシンボル）は SVG 内に
 * テキストとして現れるため、マークアップとして再解釈されないことを保証する。
 */

import DOMPurify from 'dompurify';

/** 外部参照とみなすスキーム（内部フラグメント参照 #id は許可する） */
function isExternalRef(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) return false; // 内部フラグメント（グリフ参照など）は許可
  if (v.startsWith('data:image/')) return false; // 埋め込み画像は許可（外部取得ではない）
  // http, https, //, file, ftp, javascript, その他のスキーム付き参照は除去。
  return /^[a-z][a-z0-9+.-]*:/.test(v) || v.startsWith('//');
}

let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    // href / xlink:href の外部参照を除去（<use>, <image>, <a> など）。
    for (const attr of ['href', 'xlink:href', 'src']) {
      const val = el.getAttribute(attr);
      if (val && isExternalRef(val)) {
        el.removeAttribute(attr);
      }
    }
  });
}

const SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // Verovio は SMuFL グリフを <symbol> + <use xlink:href="#..."> で参照する。
  // DOMPurify の svg プロファイルは <use>（外部参照の攻撃面）を既定で除去するため、
  // ADD_TAGS で再許可し、外部参照だけを afterSanitizeAttributes フックで除去する。
  ADD_TAGS: ['use'],
  ADD_ATTR: ['href', 'xlink:href'],
  // script / foreignObject 等は明示的に禁止（DOMPurify 既定でも除去される）。
  FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'audio', 'video'],
  FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
} as const;

/**
 * SVG 文字列を無害化して返す。ブラウザ（または jsdom）の DOM を必要とする。
 */
export function sanitizeSvg(svg: string): string {
  installHooks();
  const clean = DOMPurify.sanitize(svg, SVG_CONFIG as unknown as Parameters<typeof DOMPurify.sanitize>[1]);
  return typeof clean === 'string' ? clean : String(clean);
}
// /MAGI
