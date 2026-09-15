// MAGI
// 作品レコードの組み立て・検証・要約抽出（§9 / 第2段階）。純粋関数のみ。
import { describe, it, expect } from 'vitest';
import {
  SCORE_COLLECTION,
  SCHEMA_VERSION,
  buildScoreRecord,
  validateMeta,
  scoreUri,
  parseScoreUri,
} from '../../src/lib/atproto/lexicon';
import { extractParts, extractWorkInfo } from '../../src/lib/atproto/summary';

// BlobRef の代わりに最小のスタブ（buildScoreRecord は形を問わずそのまま格納する）。
const fakeBlob = { $type: 'blob', ref: { $link: 'bafyfake' }, mimeType: 'x', size: 1 } as never;

describe('buildScoreRecord（§9）', () => {
  it('必須フィールドと $type を設定し、空の任意フィールドを落とす', () => {
    const rec = buildScoreRecord({
      title: '  Blues in F  ',
      source: fakeBlob,
      sourceFormat: 'musicxml',
      sourceName: 'blues.musicxml',
      description: '',
      composer: 'Claude',
      tags: [],
      now: '2026-09-15T00:00:00.000Z',
    });
    expect(rec.$type).toBe(SCORE_COLLECTION);
    expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
    expect(rec.title).toBe('Blues in F'); // trim
    expect(rec.composer).toBe('Claude');
    expect('description' in rec).toBe(false); // 空文字は落ちる
    expect('tags' in rec).toBe(false); // 空配列は落ちる
    expect(rec.createdAt).toBe('2026-09-15T00:00:00.000Z');
    expect(rec.updatedAt).toBe('2026-09-15T00:00:00.000Z');
  });

  it('editSource があるのに editFormat が無ければ投げる（自己記述性 / §9）', () => {
    expect(() =>
      buildScoreRecord({
        title: 'x',
        source: fakeBlob,
        sourceFormat: 'musicxml',
        sourceName: 'x.musicxml',
        editSource: fakeBlob,
      }),
    ).toThrow();
  });

  it('editSource + editFormat を保持する', () => {
    const rec = buildScoreRecord({
      title: 'x',
      source: fakeBlob,
      sourceFormat: 'musicxml',
      sourceName: 'x.musicxml',
      editSource: fakeBlob,
      editFormat: 'abc',
    });
    expect(rec.editFormat).toBe('abc');
    expect(rec.editSource).toBeDefined();
  });

  it('createdAt を渡すと更新時も作成日時を引き継ぐ', () => {
    const rec = buildScoreRecord({
      title: 'x',
      source: fakeBlob,
      sourceFormat: 'musicxml',
      sourceName: 'x.musicxml',
      createdAt: '2020-01-01T00:00:00.000Z',
      now: '2026-09-15T00:00:00.000Z',
    });
    expect(rec.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(rec.updatedAt).toBe('2026-09-15T00:00:00.000Z');
  });
});

describe('validateMeta', () => {
  it('タイトル未入力を弾く', () => {
    expect(validateMeta({ title: '   ' })).toContain('タイトルを入力してください。');
  });
  it('正常なメタは空配列', () => {
    expect(validateMeta({ title: 'ok', composer: 'a' })).toEqual([]);
  });
});

describe('scoreUri / parseScoreUri', () => {
  it('往復する', () => {
    const uri = scoreUri('did:plc:abc', 'rkey123');
    expect(uri).toBe(`at://did:plc:abc/${SCORE_COLLECTION}/rkey123`);
    expect(parseScoreUri(uri)).toEqual({ did: 'did:plc:abc', rkey: 'rkey123' });
  });
  it('別コレクションは null', () => {
    expect(parseScoreUri('at://did:plc:abc/app.bsky.feed.post/x')).toBeNull();
  });
});

describe('要約抽出（§9 parts / prefill）', () => {
  const xml = `<score-partwise><work><work-title>Sixteen Voicings</work-title></work>
    <identification><creator type="composer">Claude</creator></identification>
    <part-list><score-part id="P1"><part-name>Piano RH</part-name></score-part>
    <score-part id="P2"><part-name>Piano LH</part-name></score-part></part-list></score-partwise>`;
  it('part-name を取り出す', () => {
    expect(extractParts(xml)).toEqual(['Piano RH', 'Piano LH']);
  });
  it('part-name が無ければ score-part id を使う', () => {
    expect(extractParts('<score-part id="P1"></score-part>')).toEqual(['P1']);
  });
  it('作品名・作曲者をプレフィル用に取り出す', () => {
    expect(extractWorkInfo(xml)).toEqual({ title: 'Sixteen Voicings', composer: 'Claude' });
  });
});
// /MAGI
