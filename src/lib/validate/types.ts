// MAGI
/**
 * 検証結果の共通型。
 * 検証層は「音楽の言葉」に翻訳しやすい構造化コードを返し、
 * 翻訳は errors/musicalErrors.ts が担う（§12 エラー表示）。
 */

export type IssueCode =
  // XML
  | 'doctype-forbidden' // DOCTYPE 宣言を含む（§6）
  | 'entity-forbidden' // 実体(ENTITY)定義/その他のマークアップ宣言を含む（§6）
  | 'external-reference' // 外部参照を検出（解決しない）
  | 'not-well-formed' // 整形式でない
  | 'encoding-mismatch' // 宣言符号化と実体が不一致（§6）
  | 'too-large' // サイズ上限超過
  | 'too-deep' // ネスト深さ上限超過
  | 'too-many-elements' // 要素数上限超過
  | 'not-musicxml' // MusicXML の root 要素が見つからない
  // MXL (ZIP)
  | 'not-zip'
  | 'zip-too-large'
  | 'zip-too-many-entries'
  | 'zip-path-traversal'
  | 'zip-bomb' // 圧縮率/展開後サイズ上限超過
  | 'container-missing' // META-INF/container.xml が無い
  | 'container-invalid' // container.xml が指す原本が書庫外/不正
  | 'rootfile-missing'
  // ABC
  | 'abc-too-large'
  | 'abc-too-many-voices'
  | 'abc-too-many-measures'
  | 'abc-convert-failed'
  | 'abc-convert-timeout'
  // 描画
  | 'render-failed'
  | 'render-timeout'
  | 'too-many-pages'
  | 'svg-too-large';

export interface Issue {
  code: IssueCode;
  /** 技術的な詳細（折りたたみ表示に回す）。行番号や内部要素名はここに置く */
  detail: string;
  /** 該当位置（分かる場合のみ、1始まりの行番号） */
  line?: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  stats?: {
    elementCount?: number;
    maxDepth?: number;
    byteLength?: number;
  };
}

export function fail(code: IssueCode, detail: string, line?: number): ValidationResult {
  return { ok: false, issues: [{ code, detail, line }] };
}
// /MAGI
