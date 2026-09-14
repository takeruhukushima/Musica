// MAGI
// 静的な悪意入力フィクスチャが確実に拒否されることを確認する（§16 試験データ / AC-14）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateMusicXml } from '../../src/lib/validate/xml';

const read = (name: string) => readFileSync(resolve(process.cwd(), 'test/fixtures/malicious', name), 'utf8');

describe('悪意ある入力フィクスチャの拒否', () => {
  it.each([
    ['doctype.musicxml', 'doctype-forbidden'],
    ['xxe.musicxml', 'doctype-forbidden'],
    ['billion-laughs.musicxml', 'doctype-forbidden'],
  ])('%s を拒否する（%s）', (file, code) => {
    const r = validateMusicXml(read(file));
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe(code);
  });
});
// /MAGI
