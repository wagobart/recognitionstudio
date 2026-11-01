import { STYLES, loadStyle, loadFont, cssFamily } from './fonts.js?v=14';
import { LAYOUT_LABELS } from './layout.js?v=14';
import { svgMarkup, renderPdf, renderPng, fileBase } from './render.js?v=14';
import { CHIPS, loadLibrary, searchLibrary } from './library.js?v=14';
import { detectZone } from './zone.js?v=14';
import { PHOTO_DEFAULTS, SHAPES, PLACES, photoUrl, photoLayerOn, photoPainted, prepareUpload, deriveArtCanvas } from './photo.js?v=14';
import { zoneFor, plainOn, orientOf } from './layout.js?v=14';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const TEXT_FIELDS = ['name', 'title', 'body', 'date', 'kicker', 'presented', 'details', 'sig1Name', 'sig1Role', 'sig2Name', 'sig2Role'];
const COLORS = [
  ['#1c2230', 'Ink black'], ['#1f3a5f', 'Navy'], ['#6b1f2a', 'Oxblood'], ['#24503a', 'Forest'],
  ['#8a6a22', 'Antique gold'], ['#5b3a22', 'Walnut'], ['#ffffff', 'White'],
];
const BURN = '#1f1610';
const LAST_KEY = 'rs.lastProject';
const DRAFT_KEY = 'rs.draft';
const PENDING_KEY = 'rs.pendingArt';

const state = {
  config: null,
  user: null,
  project: null,
  busyArt: false,
  pendingLayout: null,
  save: { timer: null, inflight: false, dirty: false, lastSaved: 0, error: null },
  lib: { chip: 0, shown: 40 },
  exp: { paper: 'letter', mirror: false, pdf: null, building: null },
  afterAuth: null,
};

// ---------------- helpers ----------------
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('No connection. Check your internet and try again.');
    e.network = true;
    throw e;
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(data.error || `Request failed (${res.status})`);
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}

let toastTimer;
function toast(msg, { error = false, ms = 3200 } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

const newId = () => 'p_' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
const timeAgo = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const isPhoneLike = () => matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1100px)').matches;

// ---------------- sheets ----------------
let openSheetEl = null;
function openSheet(id) {
  closeSheet();
  openSheetEl = $('#' + id);
  openSheetEl.hidden = false;
  $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  if (!openSheetEl) return;
  openSheetEl.hidden = true;
  openSheetEl = null;
  $('#scrim').hidden = true;
  document.body.style.overflow = '';
}
$('#scrim').addEventListener('click', closeSheet);
$$('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#viewer').hidden) closeViewer();
    else closeSheet();
  }
});

// ---------------- project model ----------------
function blankProject(idea, output, orient = 'landscape') {
  return {
    id: newId(),
    v: 1,
    title: 'New recognition',
    output,
    orient,
    idea,
    createdAt: Date.now(),
    plan: { layout: 'framed', artPrompt: '', designNotes: '', source: '' },
    art: null,
    artHistory: [],
    text: Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])),
    style: { lettering: 'classic', headColor: COLORS[0][0], textColor: COLORS[0][0], scale: 1, offsetX: 0, offsetY: 0, widthScale: 1, outline: false },
  };
}

function serializable(p) {
  const { _placeholders, _showZone, _photoHref, _toldShared, ...rest } = p;
  return rest;
}

// ---------------- view ----------------
function setView(v) {
  $('#studio').dataset.view = v;
  $('#startPanel').hidden = v !== 'start';
  $('#editPanel').hidden = v !== 'editor';
  $('#actionbar').hidden = v !== 'editor';
  $('#stageHint').hidden = v !== 'editor';
  $('#navHomeBtn').setAttribute('aria-current', v === 'start' ? 'page' : 'false');
  document.documentElement.classList.toggle('in-editor', v === 'editor');
  window.scrollTo(0, 0);
}

// ---------------- preview ----------------
let renderQueued = false;
let renderGen = 0;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    const gen = ++renderGen;
    const p = state.project;
    if (!p) return;
    await loadStyle(p.style.lettering);
    p._photoHref = null;
    if (photoLayerOn(p)) {
      try { p._photoHref = await photoUrl(photoSrc(p.photo), 760); } catch (e) { console.warn(e); }
    }
    if (gen !== renderGen || state.project !== p) return; // a newer render has started
    p._placeholders = true;
    $('#stage').classList.toggle('portrait', orientOf(p) === 'portrait');
    $('#sheetHolder').innerHTML = svgMarkup(p);
    const hot = document.activeElement?.dataset?.field;
    if (hot) $$(`#sheetHolder text[data-field="${hot}"]`).forEach((t) => t.classList.add('hot'));
  });
}

$('#sheetHolder').addEventListener('click', (e) => {
  if (e.target.closest('[data-field="photo"]')) {
    $('#secPhoto').open = true;
    $('#secPhoto').scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const t = e.target.closest('text[data-field]');
  if (t) focusField(t.dataset.field);
  else if (state.project) { $('#secWording').open = true; }
});

function focusField(field) {
  $('#secWording').open = true;
  if (['kicker', 'presented', 'details'].includes(field)) $('#subLines').open = true;
  if (field.startsWith('sig')) $('#subSigs').open = true;
  const input = $('#f-' + field);
  if (!input) return;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (input.select && input.value) input.select();
}

// ---------------- form binding ----------------
function fillForm() {
  const p = state.project;
  for (const f of TEXT_FIELDS) $('#f-' + f).value = p.text[f] || '';
  $('#artPromptInput').value = p.plan.artPrompt || '';
  $('#designNotes').textContent = p.plan.designNotes || '';
  $('#scaleRange').value = p.style.scale;
  $('#offYRange').value = p.style.offsetY || 0;
  $('#offXRange').value = p.style.offsetX || 0;
  $('#widthRange').value = p.style.widthScale || 1;
  syncWash();
  $('#outlineToggle').checked = !!p.style.outline;
  $('#subLines').open = !!(p.text.details);
  autosizeAll();
  syncPhoto();
  syncLettering();
  syncArtSection();
  updateSummaries();
}

function updateSummaries() {
  const p = state.project;
  $('#wordingSummary').textContent = [p.text.name || 'Add the recipient’s name', p.text.title].filter(Boolean).join(' · ');
  const st = STYLES[p.style.lettering];
  $('#letteringSummary').textContent = `${st.label} lettering · ${Math.round(p.style.scale * 100)}%`;
  $('#artSummary').textContent = plainOn(p)
    ? `No artwork · ${p.output === 'pyrography' ? 'wood-burning pattern' : 'certificate'}`
    : p.art ? `${LAYOUT_LABELS[p.art.layout] || 'Custom'}${orientOf(p) === 'portrait' ? ' · tall page' : ''} · ${p.output === 'pyrography' ? 'wood-burning pattern' : 'color certificate'}` : 'Being created…';
}

function autosize(el) {
  if (el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight + 3, 260) + 'px';
}
const autosizeAll = () => $$('#editPanel textarea').forEach(autosize);

for (const f of TEXT_FIELDS) {
  const el = $('#f-' + f);
  el.addEventListener('input', () => {
    state.project.text[f] = el.value;
    autosize(el);
    render();
    updateSummaries();
    markDirty();
  });
  el.addEventListener('focus', () => $$(`#sheetHolder text[data-field="${f}"]`).forEach((t) => t.classList.add('hot')));
  el.addEventListener('blur', () => $$('#sheetHolder text.hot').forEach((t) => t.classList.remove('hot')));
}
$('#artPromptInput').addEventListener('input', (e) => {
  state.project.plan.artPrompt = e.target.value;
  markDirty();
});

// keep the preview big except while the keyboard is up on phones
document.addEventListener('focusin', (e) => {
  if (e.target.matches('#editPanel input:not([type=range]):not([type=checkbox]), #editPanel textarea')) { document.body.classList.add('typing'); document.documentElement.classList.add('typing-html'); }
});
document.addEventListener('focusout', () => setTimeout(() => {
  if (!document.activeElement?.matches?.('#editPanel input:not([type=range]):not([type=checkbox]), #editPanel textarea')) { document.body.classList.remove('typing'); document.documentElement.classList.remove('typing-html'); }
}, 120));

// ---------------- lettering ----------------
function buildStyleGrid() {
  const g = $('#styleGrid');
  g.innerHTML = '';
  for (const [id, s] of Object.entries(STYLES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-card';
    b.setAttribute('role', 'radio');
    b.dataset.style = id;
    b.innerHTML = `<span class="s-head">${s.title.caps ? 'AWARD' : 'Award'}</span><span class="s-name">${s.name.caps ? 'JANE' : 'Jane'}</span><span class="s-label"><b>${s.label}</b> ${s.hint}</span>`;
    b.querySelector('.s-head').style.fontFamily = cssFamily(s.title.f);
    b.querySelector('.s-name').style.fontFamily = cssFamily(s.name.f);
    b.setAttribute('aria-label', `${s.label} lettering, ${s.hint}`);
    b.addEventListener('click', () => {
      state.project.style.lettering = id;
      syncLettering();
      render();
      updateSummaries();
      markDirty();
    });
    g.appendChild(b);
    loadFont(s.title.f);
    loadFont(s.name.f);
  }
}

function buildSwatches(container, key) {
  container.innerHTML = '';
  for (const [hex, name] of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (hex === '#ffffff' ? ' light' : '');
    b.style.background = hex;
    b.title = name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', name);
    b.dataset.hex = hex;
    b.addEventListener('click', () => setColor(key, hex));
    container.appendChild(b);
  }
  const c = document.createElement('label');
  c.className = 'swatch custom';
  c.title = 'Custom color';
  c.innerHTML = `<input type="color" aria-label="Custom color">`;
  c.querySelector('input').addEventListener('input', (e) => setColor(key, e.target.value));
  container.appendChild(c);
}

function setColor(key, hex) {
  state.project.style[key] = hex;
  syncLettering();
  render();
  markDirty();
}

function syncLettering() {
  const p = state.project;
  $$('.style-card').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === p.style.lettering)));
  const pyro = p.output === 'pyrography';
  $('#colorControls').hidden = pyro;
  $('#outlineToggleRow').hidden = !pyro;
  for (const [id, key] of [['#headSwatches', 'headColor'], ['#textSwatches', 'textColor']]) {
    let matched = false;
    $$(id + ' .swatch[data-hex]').forEach((b) => {
      const on = b.dataset.hex.toLowerCase() === String(p.style[key]).toLowerCase();
      matched ||= on;
      b.setAttribute('aria-checked', String(on));
    });
    const custom = $(id + ' .swatch.custom');
    custom.setAttribute('aria-checked', String(!matched));
    if (!matched) custom.style.boxShadow = `0 0 0 2.5px var(--accent), inset 0 0 0 9px ${p.style[key]}`;
    else custom.style.boxShadow = '';
  }
  $('#scaleOut').textContent = Math.round(p.style.scale * 100) + '%';
}

