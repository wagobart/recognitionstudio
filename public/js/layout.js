// Lettering layout engine. Produces positioned text items in a 1500 x 1000 design space.
// The SVG preview, PNG export and PDF export all draw from this one result.
import { STYLES, cssFamily } from './fonts.js';
import { photoAspect, photoLayerOn } from './photo.js';

export const DESIGN_W = 1500;
export const DESIGN_H = 1000;

// open lettering area for each AI composition (design-space units)
export const ZONES = {
  framed: { x: 285, y: 175, w: 930, h: 650 },
  crest: { x: 210, y: 330, w: 1080, h: 560 },
  'art-left': { x: 590, y: 125, w: 790, h: 750 },
  'art-right': { x: 120, y: 125, w: 790, h: 750 },
  scene: { x: 190, y: 110, w: 1120, h: 520 },
};

export const LAYOUT_LABELS = {
  framed: 'Framed',
  crest: 'Crest on top',
  'art-left': 'Art on the left',
  'art-right': 'Art on the right',
  scene: 'Scene along bottom',
};

let ctx;
function measure(text, fontKey, size, track = 0) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${size}px ${cssFamily(fontKey)}`;
  return ctx.measureText(text).width + track * size * Math.max(0, [...text].length - 1);
}

function wrap(text, fontKey, size, maxW, track) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || measure(t, fontKey, size, track) <= maxW) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function zoneFor(project) {
  // measured empty area of the actual artwork wins over the nominal layout area
  const z = project?.art?.zone || ZONES[project?.art?.layout || project?.plan?.layout] || ZONES.framed;
  const st = project.style || {};
  const ws = st.widthScale || 1;
  const w = Math.min(z.w * ws, DESIGN_W - 120);
  const x = Math.max(60, Math.min(z.x + (z.w - w) / 2 + (st.offsetX || 0), DESIGN_W - 60 - w));
  const y = Math.max(40, Math.min(z.y + (st.offsetY || 0), DESIGN_H - 40 - z.h * 0.6));
  const h = Math.min(z.h, DESIGN_H - 40 - y);
  return { x, y, w, h };
}

/**
 * @returns {{items: Array, rules: Array, zone: object, photo: object|null, fitScale: number}}
 * item: { field, text, font, size, x, y (baseline), track, color, role }
 */
/**
 * A photo layer lives inside the empty area: beside the words (left/right) or above them (top).
 * Returns the photo's box and the smaller area left for the lettering.
 */
// usable page inside the edge (the photo may grow over the artwork, but not off the paper)
const PAGE = { x: 60, y: 50, w: DESIGN_W - 120, h: DESIGN_H - 100 };
export const PHOTO_SIZE_MAX = 2;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Photo box + the area left for the lettering. Up to 100% the photo sits inside the open area
 * (beside or above the words). Past 100% it grows out over the artwork toward the page edge, and
 * at the maximum it fills that whole side (or the top) of the page; the lettering moves over.
 */
export function splitForPhoto(project, full) {
  if (!photoLayerOn(project)) return { photo: null, zone: full };
  const ph = project.photo;
  const a = photoAspect(ph);
  const size = Math.min(PHOTO_SIZE_MAX, Math.max(0.5, ph.size || 1));
  const t = Math.max(0, (size - 1) / (PHOTO_SIZE_MAX - 1)); // 0 = inside the open area, 1 = full side
  const minTextW = DESIGN_W * 0.32, minTextH = DESIGN_H * 0.3;

  if (ph.place === 'top') {
    const h0 = Math.min(full.h * 0.36, (full.w * 0.45) / a);
    let hMax = PAGE.h * 0.55;
    if (hMax * a > PAGE.w * 0.8) hMax = (PAGE.w * 0.8) / a;
    const h = size <= 1 ? h0 * size : lerp(h0, hMax, t);
    const w = h * a;
    const y = lerp(full.y, PAGE.y, t);
    const photo = { x: full.x + full.w / 2 - w / 2, y, w, h };
    const gap = DESIGN_H * 0.02;
    const ty = y + h + gap;
    let bottom = full.y + full.h;
    if (bottom - ty < minTextH) bottom = Math.min(PAGE.y + PAGE.h, ty + minTextH);
    return { photo, zone: { x: full.x, y: ty, w: full.w, h: Math.max(40, bottom - ty) } };
  }

  // left / right
  const h0 = Math.min((full.w * 0.36) / a, full.h * 0.78);
  let hMax = PAGE.h;
  if (hMax * a > DESIGN_W * 0.46) hMax = (DESIGN_W * 0.46) / a;
  const h = size <= 1 ? h0 * size : lerp(h0, hMax, t);
  const w = h * a;
  const cy = lerp(full.y + full.h / 2, PAGE.y + PAGE.h / 2, t);
  const y = Math.min(PAGE.y + PAGE.h - h, Math.max(PAGE.y, cy - h / 2));
  const gap = DESIGN_W * 0.025;
  if (ph.place === 'right') {
    const right = lerp(full.x + full.w, PAGE.x + PAGE.w, t);
    const photo = { x: right - w, y, w, h };
    const tr = photo.x - gap;
    let left = full.x;
    if (tr - left < minTextW) left = Math.max(PAGE.x, tr - minTextW);
    return { photo, zone: { x: left, y: full.y, w: Math.max(80, tr - left), h: full.h } };
  }
  const photo = { x: lerp(full.x, PAGE.x, t), y, w, h };
  const tl = photo.x + w + gap;
  let right = full.x + full.w;
  if (right - tl < minTextW) right = Math.min(PAGE.x + PAGE.w, tl + minTextW);
  return { photo, zone: { x: tl, y: full.y, w: Math.max(80, right - tl), h: full.h } };
}

export function computeLayout(project) {
  const t = project.text || {};
  const st = project.style || {};
  const S = STYLES[st.lettering] || STYLES.classic;
  const full = zoneFor(project);
  const { photo, zone } = splitForPhoto(project, full);
  const W = zone.w;
  // type size unit: with a photo beside the words, keep lettering near full size and let it wrap
  // onto more lines (there is height to spare) instead of shrinking everything to the narrow column
  const beside = !!photo && project.photo.place !== 'top';
  const U = beside ? Math.max(W, full.w * 0.78) : W;
  const userScale = st.scale || 1;
  const head = st.headColor || '#2a2a3a';
  const body = st.textColor || '#2b2b33';
  const cx = zone.x + zone.w / 2;

  const val = (k) => String(t[k] || '').trim();
  const role = (r, k) => S[r];
  const prep = (s, r) => (S[r].caps ? s.toUpperCase() : s);

  // ---- bottom block: signatures and date ----
  const sigs = [
    { name: val('sig1Name'), role: val('sig1Role'), fName: 'sig1Name', fRole: 'sig1Role' },
    { name: val('sig2Name'), role: val('sig2Role'), fName: 'sig2Name', fRole: 'sig2Role' },
  ].filter((s) => s.name || s.role); // a role with no name = blank line to sign by hand
  const date = val('date');
  const cols = [...sigs];
  if (date && cols.length) cols.splice(cols.length === 1 ? 0 : 1, 0, { date });

  function bottomBlock(scale) {
    const items = [];
    const rules = [];
    if (!cols.length && !date) return { items, rules, h: 0 };
    const nameSize = 0.03 * U * scale * userScale;
    const roleSize = 0.021 * U * scale * userScale;
    if (!cols.length) {
      // date only
      const s = nameSize * S.body.k;
      items.push({ field: 'date', text: date, font: S.body.f, size: s, x: cx, y: 0, track: 0, color: body });
      return { items, rules, h: s * 1.3 };
    }
    const colW = Math.min((W * 0.88) / cols.length, W * 0.4);
    const totalW = colW * cols.length;
    const h = nameSize * 1.25 + roleSize * 1.9 + nameSize * 0.6;
    cols.forEach((c, i) => {
      const x = cx - totalW / 2 + colW * (i + 0.5);
      const lineY = nameSize * 1.25 + nameSize * 0.3;
      const ruleW = colW * 0.78;
      if (c.date) {
        items.push({ field: 'date', text: date, font: S.body.f, size: nameSize * S.body.k, x, y: nameSize * 1.1, track: 0, color: body });
        rules.push({ x1: x - ruleW / 2, x2: x + ruleW / 2, y: lineY, color: body });
        items.push({ field: 'date', text: prep('Date', 'small'), font: S.small.f, size: roleSize * S.small.k, x, y: lineY + roleSize * 1.45, track: S.small.track || 0, color: body });
        return;
      }
      if (c.name) items.push({ field: c.fName, text: c.name, font: S.lead.f, size: nameSize * S.lead.k, x, y: nameSize * 1.1, track: 0, color: body });
      rules.push({ x1: x - ruleW / 2, x2: x + ruleW / 2, y: lineY, color: body });
      if (c.role) items.push({ field: c.fRole, text: prep(c.role, 'small'), font: S.small.f, size: roleSize * S.small.k, x, y: lineY + roleSize * 1.45, track: S.small.track || 0, color: body });
    });
    return { items, rules, h };
  }

  // ---- top stack ----
  function topStack(scale) {
    const k = scale * userScale;
    const parts = [];
    const push = (field, r, text, base, color, maxLines, gapAfter) => {
      if (!text) return;
      const R = S[r];
      let size = base * U * k * R.k;
      const s = prep(text, r);
      const track = R.track || 0;
      const maxW = W * (r === 'body' ? 0.9 : 0.96);
      let lines = wrap(s, R.f, size, maxW, track);
      // single-line elements shrink to fit instead of wrapping
      if (maxLines === 1) {
        lines = [s];
        const wd = measure(s, R.f, size, track);
        if (wd > maxW) size *= maxW / wd;
      } else if (lines.length > maxLines) {
        while (lines.length > maxLines && size > base * U * k * R.k * 0.6) {
          size *= 0.94;
          lines = wrap(s, R.f, size, maxW, track);
        }
      }
      parts.push({ field, font: R.f, size, lines, track, color, gapAfter: gapAfter * U * k, lh: r === 'body' ? 1.32 : 1.12 });
    };
    push('kicker', 'kicker', val('kicker'), 0.024, head, 1, 0.012);
    push('title', 'title', val('title'), 0.068, head, beside ? 3 : 2, 0.022);
    push('presented', 'lead', val('presented'), 0.03, body, 1, 0.006);
    push('name', 'name', val('name') || (project._placeholders ? 'Recipient Name' : ''), 0.084, head, 1, 0.026);
    push('body', 'body', val('body'), 0.03, body, beside ? 8 : 5, 0.014);
    push('details', 'small', val('details'), 0.022, body, 2, 0);
    let h = 0;
    for (const p of parts) h += p.lines.length * p.size * p.lh + p.gapAfter;
    return { parts, h };
  }

  let scale = 1;
  let top, bot;
  for (let i = 0; i < 18; i++) {
    top = topStack(scale);
    bot = bottomBlock(scale);
    const gap = bot.h ? U * 0.04 * scale : 0;
    if (top.h + gap + bot.h <= zone.h || scale < 0.55) break;
    scale *= 0.95;
  }

  const items = [];
  const rules = [];
  const gap = bot.h ? U * 0.04 * scale : 0;
  const avail = zone.h - bot.h - gap;
  let y = zone.y + Math.max(0, (avail - top.h) / 2);
  // if there is no bottom block, center the whole stack
  if (!bot.h) y = zone.y + Math.max(0, (zone.h - top.h) / 2);
  for (const p of top.parts) {
    for (const line of p.lines) {
      const asc = p.size * 0.9;
      items.push({ field: p.field, text: line, font: p.font, size: p.size, x: cx, y: y + asc, track: p.track, color: p.color, placeholder: p.field === 'name' && !val('name') });
      y += p.size * p.lh;
    }
    if (p.field === 'name') {
      // ornamental rule under the name, clear of descenders
      y += p.size * 0.14;
      rules.push({ x1: cx - W * 0.2, x2: cx + W * 0.2, y, color: head, ornament: true });
    }
    y += p.gapAfter;
  }
  const by = zone.y + zone.h - bot.h;
  for (const it of bot.items) items.push({ ...it, y: it.y + by });
  for (const r of bot.rules) rules.push({ ...r, y: r.y + by });
  return { items, rules, zone, photo, fitScale: scale };
}
