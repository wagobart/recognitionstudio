// Recognition Studio API (Cloudflare Pages Functions)
// Bindings: DB (D1), ART (R2). Secret: OPENAI_API_KEY. See README for vars.
import { json, err, uid, now, readJson, clean } from '../_lib/util.js';
import { hashPassword, verifyPassword, createSession, clearCookie, getUser, endSession, newUserId, signupAllowed } from '../_lib/auth.js';
import { LAYOUTS, LETTERING, buildImagePrompt, planWithAI, localPlan } from '../_lib/design.js';
import { generateImage, FriendlyError } from '../_lib/openai.js';
import { mockArtSvg } from '../_lib/mockart.js';

const isMock = (env) => (env.AI_MODE || '').toLowerCase() === 'mock' || !env.OPENAI_API_KEY;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

function limits(env) {
  return {
    dailyArt: num(env.DAILY_ART_LIMIT, 30),
    monthlyBudget: num(env.MONTHLY_BUDGET_USD, 25),
    artCost: num(env.EST_COST_PER_IMAGE, 0.25),
    planCost: num(env.EST_COST_PER_PLAN, 0.01),
  };
}

async function usage(env, userId) {
  const dayStart = now() - 864e5;
  const d = new Date();
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const [u, m] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM generations WHERE user_id=? AND kind='art' AND status!='error' AND created_at>?").bind(userId, dayStart).first(),
    env.DB.prepare("SELECT COALESCE(SUM(est_cost),0) s FROM generations WHERE status!='error' AND created_at>?").bind(monthStart).first(),
  ]);
  return { artToday: u.n, monthSpend: m.s };
}

async function logGen(env, row) {
  await env.DB.prepare('INSERT INTO generations (id,user_id,kind,model,status,est_cost,detail,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(row.id || uid('g_'), row.userId, row.kind, row.model || null, row.status, row.cost || 0, row.detail || null, now())
    .run();
}

const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern + '$'), handler, ...opts });

// ---------- config & auth ----------
route('GET', '/api/config', async ({ env, user }) => {
  const L = limits(env);
  const out = {
    mode: isMock(env) ? 'test' : 'live',
    signup: (env.SIGNUP_MODE || 'invite').toLowerCase(),
    user,
    layouts: Object.fromEntries(Object.entries(LAYOUTS).map(([k, v]) => [k, v.label])),
    lettering: LETTERING,
  };
  if (user) out.usage = { ...(await usage(env, user.id)), dailyArtLimit: L.dailyArt };
  return json(out);
}, { public: true });

