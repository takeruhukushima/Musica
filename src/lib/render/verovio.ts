// MAGI
/**
 * Verovio による描画（§7）。
 *
 * - MusicXML を直接入力し SVG を出力する（中間形式を作らない）。
 * - Bravura を font オプションで明示指定する（§7）。
 * - MIDI 出力と時刻問い合わせ API を同じエンジンが提供するため、§8 の
 *   確認再生とハイライトを同一トキットで賄う。
 *
 * WASM は verovio-module.mjs に埋め込まれており別ファイル取得が不要なので、
 * GitHub Pages の base path 問題を受けない。ホームでは読み込まず、取り込み・
 * 作品表示画面で動的 import する（§15 軽量性）。
 */

import { LIMITS } from '../limits';
import { sanitizeSvg } from './sanitizeSvg';
import type { ValidationResult } from '../validate/types';

export interface RenderResult {
  /** 無害化済みの各ページ SVG */
  pages: string[];
  pageCount: number;
  /** 未対応要素などの警告（描画は継続する / AC-17） */
  warnings: string[];
}

type Toolkit = import('verovio/esm').VerovioToolkit;

let toolkitPromise: Promise<Toolkit> | null = null;

/** Verovio toolkit を一度だけ生成する（遅延ロード） */
export async function loadVerovio(): Promise<Toolkit> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
        import('verovio/wasm'),
        import('verovio/esm'),
      ]);
      const mod = await createVerovioModule();
      return new VerovioToolkit(mod);
    })();
  }
  return toolkitPromise;
}

const DEFAULT_OPTIONS: Record<string, unknown> = {
  font: 'Bravura', // §7: 0.2 で決めたフォント選択を維持
  breaks: 'auto',
  adjustPageHeight: true,
  pageMarginTop: 50,
  pageMarginBottom: 50,
  pageMarginLeft: 50,
  pageMarginRight: 50,
  scale: 40,
  footer: 'none',
  header: 'none',
};

/**
 * 検証済み MusicXML を描画する。
 * 呼び出し側は事前に §6 検証を通していること。ここでも描画エンジンの
 * 致命的エラー・ページ数・SVG サイズの上限で描画を中止する（§7）。
 */
export async function renderScore(
  xml: string,
  opts: { pageWidth?: number } = {},
): Promise<{ result: ValidationResult; render?: RenderResult }> {
  const toolkit = await loadVerovio();
  const warnings: string[] = [];

  toolkit.setOptions({ ...DEFAULT_OPTIONS, pageWidth: opts.pageWidth ?? 2100 });

  // 描画タイムアウト（§15）。Verovio は同期実行のため、実行前後で経過時間を確認し、
  // 上限超過ならページ描画を打ち切る（真の中断は WASM の制約上ページ単位で行う）。
  const started = Date.now();

  const loaded = toolkit.loadData(xml);
  if (!loaded) {
    return {
      result: { ok: false, issues: [{ code: 'render-failed', detail: toolkit.getLog() || 'loadData に失敗' }] },
    };
  }

  // 描画エンジンのログを未対応要素の警告として拾う（AC-17）。
  const log = toolkit.getLog();
  if (log && log.trim().length > 0) {
    warnings.push(log.trim());
  }

  const pageCount = toolkit.getPageCount();
  if (pageCount > LIMITS.maxPages) {
    return {
      result: { ok: false, issues: [{ code: 'too-many-pages', detail: `ページ数 ${pageCount} が上限 ${LIMITS.maxPages} を超過` }] },
    };
  }

  const pages: string[] = [];
  let totalSvgBytes = 0;
  for (let p = 1; p <= pageCount; p++) {
    if (Date.now() - started > LIMITS.renderTimeoutMs) {
      return {
        result: { ok: false, issues: [{ code: 'render-timeout', detail: `描画が ${LIMITS.renderTimeoutMs}ms を超過` }] },
      };
    }
    const raw = toolkit.renderToSVG(p);
    totalSvgBytes += raw.length;
    if (totalSvgBytes > LIMITS.maxSvgBytes) {
      return {
        result: { ok: false, issues: [{ code: 'svg-too-large', detail: `SVG 合計サイズが上限 ${LIMITS.maxSvgBytes} を超過` }] },
      };
    }
    pages.push(sanitizeSvg(raw));
  }

  return { result: { ok: true, issues: [] }, render: { pages, pageCount, warnings } };
}
// /MAGI