$('#scaleRange').addEventListener('input', (e) => {
  state.project.style.scale = Number(e.target.value);
  syncLettering(); render(); updateSummaries(); markDirty();
});
for (const [id, key] of [['#offYRange', 'offsetY'], ['#offXRange', 'offsetX'], ['#widthRange', 'widthScale']]) {
  const el = $(id);
  el.addEventListener('input', () => {
    state.project.style[key] = Number(el.value);
    state.project._showZone = true;
    render(); markDirty();
  });
  const off = () => { state.project._showZone = false; render(); };
  el.addEventListener('change', off);
  el.addEventListener('pointerup', off);
}
// fade the artwork behind the lettering (a soft veil drawn by the app — no AI)
function syncWash() {
  const r = $('#washRange');
  if (!r || !state.project) return;
  const w = Number(state.project.style.wash) || 0;
  r.value = w;
  $('#washOut').textContent = w ? Math.round(w * 100) + '%' : 'Off';
}
$('#washRange')?.addEventListener('input', (e) => {
  state.project.style.wash = Number(e.target.value);
  syncWash(); render(); markDirty();
});

$('#resetPosBtn').addEventListener('click', () => {
  Object.assign(state.project.style, { offsetX: 0, offsetY: 0, widthScale: 1 });
  fillForm(); render(); markDirty();
});
$('#outlineToggle').addEventListener('change', (e) => {
  state.project.style.outline = e.target.checked;
  render(); markDirty();
});

