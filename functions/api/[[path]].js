// Crafted In Honor API (Cloudflare Pages Functions)
// Bindings: DB (D1), ART (R2). Secret: OPENAI_API_KEY. See README for vars.
import { json, err, uid, now, readJson, clean } from '../_lib/util.js';
import { hashPassword, verifyPassword, createSession, clearCookie, getUser, endSession, newUserId, signupAllowed } from '../_lib/auth.js';
import { LAYOUTS, LETTERING, buildImagePrompt, planWithAI, localPlan } from '../_lib/design.js';
import { generateImage, FriendlyError } from '../_lib/openai.js';
import { mockArtSvg } from '../_lib/mockart.js';
import { GALLERY_SEEDS } from '../_lib/seeds.js';

const isMock = (env) => (env.AI_MODE || '').toLowerCase() === 'mock' || !env.OPENAI_API_KEY;
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

function limits(env) {
  return {
    dailyArt: num(env.DAILY_ART_LIMIT, 30),
    accountArt: num(env.ACCOUNT_ART_LIMIT, 15), // total AI artwork designs per account, ever
    monthlyBudget: num(env.MONTHLY_BUDGET_USD, 25),
    artCost: num(env.EST_COST_PER_IMAGE, 0.25),
    planCost: num(env.EST_COST_PER_PLAN, 0.01),
  };
}

// Accounts in UNLIMITED_EMAILS (the owner) have no per-account total
const unlimited = (env, user) => !!user && String(env.UNLIMITED_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean).includes(String(user.email || '').toLowerCase());

async function usage(env, userId) {
  const dayStart = now() - 864e5;
  const d = new Date();
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const [u, t, m] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) n FROM generations WHERE user_id=? AND kind='art' AND status!='error' AND created_at>?").bind(userId, dayStart).first(),
    env.DB.prepare("SELECT COUNT(*) n FROM generations WHERE user_id=? AND kind='art' AND status!='error'").bind(userId).first(),
    env.DB.prepare("SELECT COALESCE(SUM(est_cost),0) s FROM generations WHERE status!='error' AND created_at>?").bind(monthStart).first(),
  ]);
  return { artToday: u.n, artTotal: t.n, monthSpend: m.s };
}

