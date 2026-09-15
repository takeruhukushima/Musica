// MAGI
/**
 * 本番用 OAuth クライアントメタデータ（§9）。
 * SITE + BASE から生成するため、astro.config の設定と常に一致する。
 * client_id はこの JSON 自身の URL。redirect_uris はサイトのトップ（BASE 直下）。
 * token_endpoint_auth_method=none の公開クライアント（ブラウザ SPA / 秘密鍵なし）。
 *
 * 開発（127.0.0.1 / localhost）は loopback クライアントを使うため、この JSON は本番用。
 */
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://example.invalid')).origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const root = `${origin}${base}/`;
  const clientId = `${origin}${base}/client-metadata.json`;

  const metadata = {
    client_id: clientId,
    client_name: 'Musica',
    client_uri: root,
    redirect_uris: [root],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  };

  return new Response(JSON.stringify(metadata, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
// /MAGI