// ---------------- artwork section ----------------
function buildLayoutChips() {
  const c = $('#layoutChips');
  c.innerHTML = '';
  for (const [id, label] of Object.entries(LAYOUT_LABELS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.layout = id;
    b.textContent = label;
    b.addEventListener('click', () => {
      const cur = state.project.art?.layout || state.project.plan.layout;
      state.pendingLayout = id === cur ? null : id;
      syncArtSection();
    });
    c.appendChild(b);
  }
}

function syncArtSection() {
  const p = state.project;
  const cur = state.pendingLayout || p.art?.layout || p.plan.layout;
  $$('#layoutChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === cur)));
  const busy = state.busyArt;
  $('#redrawBtn').disabled = busy;
  $('#variationBtn').disabled = busy;
  $('#switchOutputBtn').disabled = busy;
  $('#redrawBtn').textContent = state.pendingLayout ? 'Redraw with new composition' : 'Redraw with change';
  $('#switchOutputBtn').textContent = p.output === 'pyrography' ? 'Make the certificate version (same design)' : 'Make the wood-burning version (same design)';
  // page shape: a redraw with artwork (one AI design), instant on a design with no artwork
  const tall = orientOf(p) === 'portrait';
  const ob = $('#orientBtn'); // guarded: a page cached from before this button existed must not stop the app
  if (ob) {
    ob.disabled = busy;
    ob.innerHTML = (tall ? 'Redraw as a wide page (landscape)' : 'Redraw as a tall page (portrait)')
      + (plainOn(p) ? '' : ' <small>uses 1 AI design</small>');
    if (plainOn(p)) ob.textContent = tall ? 'Make it a wide page (landscape)' : 'Make it a tall page (portrait)';
  }
  const plain = plainOn(p);
  $('#plainControls').hidden = !plain;
  $('#addArtBtn').disabled = busy;
  $('#paperRow').hidden = p.output === 'pyrography'; // wood-burning is always plain white
  $$('#paperChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paper === (p.style.paper === 'white' ? 'white' : 'cream'))));
  $('#borderToggle').checked = p.style.border !== false;
  // AI-artwork controls only make sense when there is artwork
  for (const el of [$('#tweakInput').closest('.fld'), $('#redrawBtn').closest('.btn-row'), $('#layoutChips').closest('.layout-row'), $('#artPromptInput').closest('details'), $('#designNotes')])
    el.hidden = plain;
  $('#noArtBtn').hidden = plain || busy;
  if ($('#washRow')) $('#washRow').hidden = plain || !p.art;
  $('#galleryPickBtn').hidden = busy;
  const shareable = !!shareableArtOf(p);
  $('#shareRow').hidden = !shareable;
  $('#shareToggle').checked = shareable && isSharedP(p);
  // versions
  const v = $('#versions');
  v.hidden = p.artHistory.length < 2;
  v.innerHTML = '';
  p.artHistory.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'version' + (a.orient === 'portrait' ? ' tall' : '');
    b.setAttribute('aria-current', String(p.art?.key === a.key));
    b.setAttribute('aria-label', `Design ${i + 1}`);
    b.innerHTML = `<img src="${a.url}" alt="" loading="lazy"><span>${i + 1}${a.output === 'pyrography' ? ' · wood' : ''}</span>`;
    b.addEventListener('click', () => {
      useArtVersion(p, a);
      syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render(); markDirty();
    });
    v.appendChild(b);
  });
  const u = state.config?.usage;
  $('#usageNote').textContent = state.config?.mode === 'test'
    ? 'Test mode: artwork is a free placeholder (no AI).'
    : u ? artLeftText(u) : '';
}
// ---- public gallery: only the user's own AI artwork, never wording, names or photos ----
// (mirrors shareableArt/isShared on the server, which decides what is actually listed)
function shareableArtOf(p) {
  const uid = state.user?.id;
  return [...(p.artHistory || [])].reverse().find((a) => a && uid && String(a.key || '').startsWith(`art/${uid}/`)
    && !a.derivedFrom && !a.fromPhoto && !a.fromGallery && !a.fromExample) || null;
}
const isSharedP = (p) => (typeof p.share === 'boolean' ? p.share : !!p.fromIdea);
const sharedNow = (p) => !!shareableArtOf(p) && isSharedP(p);
$('#shareToggle').addEventListener('change', (e) => {
  state.project.share = e.target.checked;
  markDirty();
  toast(e.target.checked ? 'Shared in the public gallery — artwork only.' : 'Not shared — removed from the gallery.');
});
$('#galleryPickBtn').addEventListener('click', () => openLibrary({ tab: 'gallery', forEditor: true }));

// Accounts have a total number of AI artwork designs (the owner's has none); the daily limit applies to everyone
function artLeftText(u) {
  if (u.accountArtLimit != null) {
    const left = Math.max(0, u.accountArtLimit - u.artTotal);
    return left ? `${left} of ${u.accountArtLimit} AI artwork designs left on your account. Wording, lettering, photos and versions are always free.`
      : `You’ve used all ${u.accountArtLimit} AI artwork designs on your account. Wording, lettering, photos and versions are still free.`;
  }
  return `${Math.max(0, u.dailyArtLimit - u.artToday)} of ${u.dailyArtLimit} artwork designs left today.`;
}

$('#redrawBtn').addEventListener('click', () => {
  const tweak = $('#tweakInput').value.trim();
  if (!tweak && !state.pendingLayout) {
    $('#tweakInput').focus();
    toast('Describe what to change, or tap “New variation”.');
    return;
  }
  generateArt({ tweak, layout: state.pendingLayout || undefined });
});
$('#variationBtn').addEventListener('click', () => generateArt({ layout: state.pendingLayout || undefined, seed: String(Date.now()) }));
$('#switchOutputBtn').addEventListener('click', () => convertOutput(state.project.output === 'pyrography' ? 'certificate' : 'pyrography'));
$('#orientBtn')?.addEventListener('click', () => {
  const p = state.project;
  const to = orientOf(p) === 'portrait' ? 'landscape' : 'portrait';
  if (plainOn(p)) {
    // no artwork: just turn the paper; the photo and lettering re-flow
    p.orient = to;
    if (p.photo && to === 'portrait' && p.photo.place !== 'top') p.photo.place = 'top';
    afterArtChange();
    toast(to === 'portrait' ? 'Tall page ✓' : 'Wide page ✓');
    return;
  }
  // a new AI drawing in the new shape; wording, lettering and photo stay as they are
  generateArt({ orient: to, layout: state.pendingLayout || undefined });
});

// ---- no artwork: just the photo and words on clean paper ----
function afterArtChange() { syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render(); markDirty(); }
$('#noArtBtn').addEventListener('click', () => {
  const p = state.project;
  p.plainBg = true;
  p.art = null; // earlier artwork stays under versions
  setArtStatus(null);
  afterArtChange();
  toast('No artwork — just your photo and words. Your artwork is still under versions.', { ms: 4200 });
});
$('#addArtBtn').addEventListener('click', () => generateArt());
$$('#paperChips .chip').forEach((b) => b.addEventListener('click', () => { state.project.style.paper = b.dataset.paper; afterArtChange(); }));
$('#borderToggle').addEventListener('change', (e) => { state.project.style.border = e.target.checked; afterArtChange(); });

// The two versions of a design are always the identical artwork — never a fresh AI drawing.
// Certificate → wood-burning: graphite conversion of the same image. Wood-burning → certificate: the
// certificate it was made from, or (if it started as a pattern) the same drawing in sepia on parchment.
const sameOutput = (a, o) => (a.output === 'pyrography' ? 'pyrography' : 'certificate') === o;
async function convertOutput(to) {
  const p = state.project;
  if (!p || state.busyArt) return;
  const src = p.art;
  if (!src && p.plainBg) {
    setOutputColors(p, to);
    adjustPhotoFor(p, to);
    afterArtChange();
    toast(to === 'pyrography' ? 'Wood-burning version ✓ Same design.' : 'Certificate version ✓ Same design.');
    return;
  }
  if (!src) return generateArt({ output: to }); // nothing to convert yet
  const partner = [...p.artHistory].reverse().find((a) => sameOutput(a, to) && (a.derivedFrom === src.key || src.derivedFrom === a.key));
  if (partner) {
    useArtVersion(p, partner);
    adjustPhotoFor(p, to);
    syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render(); markDirty();
    toast(to === 'pyrography' ? 'Wood-burning version ✓ Same design.' : 'Certificate version ✓ Same design.');
    return;
  }
  state.busyArt = true;
  syncArtSection();
  setArtStatus('busy', `<div class="spinner"></div><span>${to === 'pyrography' ? 'Making the wood-burning version from this exact design…' : 'Making the certificate version from this exact design…'}</span>`);
  try {
    const canvas = await deriveArtCanvas(src, to);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    const q = new URLSearchParams({ from: src.key, output: to, layout: src.layout || p.plan.layout || 'framed', ...(src.orient === 'portrait' ? { orient: 'portrait' } : {}) });
    let res;
    try {
      res = await fetch('/api/art/derived?' + q, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: blob });
    } catch { throw new Error('No connection — please try again.'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return needAuth(() => convertOutput(to));
    if (!res.ok) throw new Error(data.error || 'That version couldn’t be made.');
    // same composition, so the same measured lettering area and the same painted-in photo
    const art = { ...data.art, ...(src.zone ? { zone: src.zone } : {}), ...(src.fromPhoto ? { fromPhoto: src.fromPhoto } : {}) };
    p.artHistory.push(art);
    if (p.artHistory.length > 24) p.artHistory.shift();
    useArtVersion(p, art);
    adjustPhotoFor(p, to);
    setArtStatus(null);
    toast(to === 'pyrography'
      ? 'Wood-burning version ready ✓ Same design as a graphite drawing.'
      : 'Certificate version ready ✓ Same drawing in sepia on parchment.', { ms: 4200 });
  } catch (e) {
    setArtStatus('err', `<span>${e.message}</span>`);
  } finally {
    state.busyArt = false;
    syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render(); markDirty();
  }
}

// a color photo on a wood-burning pattern becomes the graphite version of the same photo, and back
function adjustPhotoFor(p, to) {
  const ph = p.photo;
  if (!ph) return;
  if (to === 'pyrography' && ph.mode === 'color') Object.assign(ph, { mode: 'graphite', wasColor: true });
  else if (to === 'certificate' && ph.wasColor && ph.mode === 'graphite') { ph.mode = 'color'; delete ph.wasColor; }
}

function setArtStatus(kind, html) {
  const el = $('#artStatus');
  if (!kind) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'art-status' + (kind === 'err' ? ' err' : '');
  el.innerHTML = html;
}

function stageOverlay(kind, html) {
  const o = $('#stageOverlay');
  if (!kind) { o.hidden = true; o.innerHTML = ''; return; }
  o.hidden = false;
  o.className = 'stage-overlay' + (kind === 'err' ? ' err' : '');
  o.innerHTML = html;
}

function progressHtml(step, photo = false) {
  const steps = [photo ? 'Adding your photo' : 'Reading your idea', 'Planning layout & wording', 'Painting the artwork'];
  return `<div class="shimmer"></div><div class="spinner"></div><ul class="steps">${steps
    .map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}">${s}</li>`)
    .join('')}</ul><p>${step >= 2 ? 'Usually under a minute. Fill in the wording below while you wait.' : ''}</p>`;
}

async function generateArt({ tweak = '', layout, output, seed, withPhoto, orient } = {}) {
  const p = state.project;
  if (state.busyArt) return;
  state.busyArt = true;
  const targetOutput = output || p.output;
  const targetOrient = orient || orientOf(p);
  const targetLayout = layout || p.art?.layout || p.plan.layout;
  syncArtSection();
  const label = orient && orient !== orientOf(p) ? (orient === 'portrait' ? 'Redrawing as a tall page…' : 'Redrawing as a wide page…')
    : output && output !== p.output ? (output === 'pyrography' ? 'Drawing the wood-burning version…' : 'Painting the color version…') : 'Painting your artwork…';
  setArtStatus('busy', `<div class="spinner"></div><span>${label} You can keep editing.</span>`);
  if (!p.art) stageOverlay('busy', progressHtml(2));
  else stageOverlay('busy', `<div class="shimmer"></div><div class="spinner"></div><h3>${label}</h3><p>Your current design stays until the new one is ready.</p>`);
  const since = Date.now() - 5000;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ id: p.id, since })); } catch {}
  try {
    let art;
    try {
      ({ art } = await api('/api/art', {
        method: 'POST',
        body: {
          idea: p.idea, artPrompt: p.plan.artPrompt, layout: targetLayout, output: targetOutput, orient: targetOrient, tweak, seed,
          // "Paint into art": every redraw keeps using the photo as the reference
          ...((withPhoto || p.photo?.mode === 'ai') && p.photo?.key ? { photoKey: p.photo.key, photoSubject: p.photo.subject || '' } : {}),
        },
      }));
    } catch (e) {
      // connection dropped or gateway timed out: the artwork may still have been made — look for it
      if (!(e.network || e.status === 524 || e.status === 504)) throw e;
      setArtStatus('busy', `<div class="spinner"></div><span>Connection interrupted — checking whether your artwork finished…</span>`);
      art = await recoverArt(since, 12);
      if (!art) throw new Error('The connection dropped before the artwork arrived. Please try again.');
    }
    await fitZone(art);
    p.art = art;
    p.orient = art.orient === 'portrait' ? 'portrait' : 'landscape';
    p.plainBg = false;
    p.artHistory.push(art);
    if (p.artHistory.length > 24) p.artHistory.shift();
    if (targetOutput !== p.output) setOutputColors(p, targetOutput);
    state.pendingLayout = null;
    $('#tweakInput').value = '';
    stageOverlay(null);
    setArtStatus(null);
    const shared = sharedNow(p) && !p._toldShared;
    if (shared) p._toldShared = true;
    toast((p.artHistory.length > 1 ? 'New artwork ready ✓  Earlier versions are under Artwork.' : 'Artwork ready ✓')
      + (shared ? ' It’s shared in the public gallery (artwork only) — turn that off under Artwork.' : ''), { ms: shared ? 5200 : 3200 });
    refreshUsage();
  } catch (e) {
    if (e.status === 401) return needAuth(() => generateArt({ tweak, layout, output, seed, orient }));
    const msg = e.message || 'The artwork could not be created.';
    if (!p.art) stageOverlay('err', `<h3>Artwork wasn’t created</h3><p>${msg}</p><button class="primary-btn small" id="retryArt">Try again</button>`);
    else stageOverlay(null);
    setArtStatus('err', `<span>${msg}</span><button class="ghost-btn small" id="retryArt2">Retry</button>`);
    const retry = () => generateArt({ tweak, layout, output, seed, orient });
    $('#retryArt')?.addEventListener('click', retry);
    $('#retryArt2')?.addEventListener('click', retry);
  } finally {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
    state.busyArt = false;
    syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render();
    markDirty();
  }
}

// measure where the artwork left empty space, so lettering stays off the decoration
async function fitZone(art) {
  if (!art || art.zone) return;
  try { const z = await detectZone(art.url, art.layout, art.orient); if (z) art.zone = z; } catch (e) { console.warn('zone detect failed', e); }
}

async function recoverArt(since, tries = 1) {
  for (let i = 0; i < tries; i++) {
    try {
      const { art } = await api('/api/art-latest?since=' + since);
      if (art) return art;
    } catch {}
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 10000));
  }
  return null;
}

// on reload: if a design was still being painted when the page closed, pick up the result
async function resumePendingArt() {
  let pend = null;
  try { pend = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch {}
  if (!pend || !state.project || pend.id !== state.project.id) return;
  localStorage.removeItem(PENDING_KEY);
  const art = await recoverArt(pend.since, 1);
  await fitZone(art);
  const p = state.project;
  if (art && !p.artHistory.some((a) => a.key === art.key)) {
    p.art = art;
    p.plainBg = false;
    p.artHistory.push(art);
    p.output = art.output || p.output;
    stageOverlay(null); setArtStatus(null);
    syncLettering(); syncArtSection(); syncPhoto(); updateSummaries(); render(); markDirty();
    toast('Recovered the artwork that finished while you were away ✓');
  }
}

// Switching between the color certificate and the wood-burning pattern: wood-burning lettering is
// always burn tone, and the certificate's own colors are remembered so switching back restores them.
function setOutputColors(p, output) {
  if (output === p.output) return;
  if (output === 'pyrography') {
    if (p.style.headColor !== BURN) Object.assign(p.style, { certHead: p.style.headColor, certText: p.style.textColor });
    Object.assign(p.style, { headColor: BURN, textColor: BURN });
  } else if (p.style.headColor === BURN) {
    Object.assign(p.style, { headColor: p.style.certHead || COLORS[1][0], textColor: p.style.certText || COLORS[0][0] });
  }
  p.output = output;
}

function useArtVersion(p, a) {
  setOutputColors(p, a.output === 'pyrography' ? 'pyrography' : 'certificate');
  p.art = a;
  p.orient = a.orient === 'portrait' ? 'portrait' : 'landscape';
  p.plainBg = false;
}

async function refreshUsage() {
  try {
    const c = await api('/api/config');
    state.config.usage = c.usage;
    syncArtSection();
  } catch {}
}

// ---------------- photo ----------------
// Local copies of photos uploaded in this session, so the preview never waits for the network.
const localPhotos = new Map(); // key -> object URL
const photoSrc = (ph) => ({ ...ph, url: localPhotos.get(ph.key) || ph.url });
const MODE_HINT = {
  color: 'Your exact photo, in color, placed in the design.',
  graphite: 'Your exact photo turned into a pencil drawing. Nothing is redrawn, so the likeness is exact.',
  ai: 'AI draws the subject into the artwork itself. It blends in beautifully but is a close likeness, not an exact copy. Uses one artwork design.',
};
const MODE_LABEL = { color: 'Exact photo', graphite: 'Exact graphite', ai: 'Painted into art' };

function photoError(msg) {
  const el = $('#photoError');
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function uploadPhoto(prep) {
  let res;
  try {
    res = await fetch('/api/photos', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': prep.type }, body: prep.blob });
  } catch {
    throw new Error('No connection — the photo wasn’t added. Please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'The photo couldn’t be added.');
    e.status = res.status;
    throw e;
  }
  return data; // { key, url }
}

// a sensible spot: beside the words when the empty area is wide, above them when it's tall
function defaultPlace(p) {
  const z = zoneFor(p);
  return z.w / z.h > 1.15 ? 'left' : 'top';
}

async function attachPhoto(prep, { replace = false } = {}) {
  const p = state.project;
  if (!p) return;
  photoError('');
  $('#secPhoto').open = true;
  $('#photoSummary').textContent = 'Adding photo…';
  try {
    const { key, url } = await uploadPhoto(prep);
    localPhotos.set(key, prep.localUrl);
    const logo = prep.type === 'image/png';
    const keep = replace && p.photo ? { mode: p.photo.mode, shape: p.photo.shape, place: p.photo.place, size: p.photo.size, fade: p.photo.fade, shading: p.photo.shading, detail: p.photo.detail, subject: p.photo.subject } : null;
    p.photo = {
      ...PHOTO_DEFAULTS,
      mode: p.output === 'pyrography' ? 'graphite' : 'color',
      place: defaultPlace(p),
      ...(logo ? { shape: 'full', fade: 0 } : {}),
      ...(p.plainBg && !replace ? { size: 1.5 } : {}),
      ...(keep || {}),
      key, url, w: prep.w, h: prep.h, type: prep.type,
      zoom: 1, fx: PHOTO_DEFAULTS.fx, fy: PHOTO_DEFAULTS.fy,
    };
    syncPhoto(); render(); markDirty();
    toast(replace ? 'Photo replaced ✓' : 'Photo added ✓ Choose how it appears below.');
  } catch (e) {
    if (e.status === 401) return needAuth(() => attachPhoto(prep, { replace }));
    photoError(e.message);
    syncPhoto();
  }
}

async function onPhotoFile(input, opts) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    attachPhoto(await prepareUpload(file), opts);
  } catch (e) {
    photoError(e.message);
  }
}
$('#photoInput').addEventListener('change', (e) => onPhotoFile(e.target));
$('#photoReplace').addEventListener('change', (e) => onPhotoFile(e.target, { replace: true }));
$('#photoRemove').addEventListener('click', () => {
  state.project.photo = null;
  photoError('');
  syncPhoto(); render(); markDirty();
  toast('Photo removed.');
});

function buildPhotoChips() {
  for (const [box, map, key] of [['#photoShapeChips', SHAPES, 'shape'], ['#photoPlaceChips', PLACES, 'place']]) {
    const c = $(box);
    for (const [id, label] of Object.entries(map)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.v = id;
      b.textContent = label;
      b.addEventListener('click', () => setPhoto(key, id));
      c.appendChild(b);
    }
  }
}

function setPhoto(key, value) {
  const ph = state.project?.photo;
  if (!ph) return;
  ph[key] = value;
  syncPhoto(); render(); markDirty();
}

const PHOTO_RANGES = { '#phShading': 'shading', '#phDetail': 'detail', '#phSize': 'size', '#phFade': 'fade', '#phZoom': 'zoom', '#phFy': 'fy', '#phFx': 'fx' };
for (const [sel, key] of Object.entries(PHOTO_RANGES)) {
  $(sel).addEventListener('input', (e) => {
    const ph = state.project?.photo;
    if (!ph) return;
    ph[key] = Number(e.target.value);
    syncPhotoOutputs();
    render(); markDirty();
  });
  $(sel).addEventListener('change', () => syncPhotoThumb());
}
$('#phCropReset').addEventListener('click', () => {
  Object.assign(state.project.photo, { zoom: 1, fx: PHOTO_DEFAULTS.fx, fy: PHOTO_DEFAULTS.fy });
  syncPhoto(); render(); markDirty();
});
$$('#photoModeSeg button').forEach((b) => b.addEventListener('click', () => setPhoto('mode', b.dataset.mode)));
$('#photoSubject').addEventListener('input', (e) => { state.project.photo.subject = e.target.value; markDirty(); });
$('#photoPaintBtn').addEventListener('click', () => {
  const p = state.project;
  const cur = p.art?.layout || p.plan.layout;
  // a decorative border leaves no room for a portrait: give the subject a featured spot instead
  generateArt({ withPhoto: true, layout: cur === 'framed' ? 'crest' : cur });
});

function syncPhotoOutputs() {
  const ph = state.project?.photo;
  if (!ph) return;
  const pct = (v) => Math.round(v * 100) + '%';
  $('#phShadingOut').textContent = pct(ph.shading);
  $('#phDetailOut').textContent = pct(ph.detail);
  $('#phSizeOut').textContent = pct(ph.size);
  $('#phFadeOut').textContent = pct(ph.fade);
}

let thumbTimer;
function syncPhotoThumb() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(async () => {
    const ph = state.project?.photo;
    if (!ph) return;
    const shown = ph.mode === 'ai' ? { ...ph, mode: 'color' } : ph;
    try { $('#photoThumb').src = await photoUrl(photoSrc(shown), 260); } catch {}
  }, 120);
}

function syncPhoto() {
  const p = state.project;
  const ph = p?.photo;
  $('#photoEmpty').hidden = !!ph;
  $('#photoEdit').hidden = !ph;
  if (!ph) {
    $('#photoSummary').textContent = 'Add a person, pet, place or logo';
    return;
  }
  $$('#photoModeSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === ph.mode)));
  $('#photoModeHint').textContent = MODE_HINT[ph.mode] || '';
  const ai = ph.mode === 'ai';
  const painted = photoPainted(p);
  $('#photoAiControls').hidden = !ai;
  $('#photoLayerControls').hidden = ai && painted;
  $('#graphiteControls').hidden = ph.mode !== 'graphite';
  $('#photoSubject').value = ph.subject || '';
  $('#photoPaintBtn').textContent = painted ? 'Paint it in again' : 'Paint it into the artwork';
  $('#photoPaintBtn').disabled = state.busyArt;
  $('#photoAiNote').textContent = painted
    ? 'The current artwork was painted from your photo. Switch to “Exact photo” or “Exact graphite” any time to use the photo as-is instead.'
    : 'Until you tap the button, your exact photo stays in the design. Earlier artwork stays under Artwork → versions.';
  $$('#photoShapeChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ph.shape)));
  $$('#photoPlaceChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ph.place)));
  for (const [sel, key] of Object.entries(PHOTO_RANGES)) $(sel).value = ph[key] ?? PHOTO_DEFAULTS[key];
  syncPhotoOutputs();
  syncPhotoThumb();
  $('#photoSummary').textContent = ai
    ? (painted ? 'Painted into the artwork' : 'Paint into art — not painted yet')
    : `${MODE_LABEL[ph.mode]} · ${SHAPES[ph.shape] || ''} · ${(PLACES[ph.place] || '').toLowerCase()}`;
}

// start screen: a photo can be picked before designing
function clearStartPhoto(revoke = true) {
  if (revoke && state.pendingPhoto) URL.revokeObjectURL(state.pendingPhoto.localUrl);
  state.pendingPhoto = null;
  $('#startPhotoNote').hidden = true;
  $('#noArtRow').hidden = true;
  $('#noArtToggle').checked = false;
  $('#startPhotoLabel').textContent = 'Add a photo';
}
$('#startPhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const prep = await prepareUpload(file);
    clearStartPhoto();
    state.pendingPhoto = prep;
    $('#startPhotoThumb').src = prep.localUrl;
    $('#startPhotoNote').hidden = false;
    $('#startPhotoLabel').textContent = 'Change photo';
    $('#noArtRow').hidden = !!state.pendingGallery; // gallery artwork chosen: "no artwork" doesn't apply
  } catch (err) {
    toast(err.message, { error: true });
  }
});
$('#startPhotoRemove').addEventListener('click', () => clearStartPhoto());

// ---------------- start / design ----------------
function selectedOutput() {
  return $('input[name="output"]:checked').value;
}
const selectedOrient = () => ($('input[name="orient"]:checked')?.value === 'portrait' ? 'portrait' : 'landscape');

$('#designBtn').addEventListener('click', startDesign);
$('#idea').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startDesign();
});

async function startDesign() {
  const idea = $('#idea').value.trim();
  // a description, a photo, or both
  if (idea.length < 3 && !state.pendingPhoto && !state.pendingGallery) {
    $('#idea').focus();
    toast('Describe who it’s for, or add a photo — or browse ideas.');
    return;
  }
  if (!state.user) return needAuth(startDesign);
  const gal = state.pendingGallery;
  const output = gal ? gal.art.output : selectedOutput();
  const p = blankProject(idea || gal?.idea || '', output, gal ? (gal.art.orient === 'portrait' ? 'portrait' : 'landscape') : selectedOrient());
  // still the library idea (perhaps with their own details added) → its artwork is shared by default
  const li = state.pendingIdea;
  if (li && idea.includes(li.p.slice(0, 40))) p.fromIdea = { id: li.id, t: li.t, p: li.p };
  if (output === 'pyrography') Object.assign(p.style, { headColor: BURN, textColor: BURN });
  state.project = p;
  state.pendingLayout = null;
  setView('editor');
  fillForm();
  render();
  const pend = state.pendingPhoto;
  const noArt = !!pend && !gal && $('#noArtToggle').checked;
  p.plainBg = noArt;
  if (pend) clearStartPhoto(false);
  stageOverlay('busy', progressHtml(pend ? 0 : 1, !!pend));
  // the photo goes up first so the planner can look at it
  if (pend) {
    await attachPhoto(pend);
    if (state.project !== p) return;
    if (!p.photo && idea.length < 3) {
      // nothing to design from: back to the start with the photo still chosen
      state.project = null;
      stageOverlay(null); setArtStatus(null);
      setView('start');
      state.pendingPhoto = pend;
      $('#startPhotoThumb').src = pend.localUrl;
      $('#startPhotoNote').hidden = false;
      $('#startPhotoLabel').textContent = 'Change photo';
    $('#noArtRow').hidden = false;
      toast('The photo couldn’t be uploaded. Check your connection and tap Design it again.', { error: true, ms: 5000 });
      return;
    }
    stageOverlay('busy', progressHtml(1, true));
  }
  setArtStatus('busy', `<div class="spinner"></div><span>Designing… this takes about a minute.</span>`);
  $('#secWording').open = true;
  try {
    const { plan } = await api('/api/plan', { method: 'POST', body: { idea: p.idea || (gal ? gal.title : ''), output, ...(p.photo?.key ? { photoKey: p.photo.key } : {}) } });
    applyPlan(plan);
  } catch (e) {
    if (e.status === 401) { setView('start'); return needAuth(startDesign); }
    toast('Couldn’t plan the design — using a standard layout.', { error: true });
  }
  markDirty();
  if (gal) {
    // artwork from the gallery: already painted, nothing to pay for
    clearStartGallery();
    p.plan.layout = gal.art.layout || p.plan.layout;
    p.art = gal.art;
    p.artHistory.push(gal.art);
    stageOverlay(null);
    setArtStatus(null);
    afterArtChange();
    toast('Ready ✓ Gallery artwork with your wording — edit anything.', { ms: 3600 });
    return;
  }
  if (p.plainBg) {
    // just the photo and words: nothing to paint
    stageOverlay(null);
    setArtStatus(null);
    afterArtChange();
    toast('Ready ✓ Your photo and words — add AI artwork any time under Artwork.', { ms: 4200 });
    return;
  }
  await generateArt();
}

function applyPlan(plan) {
  const p = state.project;
  p.title = plan.projectTitle || p.title;
  p.plan = { layout: plan.layout, artPrompt: plan.artPrompt, designNotes: plan.designNotes, source: plan.source || '' };
  if (p.photo && !p.photo.subject && plan.photoSubject) p.photo.subject = plan.photoSubject;
  // never overwrite anything the user already typed
  for (const f of TEXT_FIELDS) if (!p.text[f] && plan.wording?.[f]) p.text[f] = plan.wording[f];
  p.style.lettering = STYLES[plan.lettering] ? plan.lettering : p.style.lettering;
  if (p.output !== 'pyrography') {
    p.style.headColor = plan.headColor || p.style.headColor;
    p.style.textColor = plan.textColor || p.style.textColor;
  }
  fillForm();
  render();
}

// ---------------- saving ----------------
function setSaveState(kind, text) {
  $('#saveState').innerHTML = `<span class="dot ${kind}"></span><span>${text}</span>`;
}

function markDirty() {
  const p = state.project;
  if (!p) return;
  p.updatedAt = Date.now();
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable(p)));
    localStorage.setItem(LAST_KEY, p.id);
  } catch {}
  state.save.dirty = true;
  setSaveState('busy', 'Saving…');
  clearTimeout(state.save.timer);
  state.save.timer = setTimeout(saveNow, 900);
}

async function saveNow() {
  const p = state.project;
  if (!p || !state.save.dirty) return;
  if (!state.user) {
    setSaveState('warn', '<b>Not saved to an account</b> — sign in to keep it');
    return;
  }
  if (state.save.inflight) {
    state.save.timer = setTimeout(saveNow, 600);
    return;
  }
  state.save.inflight = true;
  state.save.dirty = false;
  try {
    await api(`/api/projects/${p.id}`, { method: 'PUT', body: serializable(p) });
    state.save.lastSaved = Date.now();
    state.save.error = null;
    setSaveState('', '<b>Saved</b> to your account');
  } catch (e) {
    state.save.dirty = true;
    state.save.error = e;
    if (e.status === 401) setSaveState('warn', '<b>Signed out</b> — sign in to save');
    else {
      setSaveState('warn', '<b>Not saved yet</b> — kept on this device, retrying');
      state.save.timer = setTimeout(saveNow, 6000);
    }
  } finally {
    state.save.inflight = false;
  }
}
addEventListener('beforeunload', (e) => {
  if (state.save.dirty && state.user) {
    saveNow();
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// ---------------- library ----------------
$('#browseBtn').addEventListener('click', openLibrary);

async function openLibrary(opts = {}) {
  // from the editor the sheet is only the gallery (ideas belong to the start screen)
  state.lib.forEditor = !!opts.forEditor;
  state.lib.galOut = undefined;
  $('#libSeg').hidden = state.lib.forEditor;
  openSheet('libSheet');
  setLibTab(opts.tab === 'gallery' || opts.forEditor ? 'gallery' : 'ideas');
  if (state.lib.tab === 'gallery') return;
  const chips = $('#libChips');
  if (!chips.childElementCount) {
    CHIPS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = c.label;
      b.addEventListener('click', () => { state.lib.chip = i; state.lib.shown = 40; renderLib(); $('#libList').scrollTop = 0; });
      chips.appendChild(b);
    });
  }
  $('#libList').innerHTML = '<li class="empty">Loading ideas…</li>';
  await loadLibrary();
  renderLib();
  if (!isPhoneLike()) $('#libSearch').focus();
}

function setLibTab(tab) {
  state.lib.tab = tab;
  const g = tab === 'gallery';
  $$('#libSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#libTitle').textContent = g ? (state.lib.forEditor ? 'Artwork from the gallery' : 'Artwork gallery') : 'Ideas to start from';
  $('#ideaTools').hidden = g;
  $('#libList').hidden = g;
  $('#galChips').hidden = !g;
  $('#galWrap').hidden = !g;
  if (g) loadGallery(true);
  else { $('#libCount').textContent = ''; if ($('#libList').childElementCount) renderLib(); }
}
$$('#libSeg button').forEach((b) => b.addEventListener('click', async () => {
  setLibTab(b.dataset.tab);
  if (b.dataset.tab === 'ideas' && !$('#libList').childElementCount) { await openLibrary(); }
}));
$$('#galChips .chip').forEach((b) => b.addEventListener('click', () => { state.lib.galOut = b.dataset.out; loadGallery(true); }));

async function loadGallery(reset) {
  const grid = $('#galGrid');
  if (state.lib.galOut === undefined) state.lib.galOut = state.lib.forEditor ? (state.project?.output || '') : '';
  $$('#galChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.out === state.lib.galOut)));
  if (reset) { state.lib.galOffset = 0; grid.innerHTML = '<p class="empty">Loading artwork…</p>'; $('#galWrap').scrollTop = 0; }
  try {
    const q = new URLSearchParams({ offset: state.lib.galOffset || 0, ...(state.lib.galOut ? { output: state.lib.galOut } : {}) });
    const { items, more, admin } = await api('/api/gallery?' + q);
    if (reset) grid.innerHTML = '';
    grid.querySelector('.lib-more')?.remove();
    $('#libCount').textContent = 'Artwork other designers shared — tap one to put your own words on it. Free: it doesn’t use an AI design.';
    if (reset && !items.length) grid.innerHTML = '<p class="empty">Nothing here yet.</p>';
    for (const it of items) grid.appendChild(galleryItem(it, admin));
    state.lib.galOffset = (state.lib.galOffset || 0) + items.length;
    if (more) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ghost-btn lib-more'; b.textContent = 'Show more';
      b.addEventListener('click', () => loadGallery(false));
      grid.appendChild(b);
    }
  } catch (e) {
    grid.innerHTML = `<p class="empty">Couldn’t load the gallery: ${e.message}</p>`;
  }
}

function galleryItem(it, admin) {
  const d = document.createElement('div');
  d.className = 'gal-item' + (it.orient === 'portrait' ? ' tall' : '');
  d.dataset.id = it.id;
  d.innerHTML = `<button type="button" class="gal-open"><img loading="lazy" alt=""><span></span></button>${admin ? '<button type="button" class="gal-hide">Hide</button>' : ''}`;
  d.querySelector('img').src = it.url;
  d.querySelector('span').textContent = it.title;
  d.querySelector('.gal-open').addEventListener('click', () => useGalleryArt(it));
  d.querySelector('.gal-hide')?.addEventListener('click', async () => {
    if (!confirm('Hide this artwork from the gallery for everyone?')) return;
    try { await api(`/api/gallery/${it.id}`, { method: 'DELETE' }); d.remove(); } catch (e) { toast('Couldn’t hide it: ' + e.message, { error: true }); }
  });
  return d;
}

// Tapping gallery artwork: in the editor it replaces the current artwork (earlier art stays under
// versions); on the start screen it's held for "Design it", like a chosen photo.
async function useGalleryArt(it) {
  if (!state.user) return needAuth(() => useGalleryArt(it));
  try {
    const res = await api(`/api/gallery/${it.id}/use`, { method: 'POST' });
    if (state.lib.forEditor && state.project) {
      const p = state.project;
      p.plainBg = false;
      p.artHistory.push(res.art);
      if (p.artHistory.length > 24) p.artHistory.shift();
      useArtVersion(p, res.art);
      adjustPhotoFor(p, res.art.output);
      closeSheet();
      setArtStatus(null);
      afterArtChange();
      toast('Gallery artwork in place ✓ Your wording is unchanged. Earlier artwork is under versions.', { ms: 4200 });
    } else {
      clearStartGallery();
      state.pendingGallery = { art: res.art, title: res.title, idea: res.idea };
      // a starting description to add their details to (it only shapes the wording — the artwork stays)
      const ta = $('#idea');
      if (!ta.value.trim() || ta.value === state.galPrefill) {
        state.galPrefill = res.idea || `${res.title}. For `;
        ta.value = state.galPrefill;
      }
      $('#startGalThumb').src = res.art.url;
      $('#startGalNote').hidden = false;
      $$('input[name="output"]').forEach((r) => (r.checked = r.value === res.art.output));
      $$('input[name="orient"]').forEach((r) => (r.checked = r.value === (res.art.orient === 'portrait' ? 'portrait' : 'landscape')));
      $('#noArtRow').hidden = true;
      closeSheet();
      ta.scrollIntoView({ block: 'center' });
      toast('Artwork chosen — add their name and details, then Design it.', { ms: 3600 });
    }
  } catch (e) {
    if (e.status === 401) return needAuth(() => useGalleryArt(it));
    toast('Couldn’t use that artwork: ' + e.message, { error: true });
  }
}
function clearStartGallery() {
  state.pendingGallery = null;
  // take back the description we filled in, if they didn't change it
  if (state.galPrefill && $('#idea').value === state.galPrefill) $('#idea').value = '';
  state.galPrefill = null;
  $('#startGalNote').hidden = true;
  if (state.pendingPhoto) $('#noArtRow').hidden = false;
}
$('#startGalRemove').addEventListener('click', clearStartGallery);

let libTimer;
$('#libSearch').addEventListener('input', () => {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => { state.lib.shown = 40; renderLib(); $('#libList').scrollTop = 0; }, 120);
});

function renderLib() {
  $$('#libChips .chip').forEach((b, i) => b.setAttribute('aria-pressed', String(i === state.lib.chip)));
  const res = searchLibrary($('#libSearch').value, state.lib.chip);
  $('#libCount').textContent = res.length ? `${res.length.toLocaleString()} ideas — tap one to use it, then edit it to fit` : '';
  const list = $('#libList');
  list.innerHTML = '';
  if (!res.length) {
    list.innerHTML = `<li class="empty">No matches. Try a simpler word — or just describe your idea in your own words.</li>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const x of res.slice(0, state.lib.shown)) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-item';
    b.innerHTML = `<span class="lib-meta"></span><b></b><p></p>`;
    b.querySelector('.lib-meta').textContent = `${x.o} · ${x.c}`;
    b.querySelector('b').textContent = x.t;
    b.querySelector('p').textContent = x.p;
    b.addEventListener('click', () => useIdea(x));
    li.appendChild(b);
    frag.appendChild(li);
  }
  if (res.length > state.lib.shown) {
    const li = document.createElement('li');
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ghost-btn lib-more';
    more.textContent = `Show more (${(res.length - state.lib.shown).toLocaleString()})`;
    more.addEventListener('click', () => { state.lib.shown += 60; renderLib(); });
    li.appendChild(more);
    frag.appendChild(li);
  }
  list.appendChild(frag);
}