async function logGen(env, row) {
  await env.DB.prepare('INSERT INTO generations (id,user_id,kind,model,status,est_cost,detail,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(row.id || uid('g_'), row.userId, row.kind, row.model || null, row.status, row.cost || 0, row.detail || null, now())
    .run();
}

// The site owner(s) can add and remove shared examples
const isAdmin = (env, user) => !!user && String(env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean).includes(String(user.email || '').toLowerCase());

// Images a user may view: their own, plus any image belonging to a shared example
async function canView(env, user, key, ownerId) {
  if (user && ownerId === user.id) return true;
  if (await env.DB.prepare('SELECT 1 FROM gallery WHERE art_key=? AND hidden=0').bind(key).first()) return true;
  if (!user) return false;
  return !!(await env.DB.prepare('SELECT 1 FROM example_assets WHERE key=?').bind(key).first());
}

// ---------- public gallery ----------
// Only AI artwork the user made themselves can be shared: not a derived version, not artwork painted
// from their photo (their subject's likeness), not artwork taken from the gallery.
function shareableArt(p, userId) {
  return [...(p.artHistory || [])].reverse().find((a) => a && typeof a.key === 'string' && a.key.startsWith(`art/${userId}/`)
    && !a.derivedFrom && !a.fromPhoto && !a.fromGallery && !a.fromExample) || null;
}
// Shared by default when the design started from a library idea; the user's own choice wins
const isShared = (p) => (typeof p.share === 'boolean' ? p.share : !!p.fromIdea);

async function syncGallery(env, userId, p) {
  const gid = 'g_' + String(p.id).replace(/^p_/, '');
  let art = isShared(p) ? shareableArt(p, userId) : null;
  // the same picture is listed once (e.g. a duplicated project keeps the original's listing)
  if (art && (await env.DB.prepare('SELECT 1 FROM gallery WHERE art_key=? AND id<>?').bind(art.key, gid).first())) art = null;
  if (!art) return env.DB.prepare('DELETE FROM gallery WHERE id=? AND user_id=?').bind(gid, userId).run();
  const output = art.output === 'pyrography' ? 'pyrography' : 'certificate';
  const title = clean(p.galleryTitle || p.fromIdea?.t, 120) || (output === 'pyrography' ? 'Wood-burning artwork' : 'Certificate artwork');
  const t = now();
  // hidden stays as the owner set it; a different artwork is a new thing to review, so it shows again
  return env.DB.prepare(
    `INSERT INTO gallery (id,project_id,user_id,art_key,output,layout,zone,title,idea,hidden,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)
     ON CONFLICT(id) DO UPDATE SET art_key=excluded.art_key, output=excluded.output, layout=excluded.layout, zone=excluded.zone, title=excluded.title, idea=excluded.idea,
       hidden=CASE WHEN gallery.art_key=excluded.art_key THEN gallery.hidden ELSE 0 END,
       updated_at=CASE WHEN gallery.art_key=excluded.art_key THEN gallery.updated_at ELSE excluded.updated_at END`
  ).bind(gid, p.id, userId, art.key, output, art.layout || 'framed', art.zone ? JSON.stringify(art.zone) : null, title, clean(p.fromIdea?.p, 1500) || null, t, t).run();
}

// Every R2 image a project refers to (current art, versions, derived-from links, photo)
const ASSET_RE = /(?:art\/u_[a-z0-9]+\/a_[a-z0-9]+|photo\/u_[a-z0-9]+\/ph_[a-z0-9]+)/g;
const assetKeys = (raw) => [...new Set(String(raw).match(ASSET_RE) || [])];

// Same summary the projects list uses: enough to draw a thumbnail and pick its sections
function listItem(r) {
  let d = {};
  try { d = JSON.parse(r.data); } catch {}
  const preview = { output: d.output, art: d.art ? { url: d.art.url, layout: d.art.layout, zone: d.art.zone } : null, plan: { layout: d?.plan?.layout }, text: d.text || {}, style: d.style || {}, photo: d.photo || null, plainBg: !!d.plainBg };
  // latest artwork of each kind, so a design with both a certificate and a wood-burning
  // version is listed in both sections
  const versions = {};
  for (const a of [...(d.artHistory || []), d.art].filter(Boolean)) {
    const o = a.output === 'pyrography' ? 'pyrography' : 'certificate';
    versions[o] = { url: a.url, layout: a.layout, zone: a.zone, key: a.key };
  }
  if (d.art) versions[d.art.output === 'pyrography' ? 'pyrography' : 'certificate'] = { url: d.art.url, layout: d.art.layout, zone: d.art.zone, key: d.art.key };
  return { id: r.id, title: r.title, output: r.output, artUrl: r.art_key ? `/api/${r.art_key}` : null, name: d?.text?.name || '', updatedAt: r.updated_at, preview, versions };
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
  if (user) out.usage = { ...(await usage(env, user.id)), dailyArtLimit: L.dailyArt, accountArtLimit: unlimited(env, user) ? null : L.accountArt };
  if (user && isAdmin(env, user)) out.admin = true;
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
  // a photo on its own is enough to start: the planner looks at it instead of a description
  const photoKey = typeof body.photoKey === 'string' && body.photoKey.startsWith(`photo/${user.id}/`) ? body.photoKey : '';
  if (idea.length < 3 && !photoKey) return err('Tell us a little about who this is for and the occasion, or add a photo.');
  const local = () => localPlan({ idea, output, photo: !!photoKey });
  if (isMock(env)) return json({ plan: local(), source: 'test' });
  const L = limits(env);
  const u = await usage(env, user.id);
  if (u.monthSpend + L.planCost > L.monthlyBudget) return json({ plan: local(), source: 'local', note: 'budget' });
  try {
    let photo = null;
    if (photoKey) {
      const obj = await env.ART.get(photoKey);
      if (obj) photo = { bytes: new Uint8Array(await obj.arrayBuffer()), contentType: obj.httpMetadata?.contentType || 'image/jpeg' };
    }
    const { plan, model } = await planWithAI(env, { idea, output, photo });
    await logGen(env, { userId: user.id, kind: 'plan', model, status: 'ok', cost: L.planCost });
    return json({ plan, source: 'ai' });
  } catch (e) {
    console.log('planner failed, using local plan', e.message);
    await logGen(env, { userId: user.id, kind: 'plan', status: 'error', detail: String(e.message).slice(0, 300) });
    return json({ plan: local(), source: 'local' });
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
  if (!unlimited(env, user) && u.artTotal >= L.accountArt)
    return err(`You’ve used all ${L.accountArt} AI artwork designs included with your account. Everything you’ve made is saved — you can still edit wording and lettering, add photos, make the wood-burning or certificate version, start from Examples, use “No artwork”, and export.`, 429, { code: 'account_limit' });
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
  // photos are never in the gallery: only the owner, or signed-in users for shared Examples
  if (!(await canView(env, user, `photo/${m[1]}/${m[2]}`, m[1]))) return err('Not found', 404);
  const obj = await env.ART.get(`photo/${m[1]}/${m[2]}`);
  if (!obj) return err('Not found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  });
});

route('GET', '/api/art/(u_[a-z0-9]+)/(a_[a-z0-9]+)', async ({ env, user, m }) => {
  if (!(await canView(env, user, `art/${m[1]}/${m[2]}`, m[1]))) return err('Not found', 404);
  const obj = await env.ART.get(`art/${m[1]}/${m[2]}`);
  if (!obj) return err('Not found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'private, max-age=31536000, immutable' },
  });
}, { public: true }); // gallery artwork can be seen before signing in; everything else checks the owner

// ---------- projects ----------
route('GET', '/api/projects', async ({ env, user }) => {
  const { results } = await env.DB.prepare('SELECT id,title,output,art_key,data,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 200')
    .bind(user.id)
    .all();
  return json({ projects: results.map(listItem) });
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
  try { await syncGallery(env, user.id, { ...p, id: m[1] }); } catch (e) { console.log('gallery sync failed', e.message); }
  return json({ ok: true, savedAt: t });
});

route('DELETE', '/api/projects/(p_[a-z0-9]+)', async ({ env, user, m }) => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM projects WHERE id=? AND user_id=?').bind(m[1], user.id),
    env.DB.prepare('DELETE FROM gallery WHERE project_id=? AND user_id=?').bind(m[1], user.id),
  ]);
  return json({ ok: true });
});

