// MAGI
// abc2xml（Pyodide）で生成した MusicXML が §6 検証を通ること、AC-12 の整合を確認する。
// Pyodide 自体の実行はブラウザ e2e に委ね、ここでは変換出力の性質を検証する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateMusicXml } from '../../src/lib/validate/xml';

const fromAbc = readFileSync(resolve(process.cwd(), 'test/fixtures/valid/from-abc.musicxml'), 'utf8');

describe('ABC 変換出力（AC-12）', () => {
  it('abc2xml 出力は DOCTYPE を含まない', () => {
    expect(fromAbc).not.toContain('DOCTYPE');
  });

  it('abc2xml 出力が §6 検証を通る', () => {
    const r = validateMusicXml(fromAbc);
    expect(r.ok).toBe(true);
  });

  it('コードシンボルが harmony として保持される（表示用・音にしない / AC-11）', () => {
    expect(fromAbc).toContain('<harmony');
  });
});
// /MAGI