function useIdea(x) {
  $('#idea').value = x.p;
  state.pendingIdea = x; // a design started from a library idea shares its artwork by default
  if (x.c === 'Wood-Burning Showpieces') $('input[name="output"][value="pyrography"]').checked = true;
  closeSheet();
  const ta = $('#idea');
  ta.scrollIntoView({ block: 'center' });
  ta.animate([{ boxShadow: '0 0 0 6px rgba(169,128,47,.45)' }, { boxShadow: '0 0 0 0 rgba(169,128,47,0)' }], { duration: 900 });
  toast('Idea added — add their name or details, then Design it.', { ms: 3600 });
}

// ---------------- export ----------------
const canShareFiles = (() => {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }); } catch { return false; }
})();
const shareMode = () => canShareFiles && isPhoneLike();

$('#exportBtn').addEventListener('click', openExport);
function openExport() {
  const p = state.project;
  if (!p) return;
  if (!p.art && !p.plainBg && !confirm('The artwork isn’t ready yet. Export the lettering only?')) return;
  openSheet('exportSheet');
  $('#mirrorRow').hidden = p.output !== 'pyrography';
  $('#mirrorToggle').checked = state.exp.mirror;
  $$('#paperSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.paper === state.exp.paper)));
  $('#saveFileTitle').textContent = shareMode() ? 'Save to Files or Share…' : 'Download PDF';
  $('#exportNote').textContent = shareMode()
    ? 'On iPhone: tap “Save to Files”, then pick a folder. You can also Print, Mail, or AirDrop from the same menu.'
    : 'The PDF has crisp, real text and prints at full quality.';
  buildPdf();
}
$$('#paperSeg button').forEach((b) => b.addEventListener('click', () => {
  state.exp.paper = b.dataset.paper;
  $$('#paperSeg button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  buildPdf();
}));
$('#mirrorToggle').addEventListener('change', (e) => { state.exp.mirror = e.target.checked; buildPdf(); });

async function buildPdf() {
  const opts = { paper: state.exp.paper, mirror: state.project.output === 'pyrography' && state.exp.mirror };
  const token = {};
  state.exp.building = token;
  state.exp.pdf = null;
  $('#saveFileBtn').disabled = true;
  $('#previewPdfBtn').disabled = true;
  $('#saveFileSub').textContent = 'Preparing your PDF…';
  try {
    const bytes = await renderPdf(state.project, opts);
    if (state.exp.building !== token) return;
    const name = fileBase(state.project) + '.pdf';
    state.exp.pdf = new File([bytes], name, { type: 'application/pdf' });
    $('#saveFileBtn').disabled = false;
    $('#previewPdfBtn').disabled = false;
    $('#saveFileSub').textContent = shareMode() ? `${name} · ${(bytes.length / 1048576).toFixed(1)} MB` : `Saves “${name}”`;
  } catch (e) {
    console.error(e);
    if (state.exp.building === token) $('#saveFileSub').textContent = 'Couldn’t build the PDF: ' + e.message;
  }
}

async function deliverFile(file) {
  if (shareMode()) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      console.warn('share failed, falling back to download', e);
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`Downloaded “${file.name}”`);
  return true;
}

$('#saveFileBtn').addEventListener('click', () => state.exp.pdf && deliverFile(state.exp.pdf));
$('#previewPdfBtn').addEventListener('click', () => {
  if (!state.exp.pdf) return;
  const v = $('#viewer');
  const url = URL.createObjectURL(state.exp.pdf);
  v.dataset.url = url;
  $('#viewerFrame').src = url + '#view=Fit';
  v.hidden = false;
});
function closeViewer() {
  const v = $('#viewer');
  v.hidden = true;
  $('#viewerFrame').src = 'about:blank';
  if (v.dataset.url) URL.revokeObjectURL(v.dataset.url);
}
$('#viewerClose').addEventListener('click', closeViewer);
$('#viewerSave').addEventListener('click', () => state.exp.pdf && deliverFile(state.exp.pdf));
$('#pngBtn').addEventListener('click', async () => {
  const btn = $('#pngBtn');
  btn.disabled = true;
  btn.textContent = 'Preparing image…';
  try {
    const blob = await renderPng(state.project, 3000);
    await deliverFile(new File([blob], fileBase(state.project) + '.png', { type: 'image/png' }));
  } catch (e) {
    toast('Couldn’t make the image: ' + e.message, { error: true });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save as an image (PNG) instead';
  }
});

// ---------------- projects ----------------
$('#projectsBtn').addEventListener('click', openProjects);
$('#navHomeBtn').addEventListener('click', () => { closeSheet(); newDesign(); });
$('#newProjectBtn').addEventListener('click', () => { closeSheet(); newDesign(); });
$('#homeBtn').addEventListener('click', () => {
  if (state.project && $('#studio').dataset.view === 'editor') openProjects();
  else newDesign();
});

function newDesign() {
  saveNow();
  state.project = null;
  try { localStorage.removeItem(LAST_KEY); } catch {}
  $('#idea').value = '';
  stageOverlay(null);
  setArtStatus(null);
  setView('start');
}

async function openProjects() {
  if (!state.user) return needAuth(openProjects);
  await saveNow();
  openSheet('projectsSheet');
  $('#projEmail').textContent = state.user.email;
  const grid = $('#projGrid');
  grid.innerHTML = '<p class="empty">Loading…</p>';
  try {
    // examples are a bonus: if they fail to load, the user's own projects still show
    const [{ projects }, ex] = await Promise.all([api('/api/projects'), api('/api/examples').catch(() => ({ examples: [] }))]);
    const examples = ex.examples || [];
    const admin = !!ex.admin;
    grid.innerHTML = '';
    const SECTIONS = [
      { output: 'pyrography', label: 'Wood-burning patterns', empty: 'No wood-burning patterns of your own yet. Choose “Wood-burning pattern” when you start a design, or open a certificate and tap “Make a wood-burning pattern version”.' },
      { output: 'certificate', label: 'Color certificates', empty: 'No color certificates of your own yet.' },
    ];
    // a design shows in every section it has artwork for; one with no artwork yet shows under its current type
    const inSection = (pr, o) => (pr.versions && pr.versions[o]) || (!pr.versions?.certificate && !pr.versions?.pyrography && (pr.output || 'certificate') === o);
    const mine = Object.fromEntries(SECTIONS.map((s) => [s.output, projects.filter((pr) => inSection(pr, s.output))]));
    const exs = Object.fromEntries(SECTIONS.map((s) => [s.output, examples.filter((pr) => inSection(pr, s.output))]));
    // the section holding the most recently edited design opens first
    const order = projects[0]?.output === 'certificate' || !projects.length ? [SECTIONS[1], SECTIONS[0]] : SECTIONS;
    for (const sec of order) {
      const box = document.createElement('details');
      box.className = 'proj-sec';
      box.dataset.output = sec.output;
      box.open = true;
      box.innerHTML = `<summary><span class="proj-sec-ico ${sec.output === 'pyrography' ? 'pick-wood' : 'pick-cert'}" aria-hidden="true"></span><b>${sec.label}</b><span class="proj-count">${mine[sec.output].length}</span></summary><div class="proj-grid"></div>`;
      const g = box.querySelector('.proj-grid');
      if (!mine[sec.output].length)
        g.innerHTML = exs[sec.output].length
          ? `<p class="empty compact">None of your own yet — start from an example below, or start a new design.</p>`
          : `<p class="empty">${sec.empty}</p>`;
      for (const pr of mine[sec.output]) g.appendChild(projectCard(pr, sec.output, { admin }));
      if (exs[sec.output].length) {
        // ready-made examples anyone can start from; folded away once you have designs of your own
        const exBox = document.createElement('details');
        exBox.className = 'proj-ex';
        exBox.open = !mine[sec.output].length;
        exBox.innerHTML = `<summary><b>Examples</b><span class="proj-count">${exs[sec.output].length}</span><small>Open one to get your own copy to edit</small></summary><div class="proj-grid"></div>`;
        const eg = exBox.querySelector('.proj-grid');
        // thumbnails are drawn only when the examples are first shown
        const fill = () => { if (!eg.childElementCount) for (const pr of exs[sec.output]) eg.appendChild(projectCard(pr, sec.output, { example: true, admin })); };
        if (exBox.open) fill();
        exBox.addEventListener('toggle', () => exBox.open && fill());
        box.appendChild(exBox);
      }
      grid.appendChild(box);
    }
  } catch (e) {
    grid.innerHTML = `<p class="empty">Couldn’t load projects: ${e.message}</p>`;
  }
}
function projectCard(pr, output, { example = false, admin = false } = {}) {
  const card = document.createElement('div');
  card.className = 'proj' + (example ? ' proj-example' : '');
  card.dataset.id = pr.id;
  const other = output === 'pyrography' ? 'certificate' : 'pyrography';
  const both = pr.versions?.[other];
  // a design with both versions is listed in both sections; say so in words, below the picture
  const also = both
    ? `<span class="proj-also"><span class="proj-also-ico ${other === 'pyrography' ? 'pick-wood' : 'pick-cert'}" aria-hidden="true"></span>${other === 'pyrography' ? 'Also as a pattern' : 'Also as a certificate'}</span>`
    : '';
  card.innerHTML = `<button class="proj-open" type="button"><div class="proj-thumb"></div><div class="proj-info"><b></b><small></small>${also}</div></button>
    <button class="proj-menu" type="button" aria-label="More actions">⋯</button>`;
  if (both) card.querySelector('.proj-also').title = other === 'pyrography' ? 'This design also has a wood-burning pattern version — it’s listed in that section too.' : 'This design also has a color certificate version — it’s listed in that section too.';
  // thumbnail: this section's version of the artwork with the project's lettering
  const thumb = card.querySelector('.proj-thumb');
  const v = pr.versions?.[output];
  if (pr.preview?.style?.lettering) {
    const prev = { ...pr.preview, output, art: v ? { url: v.url, layout: v.layout, zone: v.zone, orient: v.orient } : pr.preview.art, style: { ...pr.preview.style } };
    if (output === 'pyrography') Object.assign(prev.style, { headColor: BURN, textColor: BURN });
    else if (prev.style.headColor === BURN) Object.assign(prev.style, { headColor: prev.style.certHead || COLORS[1][0], textColor: prev.style.certText || COLORS[0][0], outline: false });
    Promise.all([
      loadStyle(prev.style.lettering),
      photoLayerOn(prev) ? photoUrl(prev.photo, 260).then((u) => (prev._photoHref = u)).catch(() => {}) : null,
    ]).then(() => { thumb.innerHTML = svgMarkup(prev, { interactive: false }); });
  } else if (v?.url || pr.artUrl) thumb.style.backgroundImage = `url("${v?.url || pr.artUrl}")`;
  const award = pr.preview?.text?.title || pr.title;
  card.querySelector('b').textContent = pr.name || award;
  card.querySelector('small').textContent = (pr.name ? award + ' · ' : '') + (example ? 'Example' : timeAgo(pr.updatedAt));
  const open = () => (example ? copyExample(pr.id, output) : openProject(pr.id, { output }));
  card.querySelector('.proj-open').addEventListener('click', open);
  card.querySelector('.proj-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    $$('.proj-actions').forEach((m) => m.remove());
    const m = document.createElement('div');
    m.className = 'proj-actions';
    m.innerHTML = example
      ? `<button type="button" data-a="open">Open a copy</button>${admin ? '<button type="button" class="danger" data-a="unshare">Remove from Examples</button>' : ''}`
      : `<button type="button" data-a="open">Open</button><button type="button" data-a="dup">Duplicate</button>${admin ? '<button type="button" data-a="share">Add to Examples</button>' : ''}<button type="button" class="danger" data-a="del">Delete</button>`;
    m.addEventListener('click', async (ev) => {
      const a = ev.target.dataset.a;
      m.remove();
      if (a === 'open') open();
      if (a === 'share') {
        try { await api('/api/examples', { method: 'POST', body: { projectId: pr.id } }); toast('Added to Examples for everyone ✓'); openProjects(); }
        catch (e2) { toast('Couldn’t add it: ' + e2.message, { error: true }); }
      }
      if (a === 'unshare' && confirm(`Remove “${pr.name || pr.title}” from Examples for everyone? Copies people already made stay theirs.`)) {
        try { await api(`/api/examples/${pr.id}`, { method: 'DELETE' }); openProjects(); }
        catch (e2) { toast('Couldn’t remove it: ' + e2.message, { error: true }); }
      }
      if (example) return;
      if (a === 'dup') duplicateProject(pr.id);
      const warn = both ? `\n\nThis also deletes its ${other === 'pyrography' ? 'wood-burning pattern' : 'color certificate'} version.` : '';
      if (a === 'del' && confirm(`Delete “${pr.name || pr.title}”? This can’t be undone.${warn}`)) {
        await api(`/api/projects/${pr.id}`, { method: 'DELETE' });
        if (state.project?.id === pr.id) newDesign();
        openProjects();
      }
    });
    card.appendChild(m);
  });
  return card;
}
document.addEventListener('click', (e) => { if (!e.target.closest('.proj-actions, .proj-menu')) $$('.proj-actions').forEach((m) => m.remove()); });

