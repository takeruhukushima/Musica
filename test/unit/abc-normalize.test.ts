// MAGI
// 多声部 ABC の声部フィールド正規化（abc2xml 245 の同一行 `V:1 <音楽>` 欠落バグ対応）。
// 正規化は純粋な文字列変換であり Pyodide なしで検証できる。
import { describe, it, expect } from 'vitest';
import { normalizeAbcVoices } from '../../src/lib/convert/abc';

describe('normalizeAbcVoices（同一行の声部+音楽をインライン形へ）', () => {
  it('本文の `V:1 <音楽>` を `[V:1] <音楽>` へ書き換える', () => {
    const abc = ['X:1', 'K:C', 'V:1 CDEF |', 'V:2 C,D,E,F, |'].join('\n');
    const out = normalizeAbcVoices(abc).split('\n');
    expect(out[2]).toBe('[V:1] CDEF |');
    expect(out[3]).toBe('[V:2] C,D,E,F, |');
  });

  it('属性のみの声部定義行（clef= 等）はそのまま残す', () => {
    const abc = ['X:1', 'K:F', 'V:1 clef=treble', 'V:2 clef=bass'].join('\n');
    const out = normalizeAbcVoices(abc).split('\n');
    expect(out[2]).toBe('V:1 clef=treble');
    expect(out[3]).toBe('V:2 clef=bass');
  });

  it('ヘッダ（最初の K: より前）の V: 行は対象外', () => {
    const abc = ['X:1', 'V:1 clef=treble', 'K:C', 'V:1 CDE |'].join('\n');
    const out = normalizeAbcVoices(abc).split('\n');
    expect(out[1]).toBe('V:1 clef=treble'); // ヘッダは無変換
    expect(out[3]).toBe('[V:1] CDE |'); // 本文は変換
  });

  it('すでにインライン形 `[V:1]` はそのまま', () => {
    const abc = ['X:1', 'K:C', '[V:1] CDE |'].join('\n');
    expect(normalizeAbcVoices(abc).split('\n')[2]).toBe('[V:1] CDE |');
  });

  it('コード名付き和音を含む本文行を正しく変換する（代表: ブルース）', () => {
    const abc = ['X:1', 'K:F', 'V:1 "F7#9"[Ac_e_a]4 | "Bb13"[_Acdg]4 |'].join('\n');
    expect(normalizeAbcVoices(abc).split('\n')[2]).toBe('[V:1] "F7#9"[Ac_e_a]4 | "Bb13"[_Acdg]4 |');
  });

  it('単独の声部切替行 `V:1` は変えない', () => {
    const abc = ['X:1', 'K:C', 'V:1', 'CDE |'].join('\n');
    const out = normalizeAbcVoices(abc).split('\n');
    expect(out[2]).toBe('V:1');
    expect(out[3]).toBe('CDE |');
  });
});
// /MAGI
