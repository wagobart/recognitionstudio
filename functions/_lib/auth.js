import { bytesToHex, sha256Hex, uid, now } from './util.js';

const COOKIE = 'rs_session';
const SESSION_DAYS = 60;
const ITER = 100000; // Workers PBKDF2 maximum

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return bytesToHex(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hashPassword(password) {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  const salt = bytesToHex(s);
  return { salt, hash: await pbkdf2(password, salt) };
}

export async function verifyPassword(password, salt, hash) {
  return timingSafeEqual(await pbkdf2(password, salt), hash);
}

export function signupAllowed(env, email) {
  const mode = (env.SIGNUP_MODE || 'invite').toLowerCase();
  if (mode === 'open') return true;
  const list = String(env.ALLOWED_EMAILS || '')
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function createSession(env, userId, request) {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = bytesToHex(raw);
  const expires = now() + SESSION_DAYS * 864e5;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), userId, expires)
    .run();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

export async function getUser(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  )
    .bind(await sha256Hex(token))
    .first();
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, email: row.email };
}

export async function endSession(env, request) {
  const token = readCookie(request);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export const newUserId = () => uid('u_');