function migrate(p) {
  const b = blankProject(p.idea || '', p.output || 'certificate');
  return { ...b, ...p, text: { ...b.text, ...(p.text || {}) }, style: { ...b.style, ...(p.style || {}) }, plan: { ...b.plan, ...(p.plan || {}) }, artHistory: p.artHistory || (p.art ? [p.art] : []) };
}

async function openProject(id, { quiet = false, output } = {}) {
  try {
    const { project } = await api(`/api/projects/${id}`);
    const p = migrate(project);
    // opened from a section: show that section's version (latest artwork of that kind)
    if (output && p.art && (p.art.output || 'certificate') !== output) {
      const v = [...p.artHistory].reverse().find((a) => (a.output || 'certificate') === output);
      if (v) useArtVersion(p, v);
    }
    loadIntoEditor(p);
    closeSheet();
    setSaveState('', '<b>Saved</b> to your account');
    if (!quiet) toast('Opened “' + (project.text?.name || project.title) + '”');
  } catch (e) {
    if (!quiet) toast('Couldn’t open that project: ' + e.message, { error: true });
    throw e;
  }
}

function loadIntoEditor(p) {
  state.project = p;
  state.pendingLayout = null;
  try { localStorage.setItem(LAST_KEY, p.id); } catch {}
  setView('editor');
  stageOverlay(null);
  setArtStatus(null);
  if (!p.art && !p.plainBg) {
    setArtStatus('err', `<span>This design has no artwork yet.</span><button class="ghost-btn small" id="retryArt3">Create artwork</button><button class="text-btn" id="noArt3">Use no artwork</button>`);
    $('#retryArt3')?.addEventListener('click', () => generateArt());
    $('#noArt3')?.addEventListener('click', () => $('#noArtBtn').click());
  }
  fillForm();
  render();
  // older designs: measure the empty area once
  if (p.art && !p.art.zone) fitZone(p.art).then(() => { if (p.art.zone && state.project === p) { render(); markDirty(); } });
}