route('POST', '/api/auth/signup', async ({ env, request }) => {
  const { email: e, password } = await readJson(request);
  const email = clean(e, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Please enter a valid email address.');
  if (String(password || '').length < 8) return err('Please choose a password of at least 8 characters.');
  if (!signupAllowed(env, email)) return err('Sign-ups are invite-only right now. Ask the site owner to add your email.', 403);
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (exists) return err('An account with that email already exists. Try signing in.', 409);
  const { salt, hash } = await hashPassword(password);
  const id = newUserId();
  await env.DB.prepare('INSERT INTO users (id,email,pass_hash,salt,created_at) VALUES (?,?,?,?,?)').bind(id, email, hash, salt, now()).run();
  const cookie = await createSession(env, id, request);
  return json({ user: { id, email } }, 200, { 'set-cookie': cookie });
}, { public: true });

route('POST', '/api/auth/login', async ({ env, request }) => {
  const { email: e, password } = await readJson(request);
  const email = clean(e, 200).toLowerCase();
  const row = await env.DB.prepare('SELECT id,email,pass_hash,salt FROM users WHERE email=?').bind(email).first();
  if (!row || !(await verifyPassword(String(password || ''), row.salt, row.pass_hash)))
    return err('That email and password don’t match.', 401);
  const cookie = await createSession(env, row.id, request);
  return json({ user: { id: row.id, email: row.email } }, 200, { 'set-cookie': cookie });
}, { public: true });

route('POST', '/api/auth/logout', async ({ env, request }) => {
  await endSession(env, request);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}, { public: true });

// ---------- AI design ----------
route('POST', '/api/plan', async ({ env, request, user }) => {
  const body = await readJson(request);
  const idea = clean(body.idea, 1500);
  const output = body.output === 'pyrography' ? 'pyrography' : 'certificate';
  if (idea.length < 3) return err('Tell us a little about who this is for and the occasion.');
  if (isMock(env)) return json({ plan: localPlan({ idea, output }), source: 'test' });
  const L = limits(env);
  const u = await usage(env, user.id);
  if (u.monthSpend + L.planCost > L.monthlyBudget) return json({ plan: localPlan({ idea, output }), source: 'local', note: 'budget' });
  try {
    const { plan, model } = await planWithAI(env, { idea, output });
    await logGen(env, { userId: user.id, kind: 'plan', model, status: 'ok', cost: L.planCost });
    return json({ plan, source: 'ai' });
  } catch (e) {
    console.log('planner failed, using local plan', e.message);
    await logGen(env, { userId: user.id, kind: 'plan', status: 'error', detail: String(e.message).slice(0, 300) });
    return json({ plan: localPlan({ idea, output }), source: 'local' });
  }
});

route('POST', '/api/art', async ({ env, request, user }) => {
  const body = await readJson(request);
  const output = body.output === 'pyrography' ? 'pyrography' : 'certificate';
  const layout = LAYOUTS[body.layout] ? body.layout : 'framed';
  let artPrompt = clean(body.artPrompt, 1500) || clean(body.idea, 1500);
  const tweak = clean(body.tweak, 400);
  if (!artPrompt) return err('Missing design description.');
  if (tweak) artPrompt += `. Requested change: ${tweak}`;
  // "Paint it into the artwork": the user's own uploaded photo is the reference
  let ref = null;
  const photoKey = typeof body.photoKey === 'string' ? body.photoKey : '';
  if (photoKey) {
    if (!photoKey.startsWith(`photo/${user.id}/`)) return err('Photo not found.', 404);
    const obj = await env.ART.get(photoKey);
    if (!obj) return err('That photo could not be found. Please add it again.', 404);
    ref = { bytes: new Uint8Array(await obj.arrayBuffer()), contentType: obj.httpMetadata?.contentType || 'image/jpeg' };
  }
  const prompt = buildImagePrompt({ artPrompt, layout, output, photo: ref ? { subject: clean(body.photoSubject, 60) } : null });
  const id = uid('a_');
  const key = `art/${user.id}/${id}`;
  const L = limits(env);

  if (isMock(env)) {
    if (/SIMULATE_FAILURE/.test(tweak)) return err('The artwork could not be created this time. Your wording is safe — please try again.', 502, { code: 'ai_error' });
    const svg = mockArtSvg({ idea: artPrompt + (body.seed || ''), layout, output, photo: !!ref });
    await env.ART.put(key, svg, { httpMetadata: { contentType: 'image/svg+xml' } });
    await logGen(env, { id, userId: user.id, kind: 'art', model: 'test', status: 'ok', cost: 0, detail: JSON.stringify({ layout, output, contentType: 'image/svg+xml', test: true }) });
    return json({ art: { key, url: `/api/${key}`, contentType: 'image/svg+xml', width: 1536, height: 1024, layout, output, test: true, prompt, ...(ref ? { fromPhoto: photoKey } : {}) } });
  }

  const u = await usage(env, user.id);
  if (u.artToday >= L.dailyArt)
    return err(`You’ve reached today’s limit of ${L.dailyArt} artwork designs. Your project and wording are saved — you can keep editing lettering and export.`, 429, { code: 'daily_limit' });
  if (u.monthSpend + L.artCost > L.monthlyBudget)
    return err('This month’s artwork budget has been reached. You can still edit wording and export existing designs.', 429, { code: 'budget' });

  try {
    const img = await generateImage(env, prompt, ref);
    await env.ART.put(key, img.bytes, { httpMetadata: { contentType: img.contentType } });
    await logGen(env, { id, userId: user.id, kind: 'art', model: img.model, status: 'ok', cost: L.artCost, detail: JSON.stringify({ layout, output, contentType: img.contentType, usage: img.usage }).slice(0, 600) });
    const [w, h] = (env.IMAGE_SIZE || '1536x1024').split('x').map(Number);
    return json({ art: { key, url: `/api/${key}`, contentType: img.contentType, width: w, height: h, layout, output, prompt, ...(ref ? { fromPhoto: photoKey } : {}) } });
  } catch (e) {
    const fe = e instanceof FriendlyError ? e : new FriendlyError('The artwork could not be created this time. Your wording is safe — please try again.');
    await logGen(env, { userId: user.id, kind: 'art', model: env.IMAGE_MODEL, status: 'error', detail: String(e.message).slice(0, 300) });
    return err(fe.message, fe.status, { code: fe.code });
  }
});

// Recover artwork whose response never reached the browser (dropped connection, app switched, etc.)
route('GET', '/api/art-latest', async ({ env, user, url }) => {
  const since = Number(url.searchParams.get('since')) || 0;
  const r = await env.DB.prepare("SELECT id, detail FROM generations WHERE user_id=? AND kind='art' AND status='ok' AND created_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(user.id, since).first();
  if (!r) return json({ art: null });
  let d = {};
  try { d = JSON.parse(r.detail || '{}'); } catch {}
  const key = `art/${user.id}/${r.id}`;
  return json({ art: { key, url: `/api/${key}`, contentType: d.contentType || 'image/png', width: 1536, height: 1024, layout: d.layout || 'framed', output: d.output || 'certificate', test: !!d.test, recovered: true } });
});

// The other version of an existing artwork, made in the browser from the identical image (no AI,
// no cost): wood-burning ↔ certificate. Stored like any artwork.
route('POST', '/api/art/derived', async ({ env, request, user, url }) => {
  const from = url.searchParams.get('from') || '';
  if (!from.startsWith(`art/${user.id}/`)) return err('Artwork not found.', 404);
  const output = url.searchParams.get('output') === 'pyrography' ? 'pyrography' : 'certificate';
  const layout = LAYOUTS[url.searchParams.get('layout')] ? url.searchParams.get('layout') : 'framed';
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'image/jpeg' && type !== 'image/png') return err('Unsupported image.', 415);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 15 * 1048576) return err('That image is too large.', 413);
  const id = uid('a_');
  const key = `art/${user.id}/${id}`;
  await env.ART.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ art: { key, url: `/api/${key}`, contentType: type, width: 1536, height: 1024, layout, output, derivedFrom: from } });
});

