// MAGI
/**
 * 再生位置のハイライト（§8 / AC-07）。
 * Verovio の getElementsAtTime(ms) で現在発音中の要素 ID を取得し、
 * SVG 上の該当要素へ強調用クラスを付与する。
 */

type Toolkit = import('verovio/esm').VerovioToolkit;

export const HIGHLIGHT_CLASS = 'musica-playing';

interface ElementsAtTime {
  notes?: string[];
  chords?: string[];
  rests?: string[];
  page?: number;
}

export interface Highlighter {
  update(ms: number): void;
  clear(): void;
}

/** CSS セレクタ用に ID をエスケープ（Verovio ID は英数字だが念のため） */
function byId(container: Element, id: string): Element | null {
  if (typeof (globalThis as { CSS?: { escape?(s: string): string } }).CSS?.escape === 'function') {
    return container.querySelector(`#${CSS.escape(id)}`);
  }
  return container.querySelector(`[id="${id.replace(/"/g, '\\"')}"]`);
}

export function createHighlighter(toolkit: Toolkit, container: Element): Highlighter {
  let current = new Set<string>();

  const setClass = (id: string, on: boolean) => {
    const el = byId(container, id);
    if (el) el.classList.toggle(HIGHLIGHT_CLASS, on);
  };

  return {
    update(ms: number): void {
      let ids: string[] = [];
      try {
        const r = JSON.parse(toolkit.getElementsAtTime(Math.max(0, Math.round(ms)))) as ElementsAtTime;
        ids = [...(r.notes ?? []), ...(r.chords ?? [])];
      } catch {
        ids = [];
      }
      const next = new Set(ids);
      for (const id of current) if (!next.has(id)) setClass(id, false);
      for (const id of next) if (!current.has(id)) setClass(id, true);
      current = next;
    },
    clear(): void {
      for (const id of current) setClass(id, false);
      current = new Set();
    },
  };
}
// /MAGI
