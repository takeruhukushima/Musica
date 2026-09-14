// MAGI
/**
 * 圧縮原本 .mxl（ZIP）の安全な検証と展開（§6 / AC-15）。
 *
 * 方針: 展開する前に ZIP の中央ディレクトリを解析し、宣言サイズ・エントリ数・
 * 圧縮率・パス（絶対/親ディレクトリ参照）を検査する。上限内と判明したエントリ
 * （container.xml と原本）だけを選択的に展開する。これにより zip bomb と
 * パストラバーサルを展開前に排除する。
 */

import { unzipSync } from 'fflate';
import { LIMITS } from '../limits';
import type { ValidationResult, Issue } from './types';
import { validateMusicXml } from './xml';

interface CentralEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

const EOCD_SIG = 0x06054b50;
const CDFH_SIG = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

/** 末尾から EOCD（End Of Central Directory）を探す */
function findEocd(view: DataView): number {
  const len = view.byteLength;
  const minEocd = 22;
  if (len < minEocd) return -1;
  // コメント長は最大 65535。安全のためその範囲を後方走査。
  const maxScan = Math.min(len, minEocd + 0xffff);
  for (let i = len - minEocd; i >= len - maxScan; i--) {
    if (i < 0) break;
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

/** 中央ディレクトリを解析してエントリ一覧を返す（展開はしない） */
function parseCentralDirectory(bytes: Uint8Array): CentralEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd === -1) return null;

  const totalRecords = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset === ZIP64_MARKER || totalRecords === ZIP64_MARKER) return null; // ZIP64 は非対応

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < totalRecords; n++) {
    if (p + 46 > bytes.byteLength) return null;
    if (view.getUint32(p, true) !== CDFH_SIG) return null;
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const nameStart = p + 46;
    if (nameStart + nameLen > bytes.byteLength) return null;
    const name = new TextDecoder('utf-8').decode(bytes.subarray(nameStart, nameStart + nameLen));
    entries.push({ name, compressedSize, uncompressedSize });
    p = nameStart + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 絶対パス・親ディレクトリ参照・バックスラッシュ経路を拒否 */
function isUnsafePath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (/^[a-zA-Z]:[\\/]/.test(name)) return true; // ドライブレター
  const normalized = name.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts.some((seg) => seg === '..');
}

export interface MxlResult {
  result: ValidationResult;
  /** 検証済みの内部 MusicXML（成功時のみ） */
  xml?: string;
}

/**
 * .mxl バイト列を検証し、内部の原本 MusicXML を取り出す。
 */
export function validateMxl(bytes: Uint8Array): MxlResult {
  const issues: Issue[] = [];
  const fail = (issue: Issue): MxlResult => ({ result: { ok: false, issues: [issue] } });

  if (bytes.byteLength > LIMITS.maxCompressedBytes) {
    return fail({ code: 'zip-too-large', detail: `圧縮原本 ${bytes.byteLength} バイトが上限 ${LIMITS.maxCompressedBytes} を超過` });
  }

  const entries = parseCentralDirectory(bytes);
  if (!entries) {
    return fail({ code: 'not-zip', detail: 'ZIP の中央ディレクトリを解析できません（破損または ZIP64）' });
  }
  if (entries.length === 0) {
    return fail({ code: 'container-missing', detail: '空の書庫です' });
  }
  if (entries.length > LIMITS.maxZipEntries) {
    return fail({ code: 'zip-too-many-entries', detail: `エントリ数 ${entries.length} が上限 ${LIMITS.maxZipEntries} を超過` });
  }

  let totalUncompressed = 0;
  for (const e of entries) {
    if (isUnsafePath(e.name)) {
      return fail({ code: 'zip-path-traversal', detail: `安全でないエントリ名: ${e.name}` });
    }
    if (e.uncompressedSize === ZIP64_MARKER) {
      return fail({ code: 'zip-bomb', detail: `エントリ ${e.name} のサイズが大きすぎます（ZIP64）` });
    }
    totalUncompressed += e.uncompressedSize;
    if (totalUncompressed > LIMITS.maxInflatedBytes) {
      return fail({ code: 'zip-bomb', detail: `展開後合計サイズが上限 ${LIMITS.maxInflatedBytes} を超過` });
    }
    // 圧縮率チェック（高圧縮率の bomb を展開前に排除）。空/微小ファイルは除外。
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > LIMITS.maxCompressionRatio) {
      return fail({ code: 'zip-bomb', detail: `エントリ ${e.name} の圧縮率が上限 ${LIMITS.maxCompressionRatio} を超過` });
    }
  }

  // META-INF/container.xml の確認
  const container = entries.find((e) => e.name === 'META-INF/container.xml');
  if (!container) {
    return fail({ code: 'container-missing', detail: 'META-INF/container.xml が存在しません' });
  }

  // 上限内と判明したエントリだけを選択的に展開する。
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.name === 'META-INF/container.xml' || entries.some((e) => e.name === f.name),
    });
  } catch (err) {
    return fail({ code: 'zip-bomb', detail: `展開に失敗: ${(err as Error).message}` });
  }

  const containerBytes = files['META-INF/container.xml'];
  if (!containerBytes) {
    return fail({ code: 'container-missing', detail: 'container.xml を展開できません' });
  }
  const containerText = new TextDecoder('utf-8').decode(containerBytes);

  // container.xml 自体も本節の拒否条件（DOCTYPE 等）で検証する。
  // ただし container.xml は score 要素を持たないため、not-musicxml は許容する。
  const rootfilePath = extractRootfilePath(containerText);
  if (!rootfilePath) {
    return fail({ code: 'container-invalid', detail: 'container.xml から rootfile を特定できません' });
  }
  // rootfile が書庫内に収まることを確認（パストラバーサル/書庫外参照の拒否）。
  if (isUnsafePath(rootfilePath) || !entries.some((e) => e.name === rootfilePath)) {
    return fail({ code: 'container-invalid', detail: `rootfile "${rootfilePath}" が書庫内に見つかりません` });
  }

  const rootBytes = files[rootfilePath];
  if (!rootBytes) {
    return fail({ code: 'rootfile-missing', detail: `原本 ${rootfilePath} を展開できません` });
  }

  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(rootBytes);
  } catch {
    return fail({ code: 'encoding-mismatch', detail: '内部原本が UTF-8 として読めません' });
  }

  // 展開後の内部 XML を通常の MusicXML 検証にかける。
  const inner = validateMusicXml(xml, rootBytes.byteLength);
  if (!inner.ok) {
    return { result: inner };
  }

  return { result: { ok: true, issues, stats: inner.stats }, xml };
}

/** container.xml から最初の rootfile full-path を素朴に抽出する（DOCTYPE 等は含まない前提） */
function extractRootfilePath(containerText: string): string | null {
  // DOCTYPE を含む container.xml は拒否する。
  if (/<!DOCTYPE/i.test(containerText) || /<!ENTITY/i.test(containerText)) return null;
  const m = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(containerText);
  return m ? m[1] : null;
}
// /MAGI
