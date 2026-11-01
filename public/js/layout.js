// Lettering layout engine. Produces positioned text items in a 1500 x 1000 design space
// (landscape) or 1000 x 1500 (portrait).
// The SVG preview, PNG export and PDF export all draw from this one result.
import { STYLES, cssFamily } from './fonts.js';
import { photoAspect, photoLayerOn } from './photo.js';

export const DESIGN_W = 1500; // landscape design space (portrait swaps the two)
export const DESIGN_H = 1000;

// Page orientation: the artwork's own shape wins; with no artwork yet, the project's choice.
export const orientOf = (p) => ((p?.art ? p.art.orient : p?.orient) === 'portrait' ? 'portrait' : 'landscape');
export const dims = (p) => (orientOf(p) === 'portrait' ? { W: DESIGN_H, H: DESIGN_W } : { W: DESIGN_W, H: DESIGN_H });

// open lettering area for each AI composition (design-space units)
export const ZONES = {
  framed: { x: 285, y: 175, w: 930, h: 650 },
  crest: { x: 210, y: 330, w: 1080, h: 560 },
  'art-left': { x: 590, y: 125, w: 790, h: 750 },
  'art-right': { x: 120, y: 125, w: 790, h: 750 },
  scene: { x: 190, y: 110, w: 1120, h: 520 },
};
// same compositions on a tall page (1000 x 1500)
export const ZONES_PORTRAIT = {
  framed: { x: 180, y: 235, w: 640, h: 1030 },
  crest: { x: 130, y: 530, w: 740, h: 850 },
  'art-left': { x: 340, y: 140, w: 580, h: 1220 },
  'art-right': { x: 80, y: 140, w: 580, h: 1220 },
  scene: { x: 120, y: 120, w: 760, h: 760 },
};
export const zonesFor = (orient) => (orient === 'portrait' ? ZONES_PORTRAIT : ZONES);

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

// ---- designs with no artwork: plain paper, optional app-drawn border, photo and words ----
export const plainOn = (p) => !!(p && !p.art && p.plainBg);
export function plainPaper(p) {
  const pyro = p.output === 'pyrography';
  return {
    fill: pyro || p.style?.paper === 'white' ? '#ffffff' : '#faf6ec',
    border: p.style?.border !== false,
    color: p.style?.headColor || '#2a2a3a',
    rules: [{ inset: 40, width: 6 }, { inset: 58, width: 1.8 }], // classic double rule
  };
}
const PLAIN_ZONE = { x: 120, y: 105, w: 1260, h: 790 };
const PLAIN_ZONE_PORTRAIT = { x: 105, y: 130, w: 790, h: 1240 };

