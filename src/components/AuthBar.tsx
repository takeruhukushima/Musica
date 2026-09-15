// MAGI
/**
 * ログイン状態バー（§9 / §12 設定・認証復帰）。
 * ヘッダに常設し、どのページでもコールバック処理・復元・サインインを担う。
 * ログインなしでも取り込み・描画・確認再生は使える（AC-18）。公開操作でのみログインを求める。
 */
import { useState } from 'preact/hooks';
import { useAuth } from '../lib/atproto/useAuth';
import { signIn, signOut } from '../lib/atproto/store';

export function AuthBar() {
  const auth = useAuth();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.status === 'loading') {
    return <span class="authbar muted small">認証確認中…</span>;
  }

  if (auth.status === 'signedIn') {
    return (
      <span class="authbar">
        <span class="who" title={auth.did}>@{auth.handle ?? auth.did}</span>
        <button
          class="btn small"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
          }}
        >
          ログアウト
        </button>
      </span>
    );
  }

  return (
    <form
      class="authbar signin"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!handle.trim()) return;
        setBusy(true);
        try {
          await signIn(handle);
        } catch (err) {
          setBusy(false);
          alert(`ログインを開始できませんでした: ${(err as Error).message}`);
        }
      }}
    >
      <input
        class="handle"
        type="text"
        inputMode="email"
        autocomplete="username"
        placeholder="ハンドル（例 alice.bsky.social）"
        value={handle}
        onInput={(e) => setHandle((e.target as HTMLInputElement).value)}
      />
      <button class="btn small primary" type="submit" disabled={busy || !handle.trim()}>
        {busy ? '…' : 'ログイン'}
      </button>
      {auth.error && <span class="muted small" role="alert">{auth.error}</span>}
    </form>
  );
}
// /MAGI
