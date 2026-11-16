/**
 * Sign-in gate in front of every page, data file and function. Without a valid session, pages go to
 * Google sign-in and everything else gets a 401. Only inquired.com Google accounts get a session.
 * A signed-in person who is not on the access list (lib/access.ts) gets a 403: a short page, or JSON for data and functions.
 */
import { sessionFrom } from '../lib/session.ts';
import { mayOpen } from '../lib/access.ts';

// The edge runtime provides these; declared here so the repo needs no extra types package.
declare const Netlify: { env: { get(key: string): string | undefined } };
interface Context { next(): Promise<Response> }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const noAccess = (email: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No access | inquirED Reporting Dash</title>
<style>body{font:16px/1.55 Lato,system-ui,sans-serif;color:#17201f;background:#f6f8f7;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}main{max-width:440px;background:#fff;border:1px solid #e3e8e6;border-radius:14px;padding:24px}h1{font-size:22px;line-height:1.25;margin:0 0 8px}p{margin:0 0 12px}a{color:#1d5f5c;font-weight:700}</style></head>
<body><main><h1>You don't have access to the Reporting Dash</h1><p>You're signed in as ${esc(email)}. The dash is open to a short list of people. Ask Kelsey if you need it.</p><p><a href="https://inquired-gtm-hub.netlify.app/">Back to the GTM Hub</a></p><p><a href="/api/auth/logout">Sign out</a></p></main></body></html>`;

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const who = await sessionFrom(req, Netlify.env.get('SESSION_SECRET'));
  const isData = req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/') || url.pathname.startsWith('/.netlify/');
  if (who && mayOpen(who.email)) return context.next();
  if (who) {
    if (isData) return Response.json({ error: 'No access' }, { status: 403, headers: { 'cache-control': 'no-store' } });
    return new Response(noAccess(who.email), { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (isData) {
    return Response.json({ error: 'Sign in first' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, { status: 302, headers: { location: `/api/auth/login?next=${next}`, 'cache-control': 'no-store' } });
};

export const config = { path: '/*', excludedPath: ['/api/auth/*'] };