// Opening an example: the server copies it (with its images) into the user's account
async function copyExample(id, output) {
  toast('Making your own copy…', { ms: 1500 });
  try {
    await saveNow();
    const { project } = await api(`/api/examples/${id}/copy`, { method: 'POST' });
    const p = migrate(project);
    if (output && p.art && (p.art.output || 'certificate') !== output) {
      const v = [...p.artHistory].reverse().find((a) => (a.output || 'certificate') === output);
      if (v) useArtVersion(p, v);
    }
    loadIntoEditor(p);
    closeSheet();
    markDirty();
    toast('This is your own copy of the example — change anything you like. It’s saved in My projects.', { ms: 4200 });
  } catch (e) {
    toast('Couldn’t open that example: ' + e.message, { error: true });
  }
}

async function duplicateProject(id) {
  try {
    const { project } = await api(`/api/projects/${id}`);
    const copy = migrate({ ...project, id: newId(), createdAt: Date.now(), title: project.title + ' (copy)' });
    loadIntoEditor(copy);
    closeSheet();
    markDirty();
    toast('Copy created — edit away.');
  } catch (e) {
    toast('Couldn’t duplicate: ' + e.message, { error: true });
  }
}

// ---------------- auth ----------------
let authMode = 'login';
// modes: login · signup · forgot (email me a link) · reset (opened from the emailed link)
function setAuthMode(m) {
  authMode = m;
  const pair = m === 'login' || m === 'signup';
  $$('#authSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  $('#authSeg').hidden = !pair;
  $('#authEmailRow').hidden = m === 'reset';
  $('#authPassRow').hidden = m === 'forgot';
  $('#authPassLabel').textContent = m === 'reset' ? 'New password' : 'Password';
  $('#authSubmit').textContent = { login: 'Sign in', signup: 'Create account', forgot: 'Email me a reset link', reset: 'Set new password' }[m];
  $('#authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authPass').placeholder = m === 'login' ? '' : 'At least 8 characters';
  $('#authForgotBtn').hidden = m !== 'login';
  $('#authBackBtn').hidden = pair;
  $('#authError').hidden = true;
  $('#authOk').hidden = true;
  $('#authSubmit').hidden = false;
  if (pair) $('#authTitle').textContent = state.afterAuth ? 'Sign in to design' : 'Sign in';
  else $('#authTitle').textContent = m === 'forgot' ? 'Reset your password' : 'Choose a new password';
  $('#authLede').textContent = {
    forgot: 'Enter the email you signed up with and we’ll send you a link to choose a new password.',
    reset: 'Choose a new password for your account. You’ll be signed in right after.',
  }[m] || 'Your designs are saved to your account, so you can return to them on any device.';
  const invite = state.config?.signup !== 'open';
  $('#authFine').textContent = m === 'signup' && invite ? 'Accounts are invite-only during testing. Use the email the site owner added.' : '';
}
$('#authForgotBtn').addEventListener('click', () => {
  setAuthMode('forgot');
  $('#authEmail').focus();
});
$('#authBackBtn').addEventListener('click', () => { setAuthMode('login'); $('#authEmail').focus(); });

// opened from the reset email: /?reset=<token>
const resetToken = new URLSearchParams(location.search).get('reset');
if (resetToken) {
  history.replaceState(null, '', location.pathname); // keep the token out of history and shares
  state.resetToken = resetToken;
  setAuthMode('reset');
  openSheet('authSheet');
  setTimeout(() => $('#authPass').focus(), 60);
}
$$('#authSeg button').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));

