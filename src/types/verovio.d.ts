// MAGI
// verovio は型定義を同梱しないため、Musica が利用する範囲だけを宣言する。
declare module 'verovio/wasm' {
  // Emscripten モジュールファクトリ。WASM は .mjs に埋め込まれており別ファイル取得は不要。
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(page: number, xmlDeclaration?: boolean): string;
    /** Base64 エンコードされた MIDI を返す */
    renderToMIDI(): string;
    /** JSON 文字列: { page, notes: string[], ... } */
    getElementsAtTime(ms: number): string;
    setOptions(options: Record<string, unknown>): void;
    getTimeForElement(id: string): number;
    redoLayout(options?: Record<string, unknown>): void;
    getLog(): string;
  }
}
// /MAGI
