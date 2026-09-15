// MAGI
// TID 生成（§9 レコードキー）。形式・単調増加を確認する。
import { describe, it, expect } from 'vitest';
import { nextTid, isTid } from '../../src/lib/atproto/tid';

describe('TID', () => {
  it('13 文字の妥当な TID を返す', () => {
    const t = nextTid();
    expect(t).toHaveLength(13);
    expect(isTid(t)).toBe(true);
  });

  it('連続生成で単調増加する（sortable）', () => {
    const a = nextTid();
    const b = nextTid();
    const c = nextTid();
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('不正な文字列を弾く', () => {
    expect(isTid('short')).toBe(false);
    expect(isTid('0000000000000')).toBe(false); // '0' は base32-sortable に無い
    expect(isTid('zzzzzzzzzzzzz')).toBe(false); // 先頭が後半文字→最上位ビット 1（64bit 超）
    expect(isTid('2222222222222')).toBe(true); // 全て最小の有効文字
  });
});
// /MAGI
