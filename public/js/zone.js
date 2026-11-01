// Finds the calm (empty) lettering area in a generated artwork so text never lands on the
// decoration. AI images rarely leave exactly the space requested, so we measure it.
import { zonesFor, DESIGN_W, DESIGN_H } from './layout.js?v=13';

export async function detectZone(url, layout, orient = 'landscape') {
  const portrait = orient === 'portrait';
  const DW = portrait ? DESIGN_H : DESIGN_W, DH = portrait ? DESIGN_W : DESIGN_H;
  const GW = DW / 10, GH = DH / 10; // analysis grid (each cell = 10 design units)
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = GW; c.height = GH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, GW, GH); // downscale = averaging, smooths paper texture
  const d = g.getImageData(0, 0, GW, GH).data;
  const lum = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // "busy" = noticeable local contrast
  const busy = new Uint8Array(GW * GH);
  for (let y = 1; y < GH - 1; y++)
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      const gx = lum[i + 1] - lum[i - 1], gy = lum[i + GW] - lum[i - GW];
      busy[i] = Math.hypot(gx, gy) > 16 ? 1 : 0;
    }
  const frac = (x0, y0, x1, y1) => {
    let n = 0, b = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; b += busy[y * GW + x]; }
    return n ? b / n : 1;
  };
  const Z = zonesFor(orient);
  const z = Z[layout] || Z.framed;
  // start a little larger than the nominal area, then pull each edge in until its strip is calm
  let x0 = Math.max(2, Math.floor(z.x / 10) - 6), y0 = Math.max(2, Math.floor(z.y / 10) - 5);
  let x1 = Math.min(GW - 2, Math.ceil((z.x + z.w) / 10) + 6), y1 = Math.min(GH - 2, Math.ceil((z.y + z.h) / 10) + 5);
  const minW = (z.w / 10) * 0.45, minH = (z.h / 10) * 0.45;
  const T = 0.035, S = 3; // allowed busy fraction in a 3-cell edge strip
  for (let guard = 0; guard < 400; guard++) {
    const sides = [
      ['l', frac(x0, y0, x0 + S, y1)], ['r', frac(x1 - S, y0, x1, y1)],
      ['t', frac(x0, y0, x1, y0 + S)], ['b', frac(x0, y1 - S, x1, y1)],
    ].filter(([, f]) => f > T).sort((a, b) => b[1] - a[1]);
    if (!sides.length) break;
    const s = sides[0][0];
    if ((s === 'l' || s === 'r') && x1 - x0 <= minW) break;
    if ((s === 't' || s === 'b') && y1 - y0 <= minH) break;
    if (s === 'l') x0++; else if (s === 'r') x1--; else if (s === 't') y0++; else y1--;
  }
  // small breathing room inside the calm area
  const pad = 1.5;
  const zone = { x: (x0 + pad) * 10, y: (y0 + pad) * 10, w: (x1 - x0 - pad * 2) * 10, h: (y1 - y0 - pad * 2) * 10 };
  // sanity: if detection collapsed (very busy art), fall back to nominal
  if (zone.w < z.w * 0.45 || zone.h < z.h * 0.45) return null;
  zone.x = Math.max(40, zone.x); zone.y = Math.max(30, zone.y);
  zone.w = Math.min(zone.w, DW - 40 - zone.x); zone.h = Math.min(zone.h, DH - 30 - zone.y);
  return { x: Math.round(zone.x), y: Math.round(zone.y), w: Math.round(zone.w), h: Math.round(zone.h), auto: true };
}
