// MAGI
/**
 * 本人 PDS への作品の保存・取得・更新・削除（§9 / §5 / 第2段階）。
 *
 * 方針:
 * - blob を先にアップロードし、その参照を持つレコードを putRecord で作成する（§9 公開手順）。
 * - rkey はクライアント採番の TID。再試行時は同じ rkey を使い重複作成を避ける（§9 / AC-19）。
 * - 更新は swapRecord に変更前 CID を渡し、他端末の変更を黙って上書きしない（§9 / AC-20）。
 * - 原本は常に MusicXML。ABC 入力時は変換後 MusicXML を source、ABC 原文を editSource とする（§6/§9）。
 * - 他人の作品は取得できても上書きできない（putRecord/deleteRecord は自分の repo のみ / §4）。
 */

import { Agent, type BlobRef } from '@atproto/api';
import {
  SCORE_COLLECTION,
  buildScoreRecord,
  scoreUri,
  type ScoreRecord,
  type ScoreMeta,
  type SourceFormat,
} from './lexicon';
import { nextTid } from './tid';
import { extractParts } from './summary';

/** 原本形式ごとの MIME type（§6）。PDS の受理条件で最終確定する提案値。 */
const SOURCE_MIME: Record<SourceFormat, string> = {
  musicxml: 'application/vnd.recordare.musicxml+xml',
  mxl: 'application/vnd.recordare.musicxml',
};
const ABC_MIME = 'text/plain; charset=utf-8';

export interface PublishInput extends ScoreMeta {
  /** 原本 MusicXML 文字列（常に MusicXML / §6） */
  musicXml: string;
  /** 原本の形式。ABC 入力でも変換後は 'musicxml' */
  sourceFormat: SourceFormat;
  sourceName: string;
  /** ABC 原文など（任意 / §9） */
  editSourceText?: string;
  editFormat?: 'abc';
  /** 一覧要約（§9）。省略時は MusicXML から抽出する */
  durationSec?: number;
}

export interface PublishResult {
  uri: string;
  cid: string;
  rkey: string;
  did: string;
}

const enc = new TextEncoder();

/** blob をアップロードして参照を得る。 */
async function uploadBlob(agent: Agent, bytes: Uint8Array, mime: string): Promise<BlobRef> {
  const res = await agent.com.atproto.repo.uploadBlob(bytes, { encoding: mime });
  return res.data.blob;
}

/**
 * 新規公開。blob（原本 + 任意で editSource）をアップロードし、レコードを putRecord する。
 * @param rkey 再試行時に同じキーを渡すと重複作成を避けられる（未指定なら新規採番 / §9）。
 */
export async function publishScore(
  agent: Agent,
  input: PublishInput,
  rkey: string = nextTid(),
): Promise<PublishResult> {
  const did = agent.assertDid;

  const source = await uploadBlob(agent, enc.encode(input.musicXml), SOURCE_MIME[input.sourceFormat]);
  let editSource: BlobRef | undefined;
  if (input.editSourceText && input.editFormat) {
    editSource = await uploadBlob(agent, enc.encode(input.editSourceText), ABC_MIME);
  }

  const record = buildScoreRecord({
    title: input.title,
    description: input.description,
    composer: input.composer,
    arranger: input.arranger,
    lyricist: input.lyricist,
    tags: input.tags,
    rights: input.rights,
    source,
    sourceFormat: input.sourceFormat,
    sourceName: input.sourceName,
    editSource,
    editFormat: editSource ? input.editFormat : undefined,
    parts: extractParts(input.musicXml),
    durationSec: input.durationSec,
  });

  const res = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: SCORE_COLLECTION,
    rkey,
    record: record as unknown as Record<string, unknown>,
    // 独自 Lexicon は PDS に未知のため検証をスキップ（$type 形式は保持）。
    validate: false,
  });
  return { uri: res.data.uri, cid: res.data.cid, rkey, did };
}

