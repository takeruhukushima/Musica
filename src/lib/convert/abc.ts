// MAGI
/**
 * ABC → MusicXML 変換（§6 受理する入力形式 / 第1段階の検証スパイク）。
 *
 * 方針:
 * - ABC→MusicXML は純粋なデータ変換であり、コード実行を伴わないため隔離実行は不要（§10）。
 * - 変換器は abc2xml（Wim Vree, LGPL）を Pyodide 上で実行する。ABC 判別時にのみ
 *   Pyodide と abc2xml.py を遅延ロードする（§15 軽量性）。
 * - 出力は DOCTYPE を含まない素の MusicXML（getXmlDocs + ElementTree）。
 *   abc2xml の getXmlScores は DOCTYPE を挿入するため使わない。
 * - 変換出力は検証済みとして扱わず、呼び出し側で §6 検証を通す（ingest.ts）。
 * - 原文 ABC は editSource として別に保持する（正本ではない / §9）。
 *
 * 注意（スパイクの限界 / §16）: Pyodide は同期実行のため、真の実行中断は Web Worker 化が必要。
 * 本実装は入力上限（文字数・声部数・小節数）を変換前に適用し、ロードにタイムアウトを設ける。
 * Worker によるハードタイムアウトは後続の改善項目とする。
 */

import { LIMITS } from '../limits';
import type { Issue } from '../validate/types';

export interface AbcConvertResult {
  ok: boolean;
  musicXml?: string;
  issues: Issue[];
  /** 変換器からの診断メッセージ（未対応記法の警告など） */
  warnings: string[];
}

// Pyodide の型は同梱しないため最小限で扱う。
interface PyodideLike {
  loadPackage(name: string): Promise<void>;
  pyimport(name: string): { install(pkg: string): Promise<void> };
  FS: { writeFile(path: string, data: Uint8Array): void };
  runPython(code: string): unknown;
  globals: { set(name: string, value: unknown): void };
}

const PYODIDE_VERSION = '0.26.4';

