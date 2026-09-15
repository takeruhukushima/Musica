// MAGI
/**
 * TID（Timestamp Identifier）生成。レコードキーに用いる。
 *
 * §9: 公開は「試行ごとのレコードキーを保持し、タイムアウト時は同じキーを照会して重複作成を避ける」。
 * このため rkey はクライアント側で先に生成し、putRecord に渡す（サーバ採番の createRecord は使わない）。
 *
 * 形式（AT Protocol 仕様）: 64bit 値を base32-sortable で 13 文字にエンコードする。
 * 最上位ビットは 0。値 = (マイクロ秒タイムスタンプ << 10) | clockId(10bit)。
 * 単調増加を保証するため、同一プロセス内では前回値を下回らないよう補正する。
 */

const B32_SORTABLE = '234567abcdefghijklmnopqrstuvwxyz';

let lastMicros = 0;
// clockId はプロセスごとにランダム（複数タブでの衝突可能性を下げる / 仕様）
const clockId = Math.floor(Math.random() * 1024);

export function nextTid(): string {
  let micros = Date.now() * 1000;
  if (micros <= lastMicros) micros = lastMicros + 1;
  lastMicros = micros;
  let value = (BigInt(micros) << 10n) | BigInt(clockId & 0x3ff);
  let out = '';
  for (let i = 0; i < 13; i++) {
    out = B32_SORTABLE[Number(value & 0x1fn)] + out;
    value >>= 5n;
  }
  return out;
}

/** TID の形式検証（13 文字・base32-sortable・先頭は sortable 前半）。 */
export function isTid(s: string): boolean {
  if (s.length !== 13) return false;
  for (const ch of s) if (!B32_SORTABLE.includes(ch)) return false;
  // 先頭 5bit の最上位ビットは 0（= B32_SORTABLE の前半 16 文字）でなければ 64bit を超える。
  return B32_SORTABLE.indexOf(s[0]) < 16;
}
// /MAGI
