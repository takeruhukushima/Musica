// MAGI
/**
 * 確認再生（§8）。
 *
 * 位置づけ: 演奏の再現ではなく「記譜された音高と音価を耳で確認する手段」。
 * - 記譜された音符・和音を書かれた通りに鳴らす（構成音・音域・声部数を変更しない / AC-10）。
 * - コードシンボル・記譜のない伴奏を生成しない（Verovio MIDI に含まれない / AC-11）。
 * - 音源はアプリ共通のピアノ 1 音色。再生操作時にロードする（§8 / §15）。
 *
 * スイング・強弱の機微・ペダル・装飾音の解釈差は再現しない（§8 表現の限界）。
 */

import { parseMidiBase64, type NoteEvent } from './midi';

export type PlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

type SplendidGrandPianoCtor = typeof import('smplr').SplendidGrandPiano;
type Piano = InstanceType<SplendidGrandPianoCtor>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class ConfirmPlayer {
  private ctx: AudioContext | null = null;
  private piano: Piano | null = null;
  private events: NoteEvent[] = [];
  durationSec = 0;

  private startCtxTime = 0; // 再生開始時の AudioContext.currentTime
  private offsetSec = 0; // 曲内の現在位置（一時停止/シークの基準）
  private state: PlayerState = 'idle';
  private raf = 0;
  private volume = 100; // 0..127（smplr の volumeToGain は MIDI velocity 準拠）
  private hasData = false; // MIDI を読み込み済みか（音源ロードとは独立）

  /** 位置更新（秒, 再生中か）。ハイライトと UI が購読する */
  onPosition?: (sec: number, playing: boolean) => void;
  onState?: (s: PlayerState) => void;
  /** 音源ロード失敗など、再生に到達できなかったときの通知 */
  onError?: (message: string) => void;

  getState(): PlayerState {
    return this.state;
  }

  /**
   * MIDI(base64) を読み込む。音源（ピアノサンプル）はここではロードせず、
   * 再生操作時にロードする（§8/§15）。MIDI があれば「再生可能(ready)」とし、
   * 音源ロード待ちで再生ボタンが無効化される鶏卵状態を避ける。
   */
  load(midiBase64: string): void {
    const parsed = parseMidiBase64(midiBase64);
    this.events = parsed.events;
    this.durationSec = parsed.durationSec;
    this.offsetSec = 0;
    this.hasData = parsed.events.length > 0;
    this.setState(this.hasData ? 'ready' : 'idle');
  }

  private async ensureAudio(): Promise<void> {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.piano) {
      this.setState('loading');
      const { SplendidGrandPiano } = await import('smplr');
      this.piano = new SplendidGrandPiano(this.ctx);
      await this.piano.loaded();
      this.piano.output.setVolume(this.volume);
    }
  }

  async play(): Promise<void> {
    if (this.state === 'playing' || this.state === 'loading') return;
    if (!this.hasData) return;
    try {
      await this.ensureAudio();
    } catch (e) {
      // 音源ロード失敗（多くはサンプル取得のネットワーク不通）。ハングさせず ready に戻す。
      this.setState('ready');
      this.onError?.(`音源を読み込めませんでした: ${(e as Error).message}`);
      return;
    }
    const ctx = this.ctx!;
    const piano = this.piano!;

    if (this.offsetSec >= this.durationSec) this.offsetSec = 0;
    this.startCtxTime = ctx.currentTime;
    const base = this.startCtxTime - this.offsetSec;

    for (const e of this.events) {
      const end = e.startSec + e.durationSec;
      if (end <= this.offsetSec) continue; // すでに過ぎた音
      const startedBefore = e.startSec < this.offsetSec;
      const when = startedBefore ? ctx.currentTime : base + e.startSec;
      const duration = startedBefore ? end - this.offsetSec : e.durationSec;
      piano.start({
        note: e.midiNote,
        time: when,
        duration,
        velocity: Math.round(e.velocity * 127),
      });
    }

    this.setState('playing');
    this.tick();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.offsetSec = this.currentTimeSec();
    this.piano?.stop();
    cancelAnimationFrame(this.raf);
    this.setState('paused');
    this.onPosition?.(this.offsetSec, false);
  }

  stop(): void {
    this.piano?.stop();
    cancelAnimationFrame(this.raf);
    this.offsetSec = 0;
    this.setState(this.hasData ? 'ready' : 'idle');
    this.onPosition?.(0, false);
  }

  async seek(sec: number): Promise<void> {
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      this.piano?.stop();
      cancelAnimationFrame(this.raf);
    }
    this.offsetSec = clamp(sec, 0, this.durationSec);
    this.onPosition?.(this.offsetSec, false);
    if (wasPlaying) await this.play();
  }

  /** 0..1 の音量を受け取り 0..127 へ変換して適用 */
  setVolume(v01: number): void {
    this.volume = clamp(Math.round(v01 * 127), 0, 127);
    this.piano?.output.setVolume(this.volume);
  }

  currentTimeSec(): number {
    if (this.state !== 'playing' || !this.ctx) return this.offsetSec;
    return Math.min(this.offsetSec + (this.ctx.currentTime - this.startCtxTime), this.durationSec);
  }

  dispose(): void {
    this.piano?.stop();
    cancelAnimationFrame(this.raf);
    void this.ctx?.close();
    this.ctx = null;
    this.piano = null;
  }

  private tick = (): void => {
    const t = this.currentTimeSec();
    this.onPosition?.(t, true);
    if (t >= this.durationSec) {
      this.stop();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private setState(s: PlayerState): void {
    this.state = s;
    this.onState?.(s);
  }
}
// /MAGI