function needAuth(then) {
  state.afterAuth = then || null;
  setAuthMode(authMode === 'signup' ? 'signup' : 'login'); // a forgot/reset step left open earlier starts over
  $('#authTitle').textContent = then ? 'Sign in to design' : 'Sign in';
  openSheet('authSheet');
  // only if they haven't started typing — otherwise a fast typist's (or password manager's)
  // password would be pulled into the email box
  setTimeout(() => { if (!$('#authSheet').contains(document.activeElement)) $('#authEmail').focus(); }, 60);
}

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  const btn = $('#authSubmit');
  btn.disabled = true;
  $('#authError').hidden = true;
  if (authMode === 'forgot') {
    try {
      const r = await api('/api/auth/forgot', { method: 'POST', body: { email } });
      if (r.devLink) console.log('reset link (test server):', r.devLink), (window.__rs.lastResetLink = r.devLink);
      $('#authOk').textContent = `If there’s an account for ${email}, a reset link is on its way. It works for 1 hour — check your spam folder if it hasn’t arrived in a few minutes.`;
      $('#authOk').hidden = false;
      $('#authSubmit').hidden = true;
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').hidden = false;
    } finally { btn.disabled = false; }
    return;
  }
  try {
    const { user } = authMode === 'reset'
      ? await api('/api/auth/reset', { method: 'POST', body: { token: state.resetToken, password } })
      : await api(`/api/auth/${authMode === 'login' ? 'login' : 'signup'}`, { method: 'POST', body: { email, password } });
    if (authMode === 'reset') { state.resetToken = null; toast('Password updated — you’re signed in.'); }
    state.user = user;
    await loadConfig();
    closeSheet();
    $('#authPass').value = '';
    if (authMode !== 'reset') toast(authMode === 'login' ? 'Signed in.' : 'Account created — welcome!');
    setAuthMode('login');
    const next = state.afterAuth;
    state.afterAuth = null;
    if (state.project && state.save.dirty) saveNow();
    if (next) next();
    else if (!state.project) restoreLast();
  } catch (err) {
    $('#authError').textContent = err.message;
    $('#authError').hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$('#accountBtn').addEventListener('click', () => {
  if (!state.user) return needAuth();
  $('#acctEmail').textContent = state.user.email;
  const u = state.config?.usage;
  $('#acctUsage').textContent = state.config?.mode === 'test' ? 'Server is in test mode (placeholder artwork, no AI cost).' : u ? (u.accountArtLimit != null ? `AI artwork designs used: ${u.artTotal} of ${u.accountArtLimit}.` : `Artwork designs used in the last 24 hours: ${u.artToday} of ${u.dailyArtLimit} (no account total).`) : '';
  openSheet('accountSheet');
});
$('#signOutBtn').addEventListener('click', async () => {
  await saveNow();
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.user = null;
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(LAST_KEY); } catch {}
  closeSheet();
  newDesign();
  syncAccountUi();
  toast('Signed out.');
});

