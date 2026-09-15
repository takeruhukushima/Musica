// MAGI
/** 認証ストアを Preact コンポーネントから購読するフック（§9 / 第2段階）。 */
import { useEffect, useState } from 'preact/hooks';
import { ensureAuthInit, getAuthState, subscribeAuth, type AuthState } from './store';

export function useAuth(): AuthState {
  const [snap, setSnap] = useState<AuthState>(() => getAuthState());
  useEffect(() => {
    const unsub = subscribeAuth(() => setSnap(getAuthState()));
    void ensureAuthInit();
    return () => {
      unsub();
    };
  }, []);
  return snap;
}
// /MAGI
