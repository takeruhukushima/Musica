// MAGI
/** エラーは音楽の言葉で表示し、技術詳細は折りたたむ（§12 エラー表示）。 */
import type { FriendlyError } from '../lib/errors/musicalErrors';

export function ErrorPanel({ errors }: { errors: FriendlyError[] }) {
  if (errors.length === 0) return null;
  return (
    <div class="panel-block error" role="alert">
      {errors.map((e, i) => (
        <div key={i} class="issue">
          <div class="issue-msg">✕ {e.message}</div>
          <details>
            <summary>詳細</summary>
            <pre>{e.detail}</pre>
          </details>
        </div>
      ))}
    </div>
  );
}

export function WarningPanel({ warnings }: { warnings: string[] }) {
  const items = warnings.filter((w) => w && w.trim().length > 0);
  if (items.length === 0) return null;
  return (
    <div class="panel-block warn">
      <div class="issue-msg">△ 未対応の記譜が含まれる可能性があります（描画は可能な範囲で継続 / AC-17）</div>
      <details>
        <summary>詳細</summary>
        <pre>{items.join('\n')}</pre>
      </details>
    </div>
  );
}
// /MAGI
