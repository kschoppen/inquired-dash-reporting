/**
 * Hub sign-in session. A cookie holds the verified Google email, signed with SESSION_SECRET (HMAC-SHA256).
 * Web Crypto only, so the edge gate and the functions share this file.
 */
export const SESSION_COOKIE = 'hub_session';
export const SESSION_DAYS = 14;
export interface Session { p: 'session'; email: string; name: string; exp: number }

const enc = new TextEncoder();
export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const randomToken = (bytes = 24) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

/** Constant-time compare, so a wrong signature or token can't be guessed byte by byte. */
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signs a value for a cookie. `p` names its purpose so a sign-in cookie can't stand in for a session. */
export async function seal<T extends { p: string; exp: number }>(secret: string, value: T) {
  const body = b64url(enc.encode(JSON.stringify(value)));
  return `${body}.${await hmac(secret, body)}`;
}

/** Returns the value if the signature matches, the purpose is right and it has not expired. */
export async function unseal<T extends { p: string; exp: number }>(secret: string, token: string | null, purpose: T['p']): Promise<T | null> {
  if (!secret || !token) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !same(sig, await hmac(secret, body))) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return v?.p === purpose && typeof v.exp === 'number' && v.exp * 1000 > Date.now() ? (v as T) : null;
  } catch { return null; }
}

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const sessionFrom = (req: Request, secret: string | undefined) => unseal<Session>(secret ?? '', readCookie(req, SESSION_COOKIE), 'session');

/** Claude's routine sends `Authorization: Bearer <HUB_SERVICE_TOKEN>`. Short or missing tokens never match. */
export function isService(req: Request, token: string | undefined) {
  const sent = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return !!token && token.length >= 32 && same(sent, token);
}
