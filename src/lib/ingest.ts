// MAGI
/**
 * 取り込みオーケストレーション（§5 制作から公開の 2〜4）。
 * 形式判別 → §6 検証 →（ABC なら MusicXML へ変換）→ 描画・再生に渡す MusicXML を得る。
 *
 * どの入力形式でも、返す musicXml は常に MusicXML（原本は常に MusicXML / §6）。
 * ABC の場合は原文を editSource として保持する（正本ではない / §9）。
 */

import { detectText, detectBytes, type SourceFormat } from './detect';
import { validateMusicXml } from './validate/xml';
import { validateMxl } from './validate/mxl';
import type { Issue } from './validate/types';

export interface EditSource {
  format: 'abc';
  text: string;
}

export interface IngestResult {
  ok: boolean;
  format: SourceFormat;
  detectReason: string;
  /** 描画・再生に使う MusicXML（成功時） */
  musicXml?: string;
  /** 編集用ソース（ABC 原文など。表示・再生経路には入らない / §9） */
  editSource?: EditSource;
  issues: Issue[];
}

function toByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** テキスト貼り付けからの取り込み */
export async function ingestText(raw: string): Promise<IngestResult> {
  const det = detectText(raw);
  switch (det.format) {
    case 'musicxml': {
      const v = validateMusicXml(raw, toByteLength(raw));
      return {
        ok: v.ok,
        format: 'musicxml',
        detectReason: det.reason,
        musicXml: v.ok ? raw : undefined,
        issues: v.issues,
      };
    }
    case 'abc':
      return ingestAbc(raw, det.reason);
    default:
      return { ok: false, format: det.format, detectReason: det.reason, issues: [{ code: 'not-musicxml', detail: '既知の形式に一致しません' }] };
  }
}

/** ファイル取り込み（.mxl はバイト列で処理） */
export async function ingestBytes(bytes: Uint8Array): Promise<IngestResult> {
  const det = detectBytes(bytes);
  if (det.format === 'mxl') {
    const { result, xml } = validateMxl(bytes);
    return {
      ok: result.ok,
      format: 'mxl',
      detectReason: det.reason,
      musicXml: result.ok ? xml : undefined,
      issues: result.issues,
    };
  }
  // それ以外はテキストとして解釈（UTF-8）
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, format: 'unknown', detectReason: det.reason, issues: [{ code: 'encoding-mismatch', detail: 'UTF-8 として読めません' }] };
  }
  return ingestText(text);
}

/**
 * ABC 取り込み: MusicXML へ変換し、ABC 原文を editSource として保持する。
 * 変換器（Pyodide + abc2xml）は ABC 判別時に遅延ロードする（§15）。
 */
async function ingestAbc(abc: string, detectReason: string): Promise<IngestResult> {
  const { convertAbcToMusicXml } = await import('./convert/abc');
  const conv = await convertAbcToMusicXml(abc);
  if (!conv.ok || !conv.musicXml) {
    return { ok: false, format: 'abc', detectReason, issues: conv.issues };
  }
  // 変換出力を検証済みとして扱わない: §6 検証をそのまま通す。
  const v = validateMusicXml(conv.musicXml, toByteLength(conv.musicXml));
  if (!v.ok) {
    return { ok: false, format: 'abc', detectReason, issues: v.issues };
  }
  return {
    ok: true,
    format: 'abc',
    detectReason,
    musicXml: conv.musicXml,
    editSource: { format: 'abc', text: abc },
    issues: [],
  };
}
// /MAGI
