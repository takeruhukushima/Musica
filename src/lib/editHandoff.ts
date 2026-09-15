// MAGI
/**
 * 「マイ楽譜 → 取り込み画面」への編集ハンドオフ（§5 更新 / §9）。
 *
 * 更新は編集用ソースを起点とする（§5）。editSource があればその原文（ABC）を、
 * 無ければ原本 MusicXML を取り込み画面に読み込み、更新対象（did/rkey/cid）を渡す。
 * cid は競合検出（swapRecord / AC-20）に使う。
 * sessionStorage を用いる（タブ内の一度きりの受け渡し）。
 */
import type { ScoreMeta } from './atproto/lexicon';

const KEY = 'musica:editTarget';

export interface EditHandoff {
  target: { did: string; rkey: string; cid: string };
  meta: ScoreMeta;
  /** 取り込み画面のテキスト欄に入れる内容（editSource 優先、無ければ原本 MusicXML） */
  editorText: string;
  createdAt?: string;
}

export function setEditHandoff(h: EditHandoff): void {
  sessionStorage.setItem(KEY, JSON.stringify(h));
}

export function takeEditHandoff(): EditHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as EditHandoff;
  } catch {
    return null;
  }
}
// /MAGI