// ---------- shared examples ----------
route('GET', '/api/examples', async ({ env, user }) => {
  const { results } = await env.DB.prepare('SELECT id,title,output,data,created_at AS updated_at, NULL AS art_key FROM examples ORDER BY title COLLATE NOCASE').all();
  return json({ examples: results.map(listItem), admin: isAdmin(env, user) });
});

// Opening an example gives the user their own copy: the project plus its images, copied into
// their account so every later step (versions, photo, export) works exactly like their own work.
route('POST', '/api/examples/(ex_[a-z0-9]+)/copy', async ({ env, user, m }) => {
  const ex = await env.DB.prepare('SELECT data FROM examples WHERE id=?').bind(m[1]).first();
  if (!ex) return err('That example is no longer available.', 404);
  let raw = ex.data;
  for (const key of assetKeys(raw)) {
    const obj = await env.ART.get(key);
    if (!obj) continue;
    const isPhoto = key.startsWith('photo/');
    const nk = isPhoto ? `photo/${user.id}/${uid('ph_')}` : `art/${user.id}/${uid('a_')}`;
    await env.ART.put(nk, await obj.arrayBuffer(), { httpMetadata: { contentType: obj.httpMetadata?.contentType || (isPhoto ? 'image/jpeg' : 'image/png') } });
    raw = raw.split(key).join(nk);
  }
  const p = JSON.parse(raw);
  const t = now();
  Object.assign(p, { id: uid('p_'), createdAt: t, updatedAt: t, fromExample: m[1] });
  // the example's artwork is already the owner's to share; a copy never re-lists it
  for (const a of [...(p.artHistory || []), p.art]) if (a) a.fromExample = true;
  delete p.share; delete p.fromIdea;
  const out = JSON.stringify(p);
  const artKey = typeof p?.art?.key === 'string' && p.art.key.startsWith(`art/${user.id}/`) ? p.art.key : null;
  await env.DB.prepare('INSERT INTO projects (id,user_id,title,output,data,art_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(p.id, user.id, clean(p.title, 120) || 'Untitled recognition', p.output === 'pyrography' ? 'pyrography' : 'certificate', out, artKey, t, t)
    .run();
  return json({ project: p });
});

// Owner only: share one of their projects as an example (a snapshot; later edits don't change it)
route('POST', '/api/examples', async ({ env, request, user }) => {
  if (!isAdmin(env, user)) return err('Not found', 404);
  const { projectId } = await readJson(request);
  const r = await env.DB.prepare('SELECT title,output,data FROM projects WHERE id=? AND user_id=?').bind(String(projectId || ''), user.id).first();
  if (!r) return err('Project not found', 404);
  const id = uid('ex_');
  const stmts = [env.DB.prepare('INSERT INTO examples (id,title,output,data,source_project,created_at) VALUES (?,?,?,?,?,?)').bind(id, r.title, r.output, r.data, projectId, now())];
  for (const key of assetKeys(r.data)) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO example_assets (key,example_id) VALUES (?,?)').bind(key, id));
  await env.DB.batch(stmts);
  return json({ ok: true, id });
});

route('DELETE', '/api/examples/(ex_[a-z0-9]+)', async ({ env, user, m }) => {
  if (!isAdmin(env, user)) return err('Not found', 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM examples WHERE id=?').bind(m[1]),
    env.DB.prepare('DELETE FROM example_assets WHERE example_id=?').bind(m[1]),
  ]);
  return json({ ok: true });
});

