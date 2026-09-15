// MAGI
/**
 * 端末内下書き（§4 / §12 / AC-23）。
 *
 * - 下書きは公開送信されない。本人が明示的に公開操作をしたときだけ PDS へ送る。
 * - 原本・編集用ソースのバイト列（ここでは文字列）と作品情報を端末内に保存し、
 *   ファイルとして持ち出せるようにする（書き出し）。
 * - 自動的な他端末同期・永久保存は保証しない（§15）。localStorage を用いる。
 * - アカウント切替時の分離（§4）は UI 側で「公開は現在のセッションの DID」に限定して担保する。
 *   下書き自体はログインに依存しない端末ローカルデータ。
 */

import type { ScoreMeta, SourceFormat } from './atproto/lexicon';

const KEY = 'musica:drafts:v1';

export interface Draft {
  id: string;
  title: string;
  meta: ScoreMeta;
  musicXml: string;
  sourceFormat: SourceFormat;
  sourceName: string;
  editSourceText?: string;
  editFormat?: 'abc';
  /** 更新対象の既存作品（あれば）。更新公開のための参照。 */
  target?: { did: string; rkey: string; cid: string };
  createdAt: string;
  updatedAt: string;
}

function read(): Draft[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Draft[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(drafts: Draft[]): void {
  localStorage.setItem(KEY, JSON.stringify(drafts));
}

export function listDrafts(): Draft[] {
  return read().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getDraft(id: string): Draft | undefined {
  return read().find((d) => d.id === id);
}

function newId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 下書きを保存（新規または既存 id の更新）。 */
export function saveDraft(input: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Draft {
  const drafts = read();
  const now = new Date().toISOString();
  const existing = input.id ? drafts.find((d) => d.id === input.id) : undefined;
  const draft: Draft = {
    ...input,
    id: input.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = existing ? drafts.map((d) => (d.id === draft.id ? draft : d)) : [...drafts, draft];
  write(next);
  return draft;
}

export function removeDraft(id: string): void {
  write(read().filter((d) => d.id !== id));
}

/** 下書きを JSON として書き出す（持ち出し / AC-23）。 */
export function exportDraft(draft: Draft): Blob {
  return new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
}
// /MAGI
