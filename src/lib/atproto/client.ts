// MAGI
/**
 * AT Protocol ブラウザ OAuth クライアント（§9 / 第2段階）。
 *
 * - 認証は @atproto/oauth-client-browser を採用（§9）。作品コレクションと blob 操作を許可範囲とする。
 * - 開発（127.0.0.1 / ::1）は loopback クライアント（メタデータ配信不要）を使う。
 * - 本番（GitHub Pages 等）は自オリジンの client-metadata.json を client_id とする。
 *   その JSON は src/pages/client-metadata.json.ts が SITE/BASE から生成する（設定と常に一致）。
 * - トークン・鍵は IndexedDB にライブラリが保持する。パスワードは扱わない（§9）。
 *
 * SDK 自体は認証が必要な経路でのみ動的 import する（§15 軽量性）。
 */

import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';

const HANDLE_RESOLVER = 'https://bsky.social';
// 作品の公開・更新・削除（repo 書き込みと blob）に必要な範囲。
const SCOPE = 'atproto transition:generic';

let clientPromise: Promise<BrowserOAuthClient> | null = null;

function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
}

/** 本番用 client_id（自オリジン + base の client-metadata.json）。 */
function productionClientId(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/client-metadata.json`;
}

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { BrowserOAuthClient, buildLoopbackClientId } = await import('@atproto/oauth-client-browser');
      const loc = window.location;
      const loopback = isLoopbackHost(loc.hostname);
      // loopback の client_id はパス成分を含められない（認可サーバが拒否する）。
      // どのページからログインしても client_id が一定になるよう pathname を '/' に固定し、
      // リダイレクト先もルートにする。元のページへは returnTo で戻す（store 側）。
      // さらに loopback では許可スコープを client_id の query に宣言する必要がある
      // （宣言が無いと signIn の scope が invalid_scope になる）。
      let clientId: string;
      if (loopback) {
        const base = buildLoopbackClientId({ hostname: loc.hostname, port: loc.port, pathname: '/' });
        clientId = `${base}&scope=${encodeURIComponent(SCOPE)}`;
      } else {
        clientId = productionClientId();
      }
      return BrowserOAuthClient.load({ clientId, handleResolver: HANDLE_RESOLVER });
    })();
  }
  return clientPromise;
}

/**
 * 起動時の復元 / コールバック処理。
 * URL に OAuth パラメータがあればコールバックを完了し、無ければ既存セッションを復元する。
 * 返り値は復元/確立できたセッション（無ければ null）。
 */
export async function initSession(): Promise<OAuthSession | null> {
  const client = await getOAuthClient();
  const result = await client.init();
  return result?.session ?? null;
}

const RETURN_KEY = 'musica:returnTo';

/**
 * ハンドル（例 alice.bsky.social）でログインを開始する。認可サーバへリダイレクトするため戻らない。
 * 現在の URL を保存し、コールバック完了後に戻れるようにする。
 */
export async function signIn(handle: string): Promise<never> {
  const client = await getOAuthClient();
  try {
    sessionStorage.setItem(RETURN_KEY, window.location.href);
  } catch {
    /* sessionStorage 不可でも致命ではない */
  }
  await client.signInRedirect(handle.trim(), { scope: SCOPE });
  // signInRedirect は戻らない。
  return undefined as never;
}

/** コールバック完了後の戻り先 URL を取り出して消費する。 */
export function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    if (v) sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/** サインアウト。セッションを破棄する。 */
export async function signOut(session: OAuthSession): Promise<void> {
  await session.signOut();
}

/** セッションから認証済み Agent を作る（動的 import で @atproto/api を読む）。 */
export async function agentFromSession(session: OAuthSession) {
  const { Agent } = await import('@atproto/api');
  return new Agent(session);
}
// /MAGI
