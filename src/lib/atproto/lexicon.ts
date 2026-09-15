// MAGI
/**
 * 作品レコードの Lexicon（§9）。
 *
 * コレクション NSID は `fm.musica.score`（authority = `musica.fm` の逆順）。
 * §9 の方針により **公開後に変更しない**。第三者 AppView がこの名前を決め打ちで
 * 参照するため、識別子はここ一箇所で固定する。正式ドメイン確定時もこの値を用いる。
 *
 * 自己記述性（§9）: レコード単体から原本の形式・所在・意味が判別できること。
 * Musica 固有の暗黙既定値を置かず、`source`（blob 参照）と `sourceFormat` を必須にする。
 * `editSource` を解釈できない実装でも `source` だけで完全に描画できる（AC-13）。
 */

import type { BlobRef } from '@atproto/api';

/** 作品レコードのコレクション NSID（公開後に変更しない / §9） */
export const SCORE_COLLECTION = 'fm.musica.score';

/** レコード構造の版（§9 schemaVersion） */
export const SCHEMA_VERSION = 1;

export type SourceFormat = 'musicxml' | 'mxl';
export type EditFormat = 'abc' | 'typescript';

/**
 * PDS に保存する作品レコードの値。$type はコレクション NSID と一致する。
 * BlobRef は @atproto/api の uploadBlob が返す blob 参照（CID・MIME・size を含む）。
 */
export interface ScoreRecord {
  $type: typeof SCORE_COLLECTION;
  schemaVersion: number;
  title: string;
  description?: string;
  composer?: string;
  arranger?: string;
  lyricist?: string;
  tags?: string[];
  /** 原本（常に MusicXML / §6）の blob 参照 */
  source: BlobRef;
  /** 原本の形式。慣習に頼らず明示する（§9） */
  sourceFormat: SourceFormat;
  /** ファイル名。パスとして実行・展開しない（§9） */
  sourceName: string;
  /** 編集用ソースの blob 参照（ABC 原文など / 任意 / §9） */
  editSource?: BlobRef;
  /** editSource がある場合に必須 */
  editFormat?: EditFormat;
  /** 一覧表示用の要約（原本から導ける冗長情報 / §9） */
  parts?: string[];
  durationSec?: number;
  createdAt: string;
  updatedAt: string;
  rights?: string;
}

/** タイトル・説明などの上限（PDS レコードサイズを圧迫しないための Musica 提案上限） */
export const RECORD_LIMITS = {
  maxTitle: 300,
  maxDescription: 3_000,
  maxNameField: 300,
  maxTags: 32,
  maxTagLen: 64,
  maxRights: 1_000,
} as const;

export interface ScoreMeta {
  title: string;
  description?: string;
  composer?: string;
  arranger?: string;
  lyricist?: string;
  tags?: string[];
  rights?: string;
}

export interface BuildRecordInput extends ScoreMeta {
  source: BlobRef;
  sourceFormat: SourceFormat;
  sourceName: string;
  editSource?: BlobRef;
  editFormat?: EditFormat;
  parts?: string[];
  durationSec?: number;
  /** 新規作成時は現在時刻。更新時は元の createdAt を引き継ぐ */
  createdAt?: string;
  now?: string;
}

/** メタデータの検証（公開前）。エラーメッセージは利用者向けの日本語で返す。 */
export function validateMeta(meta: ScoreMeta): string[] {
  const errs: string[] = [];
  const title = meta.title?.trim() ?? '';
  if (title.length === 0) errs.push('タイトルを入力してください。');
  if (title.length > RECORD_LIMITS.maxTitle) errs.push(`タイトルは ${RECORD_LIMITS.maxTitle} 文字以内にしてください。`);
  if ((meta.description ?? '').length > RECORD_LIMITS.maxDescription)
    errs.push(`説明は ${RECORD_LIMITS.maxDescription} 文字以内にしてください。`);
  for (const [label, v] of [
    ['作曲者', meta.composer],
    ['編曲者', meta.arranger],
    ['作詞者', meta.lyricist],
  ] as const) {
    if ((v ?? '').length > RECORD_LIMITS.maxNameField) errs.push(`${label}名が長すぎます。`);
  }
  if ((meta.tags?.length ?? 0) > RECORD_LIMITS.maxTags) errs.push(`タグは ${RECORD_LIMITS.maxTags} 個までです。`);
  if (meta.tags?.some((t) => t.length > RECORD_LIMITS.maxTagLen)) errs.push('タグが長すぎます。');
  if ((meta.rights ?? '').length > RECORD_LIMITS.maxRights) errs.push('権利情報が長すぎます。');
  return errs;
}

/** 空文字・空配列を落として任意フィールドを整える */
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out as T;
}

/**
 * 公開用レコード値を組み立てる。editSource があるのに editFormat が無い状態は作らない。
 * 純粋関数（blob 参照は呼び出し側で用意する）なので単体テスト可能。
 */
export function buildScoreRecord(input: BuildRecordInput): ScoreRecord {
  const now = input.now ?? new Date().toISOString();
  if (input.editSource && !input.editFormat) {
    throw new Error('editSource がある場合は editFormat が必須です。');
  }
  const record = clean({
    $type: SCORE_COLLECTION,
    schemaVersion: SCHEMA_VERSION,
    title: input.title,
    description: input.description,
    composer: input.composer,
    arranger: input.arranger,
    lyricist: input.lyricist,
    tags: input.tags,
    source: input.source,
    sourceFormat: input.sourceFormat,
    sourceName: input.sourceName,
    editSource: input.editSource,
    editFormat: input.editSource ? input.editFormat : undefined,
    parts: input.parts,
    durationSec: input.durationSec,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    rights: input.rights,
  }) as unknown as ScoreRecord;
  return record;
}

/** at:// URI を作る（§9 作品識別子） */
export function scoreUri(did: string, rkey: string): string {
  return `at://${did}/${SCORE_COLLECTION}/${rkey}`;
}

/** at:// URI から DID / rkey を取り出す（自コレクションのみ） */
export function parseScoreUri(uri: string): { did: string; rkey: string } | null {
  const m = new RegExp(`^at://([^/]+)/${SCORE_COLLECTION.replace(/\./g, '\\.')}/([^/]+)$`).exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}
// /MAGI