export class ConflictError extends Error {
  constructor(message = '他の端末で先に更新されています。最新を取得してからやり直してください。') {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * 既存作品の更新。レコードキーを維持し、swapRecord に変更前 CID を渡す（§9 / AC-20）。
 * editSource を持つ作品は原本を editSource から再生成した結果を渡すこと（§5）。両 blob を同時に差し替える。
 */
export async function updateScore(
  agent: Agent,
  rkey: string,
  input: PublishInput & { createdAt?: string },
  prevCid: string,
): Promise<PublishResult> {
  const did = agent.assertDid;

  const source = await uploadBlob(agent, enc.encode(input.musicXml), SOURCE_MIME[input.sourceFormat]);
  let editSource: BlobRef | undefined;
  if (input.editSourceText && input.editFormat) {
    editSource = await uploadBlob(agent, enc.encode(input.editSourceText), ABC_MIME);
  }

  const record = buildScoreRecord({
    title: input.title,
    description: input.description,
    composer: input.composer,
    arranger: input.arranger,
    lyricist: input.lyricist,
    tags: input.tags,
    rights: input.rights,
    source,
    sourceFormat: input.sourceFormat,
    sourceName: input.sourceName,
    editSource,
    editFormat: editSource ? input.editFormat : undefined,
    parts: extractParts(input.musicXml),
    durationSec: input.durationSec,
    createdAt: input.createdAt,
  });

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: SCORE_COLLECTION,
      rkey,
      record: record as unknown as Record<string, unknown>,
      swapRecord: prevCid,
      validate: false,
    });
    return { uri: res.data.uri, cid: res.data.cid, rkey, did };
  } catch (e) {
    if (isSwapError(e)) throw new ConflictError();
    throw e;
  }
}

/** 本人の作品を削除する。表示・キャッシュの失効は UI 側で行う（§5）。 */
export async function deleteScore(agent: Agent, rkey: string, prevCid?: string): Promise<void> {
  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: agent.assertDid,
      collection: SCORE_COLLECTION,
      rkey,
      ...(prevCid ? { swapRecord: prevCid } : {}),
    });
  } catch (e) {
    if (isSwapError(e)) throw new ConflictError('削除前に他の端末で更新されています。最新を取得してください。');
    throw e;
  }
}

export interface ScoreListItem {
  uri: string;
  cid: string;
  rkey: string;
  value: ScoreRecord;
}

/** 指定 DID の公開作品を一覧取得する（要約フィールドのみで表示できる / §15）。 */
export async function listScores(
  agent: Agent,
  did: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ items: ScoreListItem[]; cursor?: string }> {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: SCORE_COLLECTION,
    limit: opts.limit ?? 50,
    cursor: opts.cursor,
  });
  const items = res.data.records.map((r) => ({
    uri: r.uri,
    cid: r.cid,
    rkey: r.uri.split('/').pop() ?? '',
    value: r.value as unknown as ScoreRecord,
  }));
  return { items, cursor: res.data.cursor };
}

/** 単一作品レコードを取得する。 */
export async function getScore(agent: Agent, did: string, rkey: string): Promise<ScoreListItem> {
  const res = await agent.com.atproto.repo.getRecord({ repo: did, collection: SCORE_COLLECTION, rkey });
  return {
    uri: res.data.uri,
    cid: res.data.cid ?? '',
    rkey,
    value: res.data.value as unknown as ScoreRecord,
  };
}

/**
 * blob の中身（原本・editSource）を取得する。§11 の配信方針に沿い、
 * 認証済みエージェント経由で本人 PDS から取得する。返り値は UTF-8 デコード済み文字列。
 */
export async function fetchBlobText(agent: Agent, did: string, blob: BlobRef): Promise<string> {
  const cid = blobCid(blob);
  const res = await agent.com.atproto.sync.getBlob({ did, cid });
  const bytes = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data as ArrayBuffer);
  return new TextDecoder('utf-8').decode(bytes);
}

/** BlobRef から CID 文字列を取り出す（JSON 形/クラス形の双方に対応）。 */
export function blobCid(blob: BlobRef): string {
  const anyBlob = blob as unknown as { ref?: { toString(): string; $link?: string }; toJSON?: () => { ref: { $link: string } } };
  if (anyBlob.ref && typeof anyBlob.ref.toString === 'function' && !anyBlob.ref.$link) {
    return anyBlob.ref.toString();
  }
  if (anyBlob.ref?.$link) return anyBlob.ref.$link;
  if (typeof anyBlob.toJSON === 'function') return anyBlob.toJSON().ref.$link;
  return String((blob as unknown as { cid?: string }).cid ?? '');
}

function isSwapError(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? '';
  const name = (e as { error?: string })?.error ?? '';
  return name === 'InvalidSwap' || /swap/i.test(msg) || /InvalidSwap/i.test(String(e));
}

export { scoreUri };
// /MAGI
