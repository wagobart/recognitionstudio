// Photos added to a design. Everything here runs in the browser and never redraws the subject:
// "Exact photo" and "Exact graphite" keep every feature exactly where it is in the original.
// (The third mode, "Paint into art", is done by the image model on the server — see /api/art.)
//
// photo = { key, url, w, h, type, mode: 'color'|'graphite'|'ai', shape: 'oval'|'circle'|'rounded'|'full',
//           place: 'left'|'right'|'top', size, fade, shading, detail, zoom, fx, fy, subject? }

export const PHOTO_DEFAULTS = { shape: 'oval', place: 'left', size: 1, fade: 0.3, shading: 0.6, detail: 0.5, zoom: 1, fx: 0.5, fy: 0.42 };

export const SHAPES = { oval: 'Oval', circle: 'Circle', rounded: 'Rounded', full: 'Full photo' };
export const PLACES = { left: 'Left', right: 'Right', top: 'Top' };

/** width / height of the finished photo for its shape */
export function photoAspect(photo) {
  if (!photo) return 0.8;
  if (photo.shape === 'circle') return 1;
  if (photo.shape === 'full') return photo.w && photo.h ? photo.w / photo.h : 0.8;
  return 0.8; // oval + rounded: classic 4:5 portrait
}

/** has the current artwork been painted from this photo by the AI? */
export const photoPainted = (project) => !!(project?.photo?.key && project.art?.fromPhoto === project.photo.key);

/**
 * Is the photo drawn as its own layer? Yes for the two exact modes. In "Paint into art" mode the
 * exact photo stays visible until the artwork has actually been painted from it.
 */
export const photoLayerOn = (project) => !!(project?.photo?.key && !(project.photo.mode === 'ai' && photoPainted(project)));

// ---------------- source images ----------------
const sources = new Map(); // url -> Promise<HTMLImageElement>
function loadSource(url) {
  if (!sources.has(url)) {
    sources.set(
      url,
      new Promise((res, rej) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => res(img);
        img.onerror = () => { sources.delete(url); rej(new Error('The photo could not be loaded.')); };
        img.src = url;
      })
    );
  }
  return sources.get(url);
}