export function zoneFor(project) {
  // measured empty area of the actual artwork wins over the nominal layout area
  const portrait = orientOf(project) === 'portrait';
  const Z = portrait ? ZONES_PORTRAIT : ZONES;
  const { W: DW, H: DH } = dims(project);
  const z = project?.art?.zone || (plainOn(project) ? (portrait ? PLAIN_ZONE_PORTRAIT : PLAIN_ZONE) : null) || Z[project?.art?.layout || project?.plan?.layout] || Z.framed;
  const st = project.style || {};
  const ws = st.widthScale || 1;
  const w = Math.min(z.w * ws, DW - 120);
  const x = Math.max(60, Math.min(z.x + (z.w - w) / 2 + (st.offsetX || 0), DW - 60 - w));
  const y = Math.max(40, Math.min(z.y + (st.offsetY || 0), DH - 40 - z.h * 0.6));
  const h = Math.min(z.h, DH - 40 - y);
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
  // on a plain design with a border, a full-size photo stops inside the border
  // usable page inside the edge (the photo may grow over the artwork, but not off the paper)
  const { W: DW, H: DH } = dims(project);
  const PAGE = plainOn(project) && plainPaper(project).border ? { x: 78, y: 72, w: DW - 156, h: DH - 144 } : { x: 60, y: 50, w: DW - 120, h: DH - 100 };
  const minTextW = DW * 0.32, minTextH = DH * 0.3;

  if (ph.place === 'top') {
    const h0 = Math.min(full.h * 0.36, (full.w * 0.45) / a);
    let hMax = PAGE.h * 0.55;
    if (hMax * a > PAGE.w * 0.8) hMax = (PAGE.w * 0.8) / a;
    const h = size <= 1 ? h0 * size : lerp(h0, hMax, t);
    const w = h * a;
    const y = lerp(full.y, PAGE.y, t);
    const photo = { x: full.x + full.w / 2 - w / 2, y, w, h };
    const gap = DH * 0.02;
    const ty = y + h + gap;
    let bottom = full.y + full.h;
    if (bottom - ty < minTextH) bottom = Math.min(PAGE.y + PAGE.h, ty + minTextH);
    return { photo, zone: { x: full.x, y: ty, w: full.w, h: Math.max(40, bottom - ty) } };
  }

  // left / right
  const h0 = Math.min((full.w * 0.36) / a, full.h * 0.78);
  let hMax = PAGE.h;
  if (hMax * a > DW * 0.46) hMax = (DW * 0.46) / a;
  const h = size <= 1 ? h0 * size : lerp(h0, hMax, t);
  const w = h * a;
  const cy = lerp(full.y + full.h / 2, PAGE.y + PAGE.h / 2, t);
  const y = Math.min(PAGE.y + PAGE.h - h, Math.max(PAGE.y, cy - h / 2));
  const gap = DW * 0.025;
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
  // on a tall page the open area is tall for its width: size type up so the words fill it (the
  // fit loop below still shrinks anything that doesn't fit), and let titles/messages wrap more
  const tall = orientOf(project) === 'portrait';
  const grow = tall ? Math.min(1.5, Math.max(1, Math.sqrt(zone.h / zone.w / 0.6))) : 1;
  const U = (beside ? Math.max(W, full.w * 0.78) : W) * grow;
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
    // a tall page is narrow: two signers + a date would squeeze three columns, so the date gets its own row
    const rows = tall && cols.length === 3 ? [cols.filter((c) => !c.date), cols.filter((c) => c.date)] : [cols];
    const rowH = nameSize * 1.25 + roleSize * 1.9 + nameSize * 0.6;
    const fit = (text, font, size, track, maxW) => {
      const wd = measure(text, font, size, track);
      return wd > maxW ? size * (maxW / wd) : size;
    };
    rows.forEach((row, ri) => {
      const colW = Math.min((W * 0.88) / row.length, W * (tall ? 0.46 : 0.4));
      const totalW = colW * row.length;
      const y0 = ri * (rowH + nameSize * 0.5);
      row.forEach((c, i) => {
        const x = cx - totalW / 2 + colW * (i + 0.5);
        const lineY = y0 + nameSize * 1.25 + nameSize * 0.3;
        const ruleW = colW * 0.78;
        const roleS = roleSize * S.small.k;
        if (c.date) {
          items.push({ field: 'date', text: date, font: S.body.f, size: fit(date, S.body.f, nameSize * S.body.k, 0, colW * 0.96), x, y: y0 + nameSize * 1.1, track: 0, color: body });
          rules.push({ x1: x - ruleW / 2, x2: x + ruleW / 2, y: lineY, color: body });
          items.push({ field: 'date', text: prep('Date', 'small'), font: S.small.f, size: roleS, x, y: lineY + roleSize * 1.45, track: S.small.track || 0, color: body });
          return;
        }
        // long signer names and titles shrink to their own column rather than running into the next one
        if (c.name) items.push({ field: c.fName, text: c.name, font: S.lead.f, size: fit(c.name, S.lead.f, nameSize * S.lead.k, 0, colW * 0.96), x, y: y0 + nameSize * 1.1, track: 0, color: body });
        rules.push({ x1: x - ruleW / 2, x2: x + ruleW / 2, y: lineY, color: body });
        if (c.role) {
          const rt = prep(c.role, 'small');
          items.push({ field: c.fRole, text: rt, font: S.small.f, size: fit(rt, S.small.f, roleS, S.small.track || 0, colW * 0.94), x, y: lineY + roleSize * 1.45, track: S.small.track || 0, color: body });
        }
      });
    });
    const h = rowH * rows.length + nameSize * 0.5 * (rows.length - 1);
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
    push('title', 'title', val('title'), 0.068, head, beside || tall ? 3 : 2, 0.022);
    push('presented', 'lead', val('presented'), 0.03, body, 1, 0.006);
    push('name', 'name', val('name') || (project._placeholders ? 'Recipient Name' : ''), 0.084, head, 1, 0.026);
    push('body', 'body', val('body'), 0.03, body, beside ? 8 : tall ? 7 : 5, 0.014);
    push('details', 'small', val('details'), 0.022, body, 2, 0);
    let h = 0;
    for (const p of parts) h += p.lines.length * p.size * p.lh + p.gapAfter;
    return { parts, h };
  }

  // shrink until it fits; the floor keeps body text at least ~14 design units (≈7.5 pt on Letter),
  // so a wide, short open area (a scene across the top) can go smaller than a narrow one
  const minScale = Math.min(0.55, Math.max(0.25, 14 / (0.03 * U * userScale)));
  let scale = 1;
  let top, bot;
  for (let i = 0; i < 40; i++) {
    top = topStack(scale);
    bot = bottomBlock(scale);
    const gap = bot.h ? U * 0.04 * scale : 0;
    if (top.h + gap + bot.h <= zone.h || scale < minScale) break;
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