let runtimePromise: Promise<PyodideLike> | null = null;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function loadRuntime(): Promise<PyodideLike> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const indexURL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
      // 外部 ESM をランタイム import（バンドラに解析させない）。
      const mod = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideLike>;
      };
      const pyodide = await mod.loadPyodide({ indexURL });
      await pyodide.loadPackage('micropip');
      const micropip = pyodide.pyimport('micropip');
      await micropip.install('pyparsing');

      // abc2xml.py は自オリジンから取得する（外部依存を増やさない / LGPL の同梱物）。
      // latin-1 宣言のためバイト列のまま書き込み、Python 側の coding 宣言に委ねる。
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const resp = await fetch(`${base}/vendor/abc2xml.py`);
      if (!resp.ok) throw new Error(`abc2xml.py の取得に失敗: ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      pyodide.FS.writeFile('/abc2xml.py', bytes);
      pyodide.runPython(`import sys\nif '/' not in sys.path: sys.path.insert(0, '/')`);
      return pyodide;
    })();
  }
  return runtimePromise;
}

/**
 * 声部フィールドの正規化（abc2xml 245 の制限への対応）。
 *
 * 背景: ABC の本文では `V:1 CDEF |` のように「声部フィールド + 同一行の音楽」が広く使われる
 * （abcm2ps 等が受理し、AI 生成 ABC でも頻出）。しかし採用中の abc2xml 245 はこの形を
 * 声部宣言としてのみ解釈し、同一行の音楽を捨てて「empty voice」として黙って欠落させる。
 * 結果、多声部 ABC の音符が一切変換されないバグになる（§6 変換の欠落は実用水準の判定対象）。
 *
 * 対応: 本文中の `V:<id> <音楽>` 行を、abc2xml が正しく扱うインライン形 `[V:<id>] <音楽>` へ
 * 書き換える。`V:1 clef=treble` のような属性のみの声部定義行はそのまま残す（声部の切替・定義）。
 * すでにインライン形 `[V:...]` の行や、本文前（チューンヘッダ）の行は対象外。
 *
 * これは純粋なデータ変換であり原本の意味を変えない。原文 ABC は editSource として別に保持するため
 * （§9 / AC-12）、この正規化は変換に渡すコピーにのみ適用する。
 */
// 声部フィールドの値として現れる属性キー（音楽ではなく声部定義）。
const VOICE_PROP_KEYS = new Set([
  'clef', 'name', 'nm', 'subname', 'snm', 'sname', 'stem', 'stems', 'gstem',
  'octave', 'transpose', 'middle', 'merge', 'up', 'down', 'space', 'bracket',
  'brace', 'gchord', 'dyn', 'lyrics', 'scale', 'staffscale', 'stafflines',
]);

function isVoicePropertyBody(rest: string): boolean {
  const toks = rest.trim().split(/\s+/);
  if (toks.length === 0) return false;
  return toks.every((t) => {
    const eq = t.indexOf('=');
    if (eq <= 0) return false;
    return VOICE_PROP_KEYS.has(t.slice(0, eq).toLowerCase());
  });
}

export function normalizeAbcVoices(abc: string): string {
  const lines = abc.split(/\n/);
  let inBody = false;
  return lines
    .map((line) => {
      // 最初の K: 行で本文が始まる（それ以降は key 変更を含めても本文扱い）。
      if (!inBody) {
        if (/^K:/.test(line)) inBody = true;
        return line;
      }
      // 本文の `V:<id> <rest>`（インライン形 [V:...] や属性のみは対象外）。
      const m = /^V:\s*(\S+)([ \t]+)(\S.*)$/.exec(line);
      if (!m) return line;
      const rest = m[3];
      if (isVoicePropertyBody(rest)) return line; // 声部定義（clef= 等）は残す
      return `[V:${m[1]}]${m[2]}${rest}`;
    })
    .join('\n');
}

/** 変換前の軽量な入力上限チェック（§6） */
function precheck(abc: string): Issue | null {
  if (abc.length > LIMITS.maxAbcChars) {
    return { code: 'abc-too-large', detail: `ABC ${abc.length} 文字が上限 ${LIMITS.maxAbcChars} を超過` };
  }
  const voices = (abc.match(/^V:/gm) ?? []).length;
  if (voices > LIMITS.maxAbcVoices) {
    return { code: 'abc-too-many-voices', detail: `声部数 ${voices} が上限 ${LIMITS.maxAbcVoices} を超過` };
  }
  const measures = (abc.match(/\|/g) ?? []).length;
  if (measures > LIMITS.maxAbcMeasures) {
    return { code: 'abc-too-many-measures', detail: `小節数 ${measures} が上限 ${LIMITS.maxAbcMeasures} を超過` };
  }
  return null;
}

export async function convertAbcToMusicXml(abc: string): Promise<AbcConvertResult> {
  const bad = precheck(abc);
  if (bad) return { ok: false, issues: [bad], warnings: [] };

  let pyodide: PyodideLike;
  try {
    // ロードは初回のみ重い。変換タイムアウトの数倍を許容する。
    pyodide = await withTimeout(loadRuntime(), LIMITS.abcConvertTimeoutMs * 4, '変換器ロード');
  } catch (e) {
    runtimePromise = null; // 次回リトライを許す
    return { ok: false, issues: [{ code: 'abc-convert-timeout', detail: (e as Error).message }], warnings: [] };
  }

  try {
    // 同一行の声部フィールド + 音楽（`V:1 CDEF |`）を abc2xml が扱えるインライン形へ正規化する。
    pyodide.globals.set('abc_input', normalizeAbcVoices(abc));
    // getXmlScores（DOCTYPE 挿入）ではなく getXmlDocs + ElementTree を使う。
    const code = [
      'import abc2xml, xml.etree.ElementTree as ET',
      '_docs = abc2xml.getXmlDocs(abc_input, 0, 1)',
      '_info = abc2xml.getInfo()',
      "_xml = ET.tostring(_docs[0], encoding='unicode') if _docs else ''",
      '(_xml, _info)',
    ].join('\n');
    const result = (await withTimeout(
      Promise.resolve().then(() => pyodide.runPython(code)),
      LIMITS.abcConvertTimeoutMs,
      'ABC変換',
    )) as { toJs?: () => [string, string] } | [string, string];

    // Pyodide のタプルは PyProxy。toJs があれば使う。
    const [xml, info] = typeof (result as { toJs?: unknown }).toJs === 'function'
      ? (result as { toJs: () => [string, string] }).toJs()
      : (result as [string, string]);

    const warnings = info ? [String(info).trim()].filter(Boolean) : [];
    if (!xml) {
      return { ok: false, issues: [{ code: 'abc-convert-failed', detail: info || '変換結果が空です' }], warnings };
    }
    return { ok: true, musicXml: xml, issues: [], warnings };
  } catch (e) {
    return { ok: false, issues: [{ code: 'abc-convert-failed', detail: (e as Error).message }], warnings: [] };
  }
}
// /MAGI