// ---------- public gallery ----------
const GALLERY_PAGE = 24;

// Owner-provided artwork shipped with the site (see _lib/seeds.js): copied into R2 and listed once
let seedsDone = false;
async function importSeeds(env, request) {
  if (seedsDone || !GALLERY_SEEDS.length || !env.ASSETS) return;
  const ids = GALLERY_SEEDS.map((x) => x.id);
  const { results } = await env.DB.prepare(`SELECT id FROM gallery WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const have = new Set(results.map((r) => r.id));
  const missing = GALLERY_SEEDS.filter((x) => !have.has(x.id));
  if (!missing.length) { seedsDone = true; return; }
  const ownerEmail = String(env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean)[0];
  const owner = ownerEmail && (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(ownerEmail).first());
  if (!owner) return;
  for (const x of missing) {
    const res = await env.ASSETS.fetch(new URL('/gallery-seed/' + x.file, request.url));
    if (!res.ok) continue;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const key = `art/${owner.id}/a_${x.id.slice(2)}`;
    await env.ART.put(key, await res.arrayBuffer(), { httpMetadata: { contentType } });
    const t = now();
    await env.DB.prepare('INSERT OR IGNORE INTO gallery (id,project_id,user_id,art_key,output,layout,zone,title,idea,hidden,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)')
      .bind(x.id, 'seed', owner.id, key, x.output, x.layout, JSON.stringify(x.zone), x.title, x.idea, t, t).run();
  }
  seedsDone = true;
}
route('GET', '/api/gallery', async ({ env, user, url, request }) => {
  try { await importSeeds(env, request); } catch (e) { console.log('gallery seed import failed', e.message); }
  const output = url.searchParams.get('output');
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const where = output === 'pyrography' || output === 'certificate' ? 'hidden=0 AND output=?' : 'hidden=0';
  const q = env.DB.prepare(`SELECT id,art_key,output,layout,zone,title FROM gallery WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`);
  const { results } = await (where.includes('?') ? q.bind(output, GALLERY_PAGE + 1, offset) : q.bind(GALLERY_PAGE + 1, offset)).all();
  const items = results.slice(0, GALLERY_PAGE).map((r) => ({ id: r.id, url: `/api/${r.art_key}`, output: r.output, layout: r.layout, title: r.title }));
  return json({ items, more: results.length > GALLERY_PAGE, admin: isAdmin(env, user) });
}, { public: true });

// Using gallery artwork: copied into the user's own account (free — not an AI design)
route('POST', '/api/gallery/(g_[a-z0-9]+)/use', async ({ env, user, m }) => {
  const g = await env.DB.prepare('SELECT * FROM gallery WHERE id=? AND hidden=0').bind(m[1]).first();
  if (!g) return err('That artwork is no longer in the gallery.', 404);
  const obj = await env.ART.get(g.art_key);
  if (!obj) return err('That artwork is no longer available.', 404);
  const contentType = obj.httpMetadata?.contentType || 'image/png';
  const key = `art/${user.id}/${uid('a_')}`;
  await env.ART.put(key, await obj.arrayBuffer(), { httpMetadata: { contentType } });
  let zone = null;
  try { zone = g.zone ? JSON.parse(g.zone) : null; } catch {}
  return json({
    art: { key, url: `/api/${key}`, contentType, width: 1536, height: 1024, layout: g.layout || 'framed', output: g.output, fromGallery: g.id, ...(zone ? { zone } : {}) },
    title: g.title, idea: g.idea || '',
  });
});

route('DELETE', '/api/gallery/(g_[a-z0-9]+)', async ({ env, user, m }) => {
  if (!isAdmin(env, user)) return err('Not found', 404);
  await env.DB.prepare('UPDATE gallery SET hidden=1 WHERE id=?').bind(m[1]).run();
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
