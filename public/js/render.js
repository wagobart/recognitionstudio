// Three renderers fed by the same layout: live SVG preview, PNG (canvas) and PDF (pdf-lib).
import { computeLayout, dims, plainOn, plainPaper } from './layout.js';
import { cssFamily, fontBuffer, loadStyle } from './fonts.js';
import { photoPngBytes } from './photo.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ornament(r, outline) {
  // small diamond flourish centered on a hairline
  const cx = (r.x1 + r.x2) / 2;
  const s = 7;
  return `<line x1="${r.x1}" y1="${r.y}" x2="${cx - s * 2.2}" y2="${r.y}" stroke="${r.color}" stroke-width="1.6" stroke-linecap="round"/>
<line x1="${cx + s * 2.2}" y1="${r.y}" x2="${r.x2}" y2="${r.y}" stroke="${r.color}" stroke-width="1.6" stroke-linecap="round"/>
<path d="M${cx - s} ${r.y} L${cx} ${r.y - s} L${cx + s} ${r.y} L${cx} ${r.y + s} Z" fill="${outline ? 'none' : r.color}" stroke="${r.color}" stroke-width="1.4"/>`;
}

export function svgMarkup(project, { interactive = true, artHref } = {}) {
  const { items, rules, zone, photo } = computeLayout(project);
  const { W: DESIGN_W, H: DESIGN_H } = dims(project);
  const outline = project.output === 'pyrography' && project.style?.outline;
  const href = artHref ?? project.art?.url;
  // photo layer: the finished image is prepared asynchronously (project._photoHref); until then a soft placeholder
  const photoEl = !photo
    ? ''
    : project._photoHref
      ? `<image data-field="photo" href="${esc(project._photoHref)}" x="${photo.x.toFixed(1)}" y="${photo.y.toFixed(1)}" width="${photo.w.toFixed(1)}" height="${photo.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect data-field="photo" x="${photo.x}" y="${photo.y}" width="${photo.w}" height="${photo.h}" rx="${Math.min(photo.w, photo.h) / 2}" fill="rgba(120,120,120,0.12)"/>`;
  const pp = plainOn(project) ? plainPaper(project) : null;
  const art = href
    ? `<image href="${esc(href)}" x="0" y="0" width="${DESIGN_W}" height="${DESIGN_H}" preserveAspectRatio="xMidYMid slice"/>`
    : pp
      ? `<rect width="${DESIGN_W}" height="${DESIGN_H}" fill="${pp.fill}"/>` +
        (pp.border ? pp.rules.map((r) => `<rect x="${r.inset}" y="${r.inset}" width="${DESIGN_W - 2 * r.inset}" height="${DESIGN_H - 2 * r.inset}" fill="none" stroke="${pp.color}" stroke-width="${r.width}"/>`).join('') : '')
    : `<rect width="${DESIGN_W}" height="${DESIGN_H}" fill="${project.output === 'pyrography' ? '#fff' : '#f7f2e8'}"/>
       <rect x="30" y="30" width="${DESIGN_W - 60}" height="${DESIGN_H - 60}" fill="none" stroke="#d9cdb4" stroke-width="3" stroke-dasharray="14 10"/>`;
  const texts = items
    .map((it) => {
      const fill = outline ? 'none' : it.color;
      const stroke = outline ? ` stroke="${it.color}" stroke-width="${Math.max(1.2, it.size * 0.03)}"` : '';
      const ls = it.track ? ` letter-spacing="${(it.track * it.size).toFixed(2)}"` : '';
      const ph = it.placeholder ? ' opacity="0.38"' : '';
      return `<text data-field="${it.field}" x="${it.x.toFixed(1)}" y="${it.y.toFixed(1)}" font-family='${cssFamily(it.font)}' font-size="${it.size.toFixed(2)}" text-anchor="middle" fill="${fill}"${stroke}${ls}${ph}>${esc(it.text)}</text>`;
    })
    .join('');
  const lines = rules
    .map((r) => (r.ornament ? ornament(r, outline) : `<line x1="${r.x1}" y1="${r.y}" x2="${r.x2}" y2="${r.y}" stroke="${r.color}" stroke-width="1.6"/>`))
    .join('');
  const guide = interactive && project._showZone
    ? `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" fill="rgba(80,120,255,0.07)" stroke="#4f7cff" stroke-width="3" stroke-dasharray="12 8" rx="8"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DESIGN_W} ${DESIGN_H}" class="design-svg">${art}${guide}${photoEl}${lines}${texts}</svg>`;
}