// ---------- photos the user adds to a design (private, owner only) ----------
const PHOTO_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };
route('POST', '/api/photos', async ({ env, request, user }) => {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!PHOTO_TYPES[type]) return err('Please use a JPEG or PNG photo.', 415);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return err('That photo was empty.');
  if (bytes.length > 12 * 1048576) return err('That photo is too large (12 MB max).', 413);
  const id = uid('ph_');
  const key = `photo/${user.id}/${id}`;
  await env.ART.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ key, url: `/api/${key}` });
});

route('GET', '/api/photo/(u_[a-z0-9]+)/(ph_[a-z0-9]+)', async ({ env, user, m }) => {
  if (m[1] !== user.id) return err('Not found', 404);
  const obj = await env.ART.get(`photo/${m[1]}/${m[2]}`);
  if (!obj) return err('Not found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

route('GET', '/api/art/(u_[a-z0-9]+)/(a_[a-z0-9]+)', async ({ env, user, m }) => {
  if (m[1] !== user.id) return err('Not found', 404);
  const obj = await env.ART.get(`art/${m[1]}/${m[2]}`);
  if (!obj) return err('Not found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

// ---------- projects ----------
route('GET', '/api/projects', async ({ env, user }) => {
  const { results } = await env.DB.prepare('SELECT id,title,output,art_key,data,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 200')
    .bind(user.id)
    .all();
  return json({
    projects: results.map((r) => {
      let d = {};
      try { d = JSON.parse(r.data); } catch {}
      // enough to draw a true thumbnail (artwork + lettering) without opening the project
      const preview = { output: d.output, art: d.art ? { url: d.art.url, layout: d.art.layout, zone: d.art.zone } : null, plan: { layout: d?.plan?.layout }, text: d.text || {}, style: d.style || {}, photo: d.photo || null };
      // latest artwork of each kind, so a project with both a certificate and a wood-burning
      // version can be listed in both sections of My projects
      const versions = {};
      for (const a of [...(d.artHistory || []), d.art].filter(Boolean)) {
        const o = a.output === 'pyrography' ? 'pyrography' : 'certificate';
        versions[o] = { url: a.url, layout: a.layout, zone: a.zone, key: a.key };
      }
      if (d.art) versions[d.art.output === 'pyrography' ? 'pyrography' : 'certificate'] = { url: d.art.url, layout: d.art.layout, zone: d.art.zone, key: d.art.key };
      return { id: r.id, title: r.title, output: r.output, artUrl: r.art_key ? `/api/${r.art_key}` : null, name: d?.text?.name || '', updatedAt: r.updated_at, preview, versions };
    }),
  });
});

route('GET', '/api/projects/(p_[a-z0-9]+)', async ({ env, user, m }) => {
  const r = await env.DB.prepare('SELECT data FROM projects WHERE id=? AND user_id=?').bind(m[1], user.id).first();
  if (!r) return err('Project not found', 404);
  return json({ project: JSON.parse(r.data) });
});

route('PUT', '/api/projects/(p_[a-z0-9]+)', async ({ env, user, m, request }) => {
  const p = await readJson(request);
  if (!p || typeof p !== 'object') return err('Bad project');
  const raw = JSON.stringify(p);
  if (raw.length > 200000) return err('Project is too large to save.', 413);
  const title = clean(p.title, 120) || 'Untitled recognition';
  const output = p.output === 'pyrography' ? 'pyrography' : 'certificate';
  const artKey = typeof p?.art?.key === 'string' && p.art.key.startsWith(`art/${user.id}/`) ? p.art.key : null;
  const existing = await env.DB.prepare('SELECT user_id, created_at FROM projects WHERE id=?').bind(m[1]).first();
  if (existing && existing.user_id !== user.id) return err('Project not found', 404);
  const t = now();
  await env.DB.prepare(
    `INSERT INTO projects (id,user_id,title,output,data,art_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, output=excluded.output, data=excluded.data, art_key=excluded.art_key, updated_at=excluded.updated_at`
  )
    .bind(m[1], user.id, title, output, raw, artKey, existing?.created_at || t, t)
    .run();
  return json({ ok: true, savedAt: t });
});

route('DELETE', '/api/projects/(p_[a-z0-9]+)', async ({ env, user, m }) => {
  await env.DB.prepare('DELETE FROM projects WHERE id=? AND user_id=?').bind(m[1], user.id).run();
  return json({ ok: true });
});

// ---------- dispatcher ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  for (const r of routes) {
    if (r.method !== request.method) continue;
    const m = url.pathname.match(r.re);
    if (!m) continue;
    try {
      const user = await getUser(env, request);
      if (!r.public && !user) return err('Please sign in to continue.', 401, { code: 'auth' });
      return await r.handler({ env, request, user, m, url });
    } catch (e) {
      console.log('api error', url.pathname, e.stack || e.message);
      return err('Something went wrong on our side. Your work in this browser is safe — please try again.', 500);
    }
  }
  return err('Not found', 404);
}
