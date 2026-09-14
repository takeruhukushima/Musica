// MAGI
/** 確認再生の操作 UI（§8 範囲: 再生・一時停止・停止・シーク・音量）。 */
import type { PlayerState } from '../lib/playback/player';

interface Props {
  state: PlayerState;
  position: number;
  duration: number;
  volume: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (sec: number) => void;
  onVolume: (v: number) => void;
}

function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PlaybackControls(props: Props) {
  const { state, position, duration, volume } = props;
  const playing = state === 'playing';
  const loading = state === 'loading';
  const ready = state === 'ready' || state === 'paused' || state === 'playing';

  return (
    <div class="playback">
      <div class="transport">
        {playing ? (
          <button class="btn" onClick={props.onPause} aria-label="一時停止">⏸</button>
        ) : (
          <button class="btn primary" onClick={props.onPlay} disabled={!ready && !loading} aria-label="確認再生">
            {loading ? '読込中…' : '▶'}
          </button>
        )}
        <button class="btn" onClick={props.onStop} disabled={!ready} aria-label="停止">⏹</button>
        <span class="time" aria-hidden="true">{fmt(position)} / {fmt(duration)}</span>
      </div>
      <input
        class="seek"
        type="range"
        min={0}
        max={Math.max(0.01, duration)}
        step={0.01}
        value={position}
        onInput={(e) => props.onSeek(Number((e.target as HTMLInputElement).value))}
        aria-label="再生位置"
        disabled={!ready}
      />
      <label class="volume">
        音量
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onInput={(e) => props.onVolume(Number((e.target as HTMLInputElement).value))}
          aria-label="音量"
        />
      </label>
      <p class="note">※「確認再生」は演奏の再現ではなく、記譜された音高と音価を耳で確かめるための機能です。</p>
    </div>
  );
}
// /MAGI
