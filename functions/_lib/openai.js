import { b64ToBytes } from './util.js';

export class FriendlyError extends Error {
  constructor(message, status = 502, code = 'ai_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function generateImage(env, prompt) {
  const model = env.IMAGE_MODEL || 'gpt-image-1';
  const body = {
    model,
    prompt,
    size: env.IMAGE_SIZE || '1536x1024',
    quality: env.IMAGE_QUALITY || 'high',
    n: 1,
  };
  if (env.IMAGE_FORMAT) body.output_format = env.IMAGE_FORMAT;

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new FriendlyError('Could not reach the artwork service. Your wording is safe — please try again.', 503, 'network');
  }
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const code = data?.error?.code || '';
    const msg = data?.error?.message || text.slice(0, 300);
    console.log('openai image error', res.status, code, msg);
    if (code === 'moderation_blocked' || /safety|moderation/i.test(msg))
      throw new FriendlyError('The artwork service declined this description. Try rewording it (for example, remove brand names or logos).', 422, 'moderation');
    if (res.status === 429)
      throw new FriendlyError('The artwork service is busy or the account limit was reached. Please try again in a minute.', 429, 'rate');
    if (res.status === 401)
      throw new FriendlyError('Artwork service is not configured correctly (API key). The site owner needs to check it.', 500, 'auth');
    throw new FriendlyError('The artwork could not be created this time. Your wording is safe — please try again.', 502, 'ai_error');
  }
  const item = data?.data?.[0];
  if (!item) throw new FriendlyError('The artwork service returned nothing. Please try again.', 502);
  let bytes;
  let contentType = 'image/' + (env.IMAGE_FORMAT || 'png');
  if (item.b64_json) bytes = b64ToBytes(item.b64_json);
  else if (item.url) {
    const r = await fetch(item.url);
    bytes = new Uint8Array(await r.arrayBuffer());
    contentType = r.headers.get('content-type') || contentType;
  }
  return { bytes, contentType, model, usage: data.usage || null };
}
