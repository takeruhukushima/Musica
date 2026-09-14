// MAGI
/**
 * Verovio が出力する MIDI(base64) を、確認再生用の内部イベント表現へ変換する（§8）。
 * これは音声再生へ渡す内部 API であり、保存形式ではない。
 *
 * テンポマップの解釈（tick→秒）は @tonejs/midi に委ね、手書きの誤りを避ける。
 */

import { Midi } from '@tonejs/midi';

export interface NoteEvent {
  /** 発音開始（秒） */
  startSec: number;
  /** 長さ（秒） */
  durationSec: number;
  /** 0〜127 の音高 */
  midiNote: number;
  /** 発音強度 0〜1 */
  velocity: number;
}

export interface ParsedMidi {
  events: NoteEvent[];
  durationSec: number;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  // Node 環境（テスト）
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * base64 MIDI を解析する。記譜された音符のみが対象で、伴奏等の補完は行わない（AC-10/11）。
 * Verovio の MIDI 出力自体がコードシンボル(<harmony>)を音に変換しないため、
 * ここでもイベントを加工・追加しない。
 */
export function parseMidiBase64(b64: string): ParsedMidi {
  const midi = new Midi(base64ToBytes(b64));
  const events: NoteEvent[] = [];
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      events.push({
        startSec: note.time,
        durationSec: note.duration,
        midiNote: note.midi,
        velocity: note.velocity, // @tonejs/midi は 0..1
      });
    }
  }
  events.sort((a, b) => a.startSec - b.startSec);
  return { events, durationSec: midi.duration };
}
// /MAGI
