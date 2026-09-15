// MAGI
/**
 * 取り込み・プレビュー 2 ペイン（§12 / 第1段階の中核）。
 * 左: テキスト入力 + ドラッグ&ドロップ。右: 譜面プレビュー + 確認再生。
 * ログインなしで描画・確認再生まで到達する（AC-18）。公開操作は第2段階。
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ingestText, ingestBytes, type IngestResult } from '../lib/ingest';
import { renderScore, loadVerovio } from '../lib/render/verovio';
import { ConfirmPlayer, type PlayerState } from '../lib/playback/player';
import { createHighlighter, type Highlighter } from '../lib/playback/highlight';
import { toFriendlyList, type FriendlyError } from '../lib/errors/musicalErrors';
import { detectText } from '../lib/detect';
import { PlaybackControls } from './PlaybackControls';
import { ErrorPanel, WarningPanel } from './ErrorPanel';
import { PublishPanel, type PublishContent } from './PublishPanel';
import { extractWorkInfo } from '../lib/atproto/summary';
import { takeEditHandoff, type EditHandoff } from '../lib/editHandoff';
import type { ScoreMeta } from '../lib/atproto/lexicon';

type Status = 'idle' | 'working' | 'ready' | 'error';

const FORMAT_LABEL: Record<string, string> = {
  musicxml: 'MusicXML',
  mxl: 'MusicXML (.mxl 圧縮)',
  abc: 'ABC',
  unknown: '未判別',
};

const SAMPLE_ABC = `X:1\nT:確認用サンプル\nM:4/4\nL:1/4\nK:C\n"C" C D E F | "G7" G A B c | "C" c2 G2 | c4 |]\n`;

export function ImportStudio() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<string>('unknown');
  const [detectReason, setDetectReason] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FriendlyError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [dragOver, setDragOver] = useState(false);
  const [audioNote, setAudioNote] = useState('');
  // 公開用: 取り込みに成功した原本と要約、更新対象（マイ楽譜からの編集）。
  const [content, setContent] = useState<PublishContent | null>(null);
  const [suggestedMeta, setSuggestedMeta] = useState<ScoreMeta | undefined>(undefined);
  const [editTarget, setEditTarget] = useState<EditHandoff | null>(null);

  const svgRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ConfirmPlayer | null>(null);
  const highlighterRef = useRef<Highlighter | null>(null);
  const genRef = useRef(0);

  // プレイヤーは一度だけ生成
  if (!playerRef.current && typeof window !== 'undefined') {
    const p = new ConfirmPlayer();
    p.onState = (s) => setPlayerState(s);
    p.onPosition = (sec, playing) => {
      setPosition(sec);
      if (playing) highlighterRef.current?.update(sec * 1000);
      else if (sec === 0) highlighterRef.current?.clear();
    };
    p.onError = (msg) => setAudioNote(msg);
    playerRef.current = p;
  }

  useEffect(() => () => playerRef.current?.dispose(), []);

  // マイ楽譜からの編集ハンドオフ（§5 更新）。editSource（ABC）優先で本文に読み込む。
  useEffect(() => {
    const h = takeEditHandoff();
    if (h) {
      setEditTarget(h);
      setSuggestedMeta(h.meta);
      setText(h.editorText);
    }
  }, []);

  const process = useCallback(async (input: { text?: string; bytes?: Uint8Array }) => {
    const gen = ++genRef.current;
    playerRef.current?.stop();
    highlighterRef.current?.clear();
    setStatus('working');
    setErrors([]);
    setWarnings([]);

    let result: IngestResult;
    try {
      result = input.bytes ? await ingestBytes(input.bytes) : await ingestText(input.text ?? '');
    } catch (e) {
      if (gen !== genRef.current) return;
      setStatus('error');
      setErrors([{ message: '取り込み中にエラーが発生しました。', detail: String(e) }]);
      return;
    }
    if (gen !== genRef.current) return;

    setFormat(result.format);
    setDetectReason(result.detectReason);

    if (!result.ok || !result.musicXml) {
      setStatus('error');
      setErrors(toFriendlyList(result.issues));
      if (svgRef.current) svgRef.current.innerHTML = '';
      setDuration(0);
      setPosition(0);
      setContent(null); // 公開不可（有効な原本が無い）
      return;
    }

    // 描画
    try {
      const { result: rr, render } = await renderScore(result.musicXml);
      if (gen !== genRef.current) return;
      if (!rr.ok || !render) {
        setStatus('error');
        setErrors(toFriendlyList(rr.issues));
        return;
      }
      if (svgRef.current) svgRef.current.innerHTML = render.pages.join('\n');
      setWarnings(render.warnings);

      // 確認再生とハイライトの準備（音源は再生操作時にロード）
      const tk = await loadVerovio();
      if (gen !== genRef.current) return;
      playerRef.current?.load(tk.renderToMIDI());
      setDuration(playerRef.current?.durationSec ?? 0);
      setPosition(0);
      if (svgRef.current) highlighterRef.current = createHighlighter(tk, svgRef.current);

      // 公開用コンテンツを確定（原本は常に MusicXML。ABC なら原文を editSource として保持 / §9）。
      setContent({
        musicXml: result.musicXml,
        editSourceText: result.editSource?.text,
        editFormat: result.editSource?.format,
        durationSec: playerRef.current?.durationSec,
      });
      // 更新でなければ、原本の作品名・作曲者を公開フォームへプレフィル。
      if (!editTarget) {
        const info = extractWorkInfo(result.musicXml);
        setSuggestedMeta({ title: info.title ?? '', composer: info.composer });
      }
      setStatus('ready');
    } catch (e) {
      if (gen !== genRef.current) return;
      setStatus('error');
      setErrors([{ message: 'この楽譜を描画できませんでした。', detail: String(e) }]);
    }
  }, [editTarget]);

  // テキスト入力の debounce（入力停止後に再描画 / §15）
  useEffect(() => {
    if (text.trim().length === 0) {
      setStatus('idle');
      setFormat('unknown');
      setErrors([]);
      setContent(null);
      if (svgRef.current) svgRef.current.innerHTML = '';
      return;
    }
    setFormat(detectText(text).format);
    const t = setTimeout(() => void process({ text }), 600);
    return () => clearTimeout(t);
  }, [text, process]);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const buf = new Uint8Array(await file.arrayBuffer());
      // .mxl（ZIP）はバイナリなのでテキスト欄に入れず直接処理。テキスト系は欄へ反映。
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      if (isZip) {
        setText('');
        void process({ bytes: buf });
      } else {
        try {
          setText(new TextDecoder('utf-8', { fatal: true }).decode(buf));
        } catch {
          void process({ bytes: buf });
        }
      }
    },
    [process],
  );

  const player = playerRef.current;

  return (
    <div class="studio">
      <section class="pane left">
        <div class="pane-head">
          <label for="abc-input">入力（MusicXML / ABC を貼り付け、またはファイルをドロップ）</label>
          <span class="badge">{FORMAT_LABEL[format] ?? format}</span>
        </div>
        <div
          class={`drop ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer?.files ?? null);
          }}
        >
          <textarea
            id="abc-input"
            value={text}
            spellcheck={false}
            placeholder="ここに MusicXML または ABC を貼り付け…"
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
        </div>
        <div class="left-actions">
          <input
            id="file-input"
            type="file"
            accept=".musicxml,.xml,.mxl,.abc,text/xml,application/xml"
            onChange={(e) => void onFiles((e.target as HTMLInputElement).files)}
          />
          <button class="btn" type="button" onClick={() => setText(SAMPLE_ABC)}>
            サンプルABCを入れる
          </button>
        </div>
        {detectReason && <p class="detect-note">判別: {detectReason}</p>}
      </section>

      <section class="pane right">
        <div class="pane-head">
          <span>譜面プレビュー</span>
          {status === 'working' && <span class="badge">処理中…</span>}
        </div>
        <ErrorPanel errors={errors} />
        <WarningPanel warnings={warnings} />
        <div class="score-scroll">
          <div class="score" ref={svgRef} aria-label="譜面" />
          {status === 'idle' && <p class="placeholder">入力すると、ここに譜面が表示され確認再生できます。</p>}
        </div>
        {status === 'ready' && player && (
          <PlaybackControls
            state={playerState}
            position={position}
            duration={duration}
            volume={volume}
            onPlay={() => {
              setAudioNote('');
              void player.play();
            }}
            onPause={() => player.pause()}
            onStop={() => player.stop()}
            onSeek={(s) => void player.seek(s)}
            onVolume={(v) => {
              setVolume(v);
              player.setVolume(v);
            }}
          />
        )}
        {audioNote && <p class="detect-note" role="alert">♪ {audioNote}</p>}

        {editTarget && (
          <p class="detect-note" role="status">
            編集モード: 既存作品を更新します（{editTarget.meta.title}）。公開すると同じ作品URLを維持します。
          </p>
        )}
        <PublishPanel
          content={content}
          target={editTarget?.target ?? null}
          initialMeta={suggestedMeta}
          createdAt={editTarget?.createdAt}
        />
      </section>
    </div>
  );
}
// /MAGI
