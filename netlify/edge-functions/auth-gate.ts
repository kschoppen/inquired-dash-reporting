/**
 * Sign-in gate in front of every page, data file and function. Without a valid session, pages go to
 * Google sign-in and everything else gets a 401. Only inquired.com Google accounts get a session.
 */
import { sessionFrom } from '../lib/session.ts';

// The edge runtime provides these; declared here so the repo needs no extra types package.
declare const Netlify: { env: { get(key: string): string | undefined } };
interface Context { next(): Promise<Response> }

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  if (await sessionFrom(req, Netlify.env.get('SESSION_SECRET'))) return context.next();
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/') || url.pathname.startsWith('/.netlify/')) {
    return Response.json({ error: 'Sign in first' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, { status: 302, headers: { location: `/api/auth/login?next=${next}`, 'cache-control': 'no-store' } });
};

export const config = { path: '/*', excludedPath: ['/api/auth/*'] };