// ---------------- helpers ----------------
function boxBlur(src, w, h, r) {
  // three separable box passes ≈ gaussian
  if (r < 1) return src.slice();
  let a = src.slice(), b = new Float32Array(src.length);
  const pass = (inp, out, horiz) => {
    const len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 1 : w, lstep = horiz ? w : 1;
    const norm = 1 / (2 * r + 1);
    for (let l = 0; l < lines; l++) {
      const base = l * lstep;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += inp[base + Math.min(len - 1, Math.max(0, i)) * step];
      for (let i = 0; i < len; i++) {
        out[base + i * step] = acc * norm;
        const add = Math.min(len - 1, i + r + 1), sub = Math.max(0, i - r);
        acc += inp[base + add * step] - inp[base + sub * step];
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), ((s ^= s >>> 16) >>> 0) / 4294967296);
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** 0..1 coverage of the shape at (x,y) with a soft edge `f` (in px) */
function maskFn(shape, w, h, f) {
  if (shape === 'oval' || shape === 'circle') {
    const rx = w / 2, ry = h / 2;
    return (x, y) => {
      const dx = (x + 0.5 - rx) / rx, dy = (y + 0.5 - ry) / ry;
      const d = (1 - Math.sqrt(dx * dx + dy * dy)) * Math.min(rx, ry); // ≈ px inside the edge
      return f < 1 ? (d >= 0 ? 1 : 0) : smooth(0, f, d);
    };
  }
  const rad = shape === 'rounded' ? Math.min(w, h) * 0.12 : 0;
  return (x, y) => {
    const qx = Math.abs(x + 0.5 - w / 2) - (w / 2 - rad), qy = Math.abs(y + 0.5 - h / 2) - (h / 2 - rad);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad; // signed distance, <0 inside
    const d = -outside;
    return f < 1 ? (d >= 0 ? 1 : 0) : smooth(0, f, d);
  };
}

/**
 * Render the finished photo (crop + shape + soft edge, in color or graphite) onto a canvas.
 * Same inputs always give the same pixels, so preview, thumbnail and PDF all match.
 */
export async function renderPhotoCanvas(photo, maxEdge = 900, srcUrl) {
  const img = await loadSource(srcUrl || photo.url);
  const p = { ...PHOTO_DEFAULTS, ...photo };
  const a = photoAspect(p);
  const W = img.naturalWidth, H = img.naturalHeight;
  // crop window: biggest box of the target aspect, shrunk by zoom, centred on the focus point
  let cw = Math.min(W, H * a), ch = cw / a;
  cw /= Math.max(1, p.zoom); ch /= Math.max(1, p.zoom);
  const sx = Math.min(W - cw, Math.max(0, p.fx * W - cw / 2));
  const sy = Math.min(H - ch, Math.max(0, p.fy * H - ch / 2));
  const scale = Math.min(1, maxEdge / Math.max(cw, ch)) * Math.min(1.6, Math.max(1, maxEdge / Math.max(cw, ch)));
  const w = Math.max(8, Math.round(cw * scale)), h = Math.max(8, Math.round(ch * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, cw, ch, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h);
  const d = im.data, n = w * h;
  const feather = p.fade * Math.min(w, h) * 0.32;
  const cover = maskFn(p.shape, w, h, feather);

  if (p.mode === 'graphite') {
    const L = new Float32Array(n), inv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a0 = d[o + 3] / 255; // transparent areas count as white paper
      const lum = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
      L[i] = lum * a0 + (1 - a0);
      inv[i] = 1 - L[i];
    }
    const unit = Math.max(w, h) / 900; // keep the look the same at preview and print sizes
    // pencil lines: colour-dodge of the image over its blurred negative
    const r = Math.max(1, Math.round((1.5 + (1 - p.detail) * 5) * unit));
    const blur = boxBlur(inv, w, h, r);
    // soft tonal shading underneath, so it reads as a rendered drawing rather than an outline
    const tone = boxBlur(L, w, h, Math.max(1, Math.round(1.2 * unit)));
    const rand = rng(((p.key || '').length * 7919) ^ (w * 31 + h));
    const contrast = 0.85 + p.shading * 0.9;
    for (let i = 0; i < n; i++) {
      const dodge = Math.min(1, L[i] / Math.max(0.02, 1 - blur[i]));
      let t = (tone[i] - 0.5) * contrast + 0.5 + (1 - p.shading) * 0.18; // midtone shading
      t = Math.min(1, Math.max(0, t));
      const shade = 1 - p.shading * (1 - t) * 0.92;
      let v = dodge * shade;
      v = Math.pow(Math.min(1, Math.max(0, v)), 1.15);                  // graphite sits slightly dark
      v = v * (1 - 0.045 * rand()) + 0.01;                              // paper grain
      const x = i % w, y = (i / w) | 0;
      const o = i * 4;
      // graphite is a cool, slightly blue-grey
      d[o] = Math.min(255, v * 247); d[o + 1] = Math.min(255, v * 248); d[o + 2] = Math.min(255, v * 252);
      d[o + 3] = Math.round(255 * cover(x, y));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * cover(x, y));
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

// cache of finished photos as object URLs, keyed by every setting that changes the pixels
const cache = new Map();
const cacheKey = (photo, maxEdge) =>
  JSON.stringify([photo.url, photo.mode, photo.shape, photo.fade, photo.shading, photo.detail, photo.zoom, photo.fx, photo.fy, photo.w, photo.h, maxEdge]);

/** object URL of the finished photo (cached) */
export async function photoUrl(photo, maxEdge = 900) {
  const k = cacheKey(photo, maxEdge);
  if (!cache.has(k)) {
    cache.set(k, renderPhotoCanvas(photo, maxEdge).then((c) => new Promise((r) => c.toBlob((b) => r(URL.createObjectURL(b)), 'image/png'))));
    if (cache.size > 40) {
      const [oldK, oldV] = cache.entries().next().value;
      cache.delete(oldK);
      oldV.then((u) => setTimeout(() => URL.revokeObjectURL(u), 30000)).catch(() => {});
    }
    cache.get(k).catch(() => cache.delete(k));
  }
  return cache.get(k);
}

/** PNG bytes of the finished photo at print resolution */
export async function photoPngBytes(photo, maxEdge = 1600) {
  const c = await renderPhotoCanvas(photo, maxEdge);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Prepare an uploaded file: honour phone orientation, shrink very large photos, keep PNG
 * (logos with transparent backgrounds) as PNG, everything else as high-quality JPEG.
 */
export async function prepareUpload(file, maxEdge = 2400) {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('Please choose a photo (JPEG or PNG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That photo couldn’t be opened. Try a JPEG or PNG.'));
      i.src = url;
    });
    const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const png = file.type === 'image/png';
    if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(img, 0, 0, w, h);
    const type = png ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
    return { blob, type, w, h, localUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------- the other version of the same artwork (no AI) ----------------
// Wood-burning version of a certificate: the identical artwork run through the same pencil-drawing
// conversion as "Exact graphite" photos. Certificate version of a design that started as a
// wood-burning pattern: the identical drawing printed as sepia ink on parchment (there is no colour
// information to recover without the AI inventing it).
export const PARCHMENT = [244, 234, 213];
export const SEPIA_INK = [58, 38, 22];

export async function deriveArtCanvas(art, to) {
  const w = art.width || 1536, h = art.height || 1024;
  if (to === 'pyrography') {
    return renderPhotoCanvas(
      { url: art.url, key: art.key, mode: 'graphite', shape: 'full', fade: 0, zoom: 1, fx: 0.5, fy: 0.5, w, h, shading: 0.5, detail: 0.65 },
      Math.max(w, h)
    );
  }
  const img = await loadSource(art.url);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || w; c.height = img.naturalHeight || h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    for (let k = 0; k < 3; k++) d[i + k] = SEPIA_INK[k] + (PARCHMENT[k] - SEPIA_INK[k]) * v;
  }
  g.putImageData(im, 0, 0);
  return c;
}
