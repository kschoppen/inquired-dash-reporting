/**
 * Google sign-in for the dash: OAuth code flow with PKCE. Only verified inquired.com Google Workspace accounts get a session.
 *
 * GET /api/auth/login?next=/path   sends the visitor to Google's account chooser
 * GET /api/auth/callback           Google returns here; checks the ID token, sets the session cookie
 * GET /api/auth/logout             clears the session
 * GET /api/auth/me                 { email, name, known } for whoever is signed in
 *
 * Needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET (Functions scope).
 */
import type { Config } from '@netlify/functions';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SESSION_COOKIE, SESSION_DAYS, b64url, randomToken, readCookie, same, seal, sessionFrom, unseal } from '../lib/session';

const DOMAIN = 'inquired.com';
const OAUTH_COOKIE = 'hub_oauth';
const GOOGLE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
interface Pending { p: 'oauth'; state: string; nonce: string; verifier: string; next: string; exp: number }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const now = () => Math.floor(Date.now() / 1000);
const cookie = (name: string, value: string, maxAge: number, secure: boolean) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
// Only same-site paths, so the sign-in can't be used to bounce people to another site.
const safeNext = (s: string | null | undefined) => (s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/');

function page(status: number, title: string, html: string, cookies: string[] = []) {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  cookies.forEach((c) => headers.append('set-cookie', c));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | inquirED Dash</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#1d2b24;background:#fff;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:440px}h1{font-size:22px;margin:0 0 8px}a{color:#1f5c45;font-weight:700}</style></head>
<body><main><h1>${esc(title)}</h1>${html}</main></body></html>`, { status, headers });
}
const tryAgain = (next = '/') => `<p><a href="/api/auth/login?next=${encodeURIComponent(next)}">Sign in with Google</a></p>`;

export default async (req: Request) => {
  const url = new URL(req.url);
  const secure = url.protocol === 'https:';
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();

  if (route === 'me') {
    const who = await sessionFrom(req, process.env.SESSION_SECRET);
    if (!who) return Response.json({ error: 'Sign in first' }, { status: 401, headers: { 'cache-control': 'no-store' } });
    return Response.json({ email: who.email, name: who.name }, { headers: { 'cache-control': 'no-store' } });
  }
  if (route === 'logout') {
    return page(200, 'You are signed out', tryAgain(), [cookie(SESSION_COOKIE, '', 0, secure)]);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET, secret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !secret) return page(500, 'Sign-in is not set up yet', '<p>GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET need to be set in Netlify.</p>');
  // Google only accepts redirect addresses registered on the client: the live dash and localhost:8888.
  const redirectUri = `${url.origin}/api/auth/callback`;

  if (route === 'login') {
    const state = randomToken(), nonce = randomToken(), verifier = randomToken(32);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const pending = await seal(secret, { p: 'oauth', state, nonce, verifier, next: safeNext(url.searchParams.get('next')), exp: now() + 600 } satisfies Pending);
    const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: challenge, code_challenge_method: 'S256', hd: DOMAIN, prompt: 'select_account',
    }).toString();
    return new Response(null, { status: 302, headers: { location: google.toString(), 'set-cookie': cookie(OAUTH_COOKIE, pending, 600, secure), 'cache-control': 'no-store' } });
  }

  if (route === 'callback') {
    const pending = await unseal<Pending>(secret, readCookie(req, OAUTH_COOKIE), 'oauth');
    const clear = cookie(OAUTH_COOKIE, '', 0, secure);
    if (!pending) return page(400, 'Sign-in timed out', `<p>That sign-in link is old or was opened in another browser.</p>${tryAgain()}`, [clear]);
    if (url.searchParams.get('error')) return page(403, 'Sign-in was cancelled', tryAgain(pending.next), [clear]);
    if (!same(url.searchParams.get('state') ?? '', pending.state)) return page(400, 'Sign-in did not match', tryAgain(pending.next), [clear]);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') ?? '', client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: pending.verifier }),
    });
    const idToken = res.ok ? ((await res.json()) as { id_token?: string }).id_token : undefined;
    if (!idToken) return page(502, 'Google sign-in failed', `<p>Google did not confirm the sign-in (${res.status}).</p>${tryAgain(pending.next)}`, [clear]);

    // Google's checklist: signature, issuer, audience, expiry. Then our nonce, and hd (not the email ending) for the domain.
    let claims: Record<string, unknown>;
    try { ({ payload: claims } = await jwtVerify(idToken, GOOGLE_KEYS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId })); }
    catch { return page(401, 'Google sign-in could not be verified', tryAgain(pending.next), [clear]); }
    const email = String(claims.email ?? '').toLowerCase();
    if (claims.nonce !== pending.nonce) return page(401, 'Sign-in did not match', tryAgain(pending.next), [clear]);
    // Function log as a sign-in record: who, and which hosted domain Google reported.
    if (claims.hd !== DOMAIN || claims.email_verified !== true || !email.endsWith(`@${DOMAIN}`)) {
      console.log(`sign-in refused: ${email || 'no email'} (hd ${claims.hd ?? 'none'}, verified ${claims.email_verified})`);
      return page(403, 'inquirED accounts only', `<p>You chose ${esc(email || 'an account')}. The dash only accepts ${DOMAIN} Google accounts.</p>${tryAgain(pending.next)}`, [clear]);
    }

    console.log(`sign-in: ${email} (hd ${claims.hd})`);
    const session = await seal(secret, { p: 'session', email, name: String(claims.name ?? email), exp: now() + SESSION_DAYS * 86400 });
    const headers = new Headers({ location: pending.next, 'cache-control': 'no-store' });
    headers.append('set-cookie', cookie(SESSION_COOKIE, session, SESSION_DAYS * 86400, secure));
    headers.append('set-cookie', clear);
    return new Response(null, { status: 302, headers });
  }

  return page(404, 'Not found', tryAgain());
};

export const config: Config = { path: ['/api/auth/login', '/api/auth/callback', '/api/auth/logout', '/api/auth/me'] };
