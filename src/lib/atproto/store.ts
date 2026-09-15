// MAGI
/**
 * 認証セッションの共有ストア（Preact 用）。
 *
 * AuthBar / PublishPanel / MyScores が同じセッションを参照するためのモジュールレベルの
 * 小さな observable。init は一度だけ走らせ、複数コンポーネントで購読する。
 * アカウント切替時はセッション・下書き・編集対象の分離が必要（§4）なので、
 * サインアウト時に状態を確実に空へ戻す。
 */

import type { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-browser';
import { agentFromSession, initSession, signIn as clientSignIn, signOut as clientSignOut, takeReturnTo } from './client';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  did?: string;
  handle?: string;
  agent?: Agent;
  session?: OAuthSession;
  error?: string;
}

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
let initStarted = false;

function set(next: Partial<AuthState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function resolveHandle(agent: Agent, did: string): Promise<string | undefined> {
  try {
    const res = await agent.com.atproto.repo.describeRepo({ repo: did });
    return res.data.handle;
  } catch {
    return undefined;
  }
}

async function adopt(session: OAuthSession): Promise<void> {
  const agent = await agentFromSession(session);
  const did = session.did;
  set({ status: 'signedIn', session, agent, did, error: undefined });
  const handle = await resolveHandle(agent, did);
  if (handle) set({ handle });
}

/** 起動時に一度だけ呼ぶ。コールバック処理 or セッション復元を行う。 */
export async function ensureAuthInit(): Promise<void> {
  if (initStarted) return;
  initStarted = true;
  try {
    const session = await initSession();
    if (session) {
      await adopt(session);
      // コールバックで別ページに着地した場合、元のページへ戻す。
      const returnTo = takeReturnTo();
      if (returnTo && returnTo !== window.location.href) {
        window.location.replace(returnTo);
        return;
      }
    } else {
      set({ status: 'signedOut' });
    }
  } catch (e) {
    set({ status: 'signedOut', error: (e as Error).message });
  }
}

export async function signIn(handle: string): Promise<void> {
  set({ error: undefined });
  await clientSignIn(handle);
}

export async function signOut(): Promise<void> {
  const s = state.session;
  if (s) {
    try {
      await clientSignOut(s);
    } catch {
      /* 破棄失敗でもローカル状態は空へ戻す */
    }
  }
  set({ status: 'signedOut', session: undefined, agent: undefined, did: undefined, handle: undefined });
}
// /MAGI
