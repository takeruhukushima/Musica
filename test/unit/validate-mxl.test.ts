// MAGI
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { validateMxl } from '../../src/lib/validate/mxl';

const score =
  '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
  '<part-list/><part id="P1"><measure number="1"/></part></score-partwise>';

const container =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';

function makeMxl(entries: Record<string, string>): Uint8Array {
  const data: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(entries)) data[k] = strToU8(v);
  return zipSync(data);
}

describe('validateMxl — 正常系', () => {
  it('正しい .mxl から内部 MusicXML を取り出す', () => {
    const mxl = makeMxl({ 'META-INF/container.xml': container, 'score.xml': score });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(true);
    expect(r.xml).toContain('score-partwise');
  });
});

describe('validateMxl — §6 / AC-15 拒否条件', () => {
  it('container.xml が無い書庫を拒否', () => {
    const mxl = makeMxl({ 'score.xml': score });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('container-missing');
  });

  it('rootfile が書庫外を指す場合を拒否', () => {
    const bad =
      '<container><rootfiles><rootfile full-path="../outside.xml"/></rootfiles></container>';
    const mxl = makeMxl({ 'META-INF/container.xml': bad, 'score.xml': score });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('container-invalid');
  });

  it('パストラバーサルを含むエントリ名を拒否', () => {
    const mxl = makeMxl({ 'META-INF/container.xml': container, '../evil.xml': score, 'score.xml': score });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('zip-path-traversal');
  });

  it('ZIP でないバイト列を拒否', () => {
    const r = validateMxl(new TextEncoder().encode('not a zip'));
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('not-zip');
  });

  it('高圧縮率の zip bomb を展開前に拒否', () => {
    // 高度に圧縮可能な大きな反復データ（宣言サイズは大きく、圧縮後は小さい）。
    const bomb = 'A'.repeat(2 * 1024 * 1024); // 2 MiB の反復 → 高圧縮率
    const mxl = makeMxl({ 'META-INF/container.xml': container, 'score.xml': score, 'bomb.bin': bomb });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('zip-bomb');
  });

  it('内部 XML の DOCTYPE を拒否（展開後も検証）', () => {
    const evil = '<!DOCTYPE x>' + score;
    const mxl = makeMxl({ 'META-INF/container.xml': container, 'score.xml': evil });
    const r = validateMxl(mxl);
    expect(r.result.ok).toBe(false);
    expect(r.result.issues[0].code).toBe('doctype-forbidden');
  });
});
// /MAGI