function syncAccountUi() {
  const u = state.user;
  const b = $('#accountBtn');
  b.innerHTML = u
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span></span>`
    : '<span>Sign in</span>';
  if (u) b.querySelector('span').textContent = u.email.split('@')[0];
  b.title = u ? u.email : '';
  b.setAttribute('aria-label', u ? `Account (${u.email})` : 'Sign in');
  b.classList.toggle('signed-in', !!u);
  $('#projectsBtn').hidden = !u;
}

async function loadConfig() {
  state.config = await api('/api/config');
  state.user = state.config.user;
  $('#modeBadge').hidden = state.config.mode !== 'test';
  syncAccountUi();
}

async function restoreLast() {
  let last = null, draft = null;
  try { last = localStorage.getItem(LAST_KEY); draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch {}
  if (!last) return;
  try {
    await openProject(last, { quiet: true });
    // if this device has newer unsaved edits, keep them
    if (draft && draft.id === last && draft.updatedAt > (state.project.updatedAt || 0)) {
      loadIntoEditor(migrate(draft));
      markDirty();
      toast('Restored your latest edits from this device.');
    }
  } catch {
    if (draft && draft.id === last) {
      loadIntoEditor(migrate(draft));
      markDirty();
      toast('Opened the copy saved on this device.');
    }
  }
}

// ---------------- boot ----------------
(async function boot() {
  buildStyleGrid();
  buildSwatches($('#headSwatches'), 'headColor');
  buildSwatches($('#textSwatches'), 'textColor');
  buildLayoutChips();
  buildPhotoChips();
  setView('start');
  loadLibrary().catch(() => {});
  try {
    await loadConfig();
  } catch (e) {
    toast('Can’t reach the server: ' + e.message, { error: true, ms: 6000 });
    return;
  }
  if (state.user) {
    await restoreLast();
    resumePendingArt();
  }
})();

// expose for automated testing
window.__rs = { state, render, renderPdf, renderPng };
