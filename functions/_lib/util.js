export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const err = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);

export const now = () => Date.now();

export function uid(prefix = '') {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return prefix + [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 18);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export const clean = (s, max = 2000) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