// ---------- shared: get artwork as raster bytes ----------
async function loadImage(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

async function artRaster(project, targetW = 3000) {
  const url = project.art?.url;
  if (!url) return null;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Artwork could not be loaded (' + res.status + ')');
  const type = res.headers.get('content-type') || '';
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (/png/.test(type)) return { bytes, type: 'png' };
  if (/jpe?g/.test(type)) return { bytes, type: 'jpg' };
  // svg (test artwork) or webp: rasterize through canvas
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: type || 'image/svg+xml' }));
  try {
    const img = await loadImage(blobUrl);
    const c = document.createElement('canvas');
    c.width = targetW;
    const { W: DESIGN_W, H: DESIGN_H } = dims(project);
    c.height = Math.round(targetW * (DESIGN_H / DESIGN_W));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png' };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// ---------- PNG ----------
export async function renderPng(project, width = 3000) {
  await loadStyle(project.style.lettering);
  const { items, rules, photo } = computeLayout(project);
  const { W: DESIGN_W, H: DESIGN_H } = dims(project);
  const k = width / Math.max(DESIGN_W, DESIGN_H); // width = the long side, either orientation
  const c = document.createElement('canvas');
  c.width = Math.round(DESIGN_W * k);
  c.height = Math.round(DESIGN_H * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  const ras = await artRaster(project, width);
  if (!ras && plainOn(project)) {
    const pp = plainPaper(project);
    g.fillStyle = pp.fill;
    g.fillRect(0, 0, c.width, c.height);
    if (pp.border) {
      g.strokeStyle = pp.color;
      for (const r of pp.rules) { g.lineWidth = r.width * k; g.strokeRect(r.inset * k, r.inset * k, (DESIGN_W - 2 * r.inset) * k, (DESIGN_H - 2 * r.inset) * k); }
    }
  }
  if (ras) {
    const url = URL.createObjectURL(new Blob([ras.bytes], { type: ras.type === 'png' ? 'image/png' : 'image/jpeg' }));
    const img = await loadImage(url);
    g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
  }
  const outline = project.output === 'pyrography' && project.style?.outline;
  if (photo) {
    const bytes = await photoPngBytes(project.photo, Math.min(2000, Math.round(Math.max(photo.w, photo.h) * k * 1.2)));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const pim = await loadImage(url);
    const fit = Math.min(photo.w / pim.naturalWidth, photo.h / pim.naturalHeight);
    const pw = pim.naturalWidth * fit, ph = pim.naturalHeight * fit;
    g.drawImage(pim, (photo.x + (photo.w - pw) / 2) * k, (photo.y + (photo.h - ph) / 2) * k, pw * k, ph * k);
    URL.revokeObjectURL(url);
  }
  g.scale(k, k);
  for (const r of rules) {
    g.strokeStyle = r.color;
    g.lineWidth = 1.6;
    const cx = (r.x1 + r.x2) / 2, s = 7;
    g.beginPath();
    if (r.ornament) {
      g.moveTo(r.x1, r.y); g.lineTo(cx - s * 2.2, r.y);
      g.moveTo(cx + s * 2.2, r.y); g.lineTo(r.x2, r.y);
    } else {
      g.moveTo(r.x1, r.y); g.lineTo(r.x2, r.y);
    }
    g.stroke();
    if (r.ornament) {
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(cx - s, r.y); g.lineTo(cx, r.y - s); g.lineTo(cx + s, r.y); g.lineTo(cx, r.y + s); g.closePath();
      g.fillStyle = r.color;
      outline ? g.stroke() : g.fill();
    }
  }
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  for (const it of items) {
    if (it.placeholder) continue;
    g.font = `${it.size}px ${cssFamily(it.font)}`;
    if ('letterSpacing' in g) g.letterSpacing = it.track ? `${it.track * it.size}px` : '0px';
    if (outline) {
      g.strokeStyle = it.color;
      g.lineWidth = Math.max(1.2, it.size * 0.03);
      g.strokeText(it.text, it.x, it.y);
    } else {
      g.fillStyle = it.color;
      g.fillText(it.text, it.x, it.y);
    }
  }
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

// ---------- PDF ----------
const PAGES = { letter: [792, 612], a4: [841.89, 595.28], tabloid: [1224, 792] };

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

let libsPromise;
function loadLibs() {
  if (!libsPromise) {
    const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
    libsPromise = Promise.all([add('/vendor/pdf-lib.min.js'), add('/vendor/fontkit.umd.min.js')]).then(() => ({ PDFLib: window.PDFLib, fontkit: window.fontkit }));
  }
  return libsPromise;
}

/**
 * options: { paper: 'letter'|'a4'|'tabloid', mirror: bool (adds mirrored transfer page) }
 * returns Uint8Array
 */
export async function renderPdf(project, { paper = 'letter', mirror = false } = {}) {
  const [{ PDFLib, fontkit }] = await Promise.all([loadLibs(), loadStyle(project.style.lettering)]);
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, setCharacterSpacing, setTextRenderingMode, TextRenderingMode, setLineWidth, setStrokingRgbColor } = PDFLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const title = (project.text?.title || 'Recognition') + (project.text?.name ? ' — ' + project.text.name : '');
  doc.setTitle(title);
  doc.setCreator('Crafted In Honor');
  doc.setProducer('Crafted In Honor');

  const { items, rules, photo } = computeLayout(project);
  const fonts = {};
  for (const key of new Set(items.map((i) => i.font))) fonts[key] = await doc.embedFont(await fontBuffer(key), { subset: false });

  const ras = await artRaster(project, 3000);
  const img = ras ? (ras.type === 'png' ? await doc.embedPng(ras.bytes) : await doc.embedJpg(ras.bytes)) : null;
  // photo layer at print resolution (≈300 dpi for its printed size)
  const pimg = photo ? await doc.embedPng(await photoPngBytes(project.photo, 1800)) : null;

  const { W: DESIGN_W, H: DESIGN_H } = dims(project);
  // the paper turns to match the design (landscape pages are listed wide-first)
  let [PW, PH] = PAGES[paper] || PAGES.letter;
  if (DESIGN_H > DESIGN_W) [PW, PH] = [PH, PW];
  const margin = 18;
  const k = Math.min((PW - margin * 2) / DESIGN_W, (PH - margin * 2) / DESIGN_H);
  const AW = DESIGN_W * k, AH = DESIGN_H * k;
  const ox = (PW - AW) / 2, oy = (PH - AH) / 2;
  const outline = project.output === 'pyrography' && project.style?.outline;

  const drawAll = (page, mirrored) => {
    if (mirrored) page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, 1, PW, 0));
    if (img) page.drawImage(img, { x: ox, y: oy, width: AW, height: AH });
    // design-space (top-left origin) -> PDF (bottom-left origin)
    const X = (x) => ox + x * k;
    const Y = (y) => oy + AH - y * k;
    if (!img && plainOn(project)) {
      const pp = plainPaper(project);
      const [pr, pg, pb] = hexToRgb(pp.fill);
      page.drawRectangle({ x: ox, y: oy, width: AW, height: AH, color: rgb(pr, pg, pb) });
      if (pp.border) {
        const [br, bg, bb] = hexToRgb(pp.color);
        for (const r of pp.rules) page.drawRectangle({ x: X(r.inset), y: Y(DESIGN_H - r.inset), width: (DESIGN_W - 2 * r.inset) * k, height: (DESIGN_H - 2 * r.inset) * k, borderColor: rgb(br, bg, bb), borderWidth: r.width * k });
      }
    }
    if (pimg) {
      const fit = Math.min(photo.w / pimg.width, photo.h / pimg.height);
      const pw = pimg.width * fit, ph = pimg.height * fit;
      const px = photo.x + (photo.w - pw) / 2, py = photo.y + (photo.h - ph) / 2;
      page.drawImage(pimg, { x: X(px), y: Y(py + ph), width: pw * k, height: ph * k });
    }
    for (const r of rules) {
      const [cr, cg, cb] = hexToRgb(r.color);
      const color = rgb(cr, cg, cb);
      if (r.ornament) {
        const cx = (r.x1 + r.x2) / 2, s = 7;
        page.drawLine({ start: { x: X(r.x1), y: Y(r.y) }, end: { x: X(cx - s * 2.2), y: Y(r.y) }, thickness: 1.6 * k, color });
        page.drawLine({ start: { x: X(cx + s * 2.2), y: Y(r.y) }, end: { x: X(r.x2), y: Y(r.y) }, thickness: 1.6 * k, color });
        const d = `M ${-s * k} 0 L 0 ${-s * k} L ${s * k} 0 L 0 ${s * k} Z`;
        page.drawSvgPath(d, { x: X(cx), y: Y(r.y), color: outline ? undefined : color, borderColor: color, borderWidth: 1.4 * k });
      } else {
        page.drawLine({ start: { x: X(r.x1), y: Y(r.y) }, end: { x: X(r.x2), y: Y(r.y) }, thickness: 1.6 * k, color });
      }
    }
    for (const it of items) {
      if (it.placeholder) continue;
      const font = fonts[it.font];
      const size = it.size * k;
      const track = (it.track || 0) * size;
      const w = font.widthOfTextAtSize(it.text, size) + track * Math.max(0, [...it.text].length - 1);
      const [cr, cg, cb] = hexToRgb(it.color);
      page.pushOperators(pushGraphicsState(), setCharacterSpacing(track));
      if (outline) page.pushOperators(setTextRenderingMode(TextRenderingMode.Outline), setLineWidth(Math.max(0.35, size * 0.03)), setStrokingRgbColor(cr, cg, cb));
      page.drawText(it.text, { x: X(it.x) - w / 2, y: Y(it.y), size, font, color: rgb(cr, cg, cb) });
      page.pushOperators(popGraphicsState());
    }
    if (mirrored) page.pushOperators(popGraphicsState());
  };

  drawAll(doc.addPage([PW, PH]), false);
  if (mirror) {
    const p = doc.addPage([PW, PH]);
    drawAll(p, true);
  }
  return doc.save();
}

export function fileBase(project) {
  const n = (project.text?.name || '').trim();
  const t = (project.text?.title || project.title || 'Recognition').trim();
  return (n ? `${n} - ${t}` : t).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 80) || 'Recognition';
}
