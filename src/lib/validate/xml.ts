// MAGI
/**
 * 信頼できない入力としての MusicXML 検証（§6 拒否条件）。
 *
 * 設計方針: セキュリティに直結する判定（DOCTYPE/実体の拒否、深さ・要素数・サイズ、符号化）は
 * DOM に依存しない純粋なスキャナで決定論的に行い、Node の単体テストで検証可能にする。
 * ブラウザでは追加で DOMParser による整形式チェックを行う（validateXmlWellFormed）。
 *
 * billion laughs（実体展開爆弾）は「DOCTYPE と ENTITY を一切許可しない」ことで
 * 原理的に排除する。外部実体参照も同様に解決しない。
 */

import { LIMITS } from '../limits';
import type { ValidationResult, Issue } from './types';

const ALLOWED_ENCODINGS = new Set(['utf-8', 'utf8']);

/** 文字列のバイト長（UTF-8） */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 現在位置までの改行数から行番号を求める（エラー表示用） */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * MusicXML（非圧縮）文字列を検証する。
 * @param text UTF-8 としてデコード済みの文字列
 * @param byteLen 元バイト列の長さ（省略時は text から計算）
 */
export function validateMusicXml(text: string, byteLen?: number): ValidationResult {
  const issues: Issue[] = [];
  const size = byteLen ?? byteLength(text);

  if (size > LIMITS.maxRawBytes) {
    return {
      ok: false,
      issues: [{ code: 'too-large', detail: `原本サイズ ${size} バイトが上限 ${LIMITS.maxRawBytes} を超過` }],
    };
  }

  const n = text.length;
  let i = 0;
  let depth = 0;
  let maxDepth = 0;
  let elementCount = 0;
  let sawRoot = false;
  let sawScoreElement = false;
  const tagStack: string[] = [];

  const push = (issue: Issue) => issues.push(issue);

  while (i < n) {
    const ch = text[i];
    if (ch !== '<') {
      // テキストノード。裸の '&' や不正実体参照を検出（正しくは &amp; 等でエスケープ必須）。
      if (ch === '&') {
        const semi = text.indexOf(';', i);
        const ref = semi > i ? text.slice(i + 1, semi) : '';
        const valid = /^(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+)$/.test(ref);
        if (!valid) {
          push({ code: 'not-well-formed', detail: `不正な実体参照または裸の '&'`, line: lineAt(text, i) });
          return { ok: false, issues };
        }
        i = semi + 1;
        continue;
      }
      i++;
      continue;
    }

    // ここから '<' で始まる構文
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) {
        push({ code: 'not-well-formed', detail: '閉じられていないコメント', line: lineAt(text, i) });
        return { ok: false, issues };
      }
      i = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) {
        push({ code: 'not-well-formed', detail: '閉じられていないCDATA', line: lineAt(text, i) });
        return { ok: false, issues };
      }
      i = end + 3;
      continue;
    }

    if (text.startsWith('<!', i)) {
      // コメント/CDATA 以外の '<!' はマークアップ宣言（DOCTYPE / ENTITY / ELEMENT / ATTLIST / NOTATION）。
      // いずれも §6 で拒否する。DOCTYPE と ENTITY は個別コードで返す。
      if (text.startsWith('<!DOCTYPE', i)) {
        push({ code: 'doctype-forbidden', detail: 'DOCTYPE 宣言は許可されません（外部実体・実体展開の防止）', line: lineAt(text, i) });
        return { ok: false, issues };
      }
      push({ code: 'entity-forbidden', detail: 'マークアップ宣言（ENTITY 等）は許可されません', line: lineAt(text, i) });
      return { ok: false, issues };
    }

    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) {
        push({ code: 'not-well-formed', detail: '閉じられていない処理命令/XML宣言', line: lineAt(text, i) });
        return { ok: false, issues };
      }
      const pi = text.slice(i, end + 2);
      if (/^<\?xml[\s?]/.test(pi)) {
        const enc = /encoding\s*=\s*["']([^"']+)["']/.exec(pi);
        if (enc && !ALLOWED_ENCODINGS.has(enc[1].toLowerCase())) {
          push({ code: 'encoding-mismatch', detail: `宣言符号化 "${enc[1]}" は非対応（UTF-8 のみ受理）`, line: lineAt(text, i) });
          return { ok: false, issues };
        }
      }
      i = end + 2;
      continue;
    }

    // 要素タグ（開始/終了/空要素）。属性値内の '>' を誤検出しないよう引用符を追跡する。
    const closing = text[i + 1] === '/';
    const tagStart = i;
    let j = i + 1;
    let quote: string | null = null;
    while (j < n) {
      const cj = text[j];
      if (quote) {
        if (cj === quote) quote = null;
      } else if (cj === '"' || cj === "'") {
        quote = cj;
      } else if (cj === '>') {
        break;
      }
      j++;
    }
    if (j >= n) {
      push({ code: 'not-well-formed', detail: '閉じられていないタグ', line: lineAt(text, tagStart) });
      return { ok: false, issues };
    }

    const inner = text.slice(closing ? i + 2 : i + 1, j).trim();
    const selfClosing = !closing && inner.endsWith('/');
    const nameMatch = /^([^\s/>]+)/.exec(inner);
    const name = nameMatch ? nameMatch[1] : '';

    if (closing) {
      const top = tagStack.pop();
      if (top !== name) {
        push({ code: 'not-well-formed', detail: `終了タグ </${name}> が開始タグと不一致`, line: lineAt(text, tagStart) });
        return { ok: false, issues };
      }
      depth--;
    } else {
      // 外部参照らしき属性値（xlink:href / href / SYSTEM 等）は無視するが、
      // http(s)/file スキームの明示参照は「解決しない」ことを記録するのみ（描画側でも除去）。
      elementCount++;
      if (elementCount > LIMITS.maxXmlElements) {
        push({ code: 'too-many-elements', detail: `要素数が上限 ${LIMITS.maxXmlElements} を超過` });
        return { ok: false, issues };
      }
      if (!sawRoot) {
        sawRoot = true;
        if (name === 'score-partwise' || name === 'score-timewise') sawScoreElement = true;
      }
      if (name === 'score-partwise' || name === 'score-timewise') sawScoreElement = true;

      if (!selfClosing) {
        tagStack.push(name);
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        if (depth > LIMITS.maxXmlDepth) {
          push({ code: 'too-deep', detail: `ネスト深さが上限 ${LIMITS.maxXmlDepth} を超過`, line: lineAt(text, tagStart) });
          return { ok: false, issues };
        }
      }
    }

    i = j + 1;
  }

  if (tagStack.length > 0) {
    push({ code: 'not-well-formed', detail: `閉じられていない要素: ${tagStack.join(', ')}` });
    return { ok: false, issues };
  }

  if (!sawRoot) {
    push({ code: 'not-well-formed', detail: '要素が見つかりません' });
    return { ok: false, issues };
  }

  if (!sawScoreElement) {
    // MusicXML の root（score-partwise / score-timewise）が無い。
    // 取り込みは拒否するが、翻訳層で「MusicXMLとして解釈できません」と案内する。
    push({ code: 'not-musicxml', detail: 'score-partwise / score-timewise 要素が見つかりません' });
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues,
    stats: { elementCount, maxDepth, byteLength: size },
  };
}

/**
 * ブラウザ環境での追加の整形式チェック（DOMParser）。
 * DOMParser は外部実体を解決しないが、DOCTYPE の拒否はスキャナ側で既に済ませている。
 * DOM が無い環境（Node の一部テスト）では null を返し、スキャナ結果のみを使う。
 */
export function validateXmlWellFormed(text: string): ValidationResult | null {
  const DP = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  if (!DP) return null;
  const doc = new DP().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    return { ok: false, issues: [{ code: 'not-well-formed', detail: err.textContent ?? 'XML 解析エラー' }] };
  }
  return { ok: true, issues: [] };
}
// /MAGI
