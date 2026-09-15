// MAGI
/**
 * 一覧表示用の要約抽出（§9 parts / durationSec）。
 * これは冗長情報であり、原本と食い違う場合は原本を正とする。
 * 純粋な文字列処理のみで DOM に依存しない（Node の単体テスト対象）。
 */

/** MusicXML から <part-name> のテキストを取り出す（無ければ score-part id で代替）。 */
export function extractParts(xml: string): string[] {
  const names: string[] = [];
  const re = /<part-name(?:\s[^>]*)?>([\s\S]*?)<\/part-name>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = decodeXmlText(m[1]).trim();
    if (text) names.push(text);
  }
  if (names.length > 0) return names;
  // part-name が空/無い場合は score-part の id を数える。
  const ids = [...xml.matchAll(/<score-part\s+id="([^"]+)"/g)].map((x) => x[1]);
  return ids;
}

/** MusicXML から作品名・作曲者をプレフィル用に取り出す（原本のテキストはそのまま扱う / §7）。 */
export function extractWorkInfo(xml: string): { title?: string; composer?: string } {
  const title =
    firstText(xml, /<work-title(?:\s[^>]*)?>([\s\S]*?)<\/work-title>/) ??
    firstText(xml, /<movement-title(?:\s[^>]*)?>([\s\S]*?)<\/movement-title>/);
  const composer =
    firstText(xml, /<creator\s+type="composer"[^>]*>([\s\S]*?)<\/creator>/) ??
    firstText(xml, /<creator[^>]*>([\s\S]*?)<\/creator>/);
  return { title, composer };
}

function firstText(xml: string, re: RegExp): string | undefined {
  const m = re.exec(xml);
  const t = m ? decodeXmlText(m[1]).trim() : '';
  return t || undefined;
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
// /MAGI
