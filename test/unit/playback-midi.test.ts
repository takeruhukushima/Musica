// MAGI
// @vitest-environment node
// Verovio を実際に動かして、確認再生が設計原則4（書かれていない音を鳴らさない）を
// 満たすことを検証する。WASM ロードを伴うため node 環境・長めのタイムアウトで実行する。
import { describe, it, expect, beforeAll } from 'vitest';
import { parseMidiBase64 } from '../../src/lib/playback/midi';

type Toolkit = import('verovio/esm').VerovioToolkit;
let toolkit: Toolkit;

beforeAll(async () => {
  const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
    import('verovio/wasm'),
    import('verovio/esm'),
  ]);
  const mod = await createVerovioModule();
  toolkit = new VerovioToolkit(mod);
}, 60_000);

const wrap = (body: string) =>
  '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
  '<part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>' +
  `<part id="P1">${body}</part></score-partwise>`;

function midiEvents(xml: string) {
  expect(toolkit.loadData(xml)).toBeTruthy(); // WASM cwrap は 1/0 を返す
  return parseMidiBase64(toolkit.renderToMIDI()).events;
}

describe('確認再生 — 記譜通りの発音（AC-10）', () => {
  it('和音 C4/E4/G4 が書かれた通りの音高で鳴る', () => {
    const xml = wrap(
      '<measure number="1"><attributes><divisions>1</divisions>' +
        '<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>' +
        '<clef><sign>G</sign><line>2</line></clef></attributes>' +
        '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>' +
        '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>' +
        '<note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>' +
        '</measure>',
    );
    const notes = midiEvents(xml).map((e) => e.midiNote).sort((a, b) => a - b);
    // C4=60, E4=64, G4=67。置換・省略・追加をしない。
    expect(notes).toEqual([60, 64, 67]);
  });
});

describe('確認再生 — コードシンボルを鳴らさない（AC-11）', () => {
  it('コードシンボルのみで音符が無い小節は無音（伴奏を生成しない）', () => {
    const xml = wrap(
      '<measure number="1"><attributes><divisions>1</divisions>' +
        '<key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>' +
        '<clef><sign>G</sign><line>2</line></clef></attributes>' +
        '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>' +
        '<note><rest/><duration>4</duration><type>whole</type></note>' +
        '</measure>',
    );
    expect(midiEvents(xml).length).toBe(0);
  });
});
// /MAGI
