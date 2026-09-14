// MAGI
/**
 * エラーを「音楽の言葉」で返す（§12 エラー表示）。
 * XML の行番号や内部要素名を主たる表示にせず、詳細（technical）として折りたたむ。
 */

import type { Issue, IssueCode } from '../validate/types';

export interface FriendlyError {
  /** 利用者向けの一文（音楽の言葉） */
  message: string;
  /** 折りたたみ表示に回す技術詳細 */
  detail: string;
}

const MESSAGES: Record<IssueCode, string> = {
  'doctype-forbidden': '安全のため、この楽譜ファイルは読み込めません（文書型宣言を含みます）。',
  'entity-forbidden': '安全のため、この楽譜ファイルは読み込めません（実体宣言を含みます）。',
  'external-reference': '外部を参照する記述があるため読み込みませんでした。',
  'not-well-formed': '楽譜ファイルの形式が壊れているようです。',
  'encoding-mismatch': '文字コードが対応外です（UTF-8 で保存し直してください）。',
  'too-large': 'ファイルが大きすぎます。',
  'too-deep': '楽譜の構造が複雑すぎます（入れ子が深すぎます）。',
  'too-many-elements': '楽譜の要素が多すぎます。',
  'not-musicxml': 'MusicXML として読み取れませんでした（score-partwise が見つかりません）。',
  'not-zip': '圧縮楽譜（.mxl）として読み取れませんでした。',
  'zip-too-large': '圧縮ファイルが大きすぎます。',
  'zip-too-many-entries': '圧縮ファイル内のファイル数が多すぎます。',
  'zip-path-traversal': '安全でないファイル名を含む圧縮ファイルのため読み込みませんでした。',
  'zip-bomb': '展開すると過大になる圧縮ファイルのため読み込みませんでした。',
  'container-missing': '圧縮楽譜の目次（container.xml）が見つかりません。',
  'container-invalid': '圧縮楽譜の目次が指す原本が見つかりません。',
  'rootfile-missing': '圧縮楽譜の中に原本が見つかりません。',
  'abc-too-large': 'ABC の入力が長すぎます。',
  'abc-too-many-voices': 'ABC の声部が多すぎます。',
  'abc-too-many-measures': 'ABC の小節が多すぎます。',
  'abc-convert-failed': 'ABC を楽譜に変換できませんでした。',
  'abc-convert-timeout': 'ABC の変換に時間がかかりすぎました。',
  'render-failed': 'この楽譜を描画できませんでした。',
  'render-timeout': '描画に時間がかかりすぎました。',
  'too-many-pages': 'ページ数が多すぎます。',
  'svg-too-large': '描画結果が大きすぎます。',
};

export function toFriendly(issue: Issue): FriendlyError {
  const message = MESSAGES[issue.code] ?? '楽譜を読み込めませんでした。';
  const detail = issue.line ? `[${issue.code}] Line ${issue.line}: ${issue.detail}` : `[${issue.code}] ${issue.detail}`;
  return { message, detail };
}

export function toFriendlyList(issues: Issue[]): FriendlyError[] {
  return issues.map(toFriendly);
}
// /MAGI
