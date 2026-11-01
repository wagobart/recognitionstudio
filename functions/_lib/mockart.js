// Test-mode artwork: a procedurally drawn SVG shell that respects each layout's empty
// lettering area. Used when AI_MODE=mock (local testing, CI, or no API key) so the whole
// app can be exercised without spending money. Clearly tagged as test artwork.

function rng(seedText) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const PALETTES = [
  { bg: '#f7f0e1', a: '#7a5a2e', b: '#b48a46', c: '#3f5a45' },
  { bg: '#f4f1ea', a: '#1d3557', b: '#c9a227', c: '#7b2d26' },
  { bg: '#f6efe6', a: '#5b3a29', b: '#a0703c', c: '#2f4f4f' },
  { bg: '#eef2ee', a: '#2d4a3e', b: '#a88b4a', c: '#6b2f2f' },
  { bg: '#f5f0f3', a: '#5a2a3a', b: '#b08d57', c: '#2e3a59' },
];

export function mockArtSvg({ idea = '', layout = 'framed', output = 'certificate', photo = false, orient = 'landscape' }) {
  const r = rng(idea + layout + output + orient);
  const portrait = orient === 'portrait';
  const W = portrait ? 1024 : 1536, H = portrait ? 1536 : 1024;
  const pyro = output === 'pyrography';
  const P = pyro ? { bg: '#ffffff', a: '#111', b: '#111', c: '#111' } : PALETTES[Math.floor(r() * PALETTES.length)];
  const sw = pyro ? 3 : 2.5;
  const parts = [];
  const fillOr = (col, op = 1) => (pyro ? 'none' : col) + `" fill-opacity="${op}`;

  // paper
  parts.push(`<rect width="${W}" height="${H}" fill="${P.bg}"/>`);
  if (!pyro) {
    parts.push(`<defs><radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="${P.bg}" stop-opacity="0"/><stop offset="100%" stop-color="${P.b}" stop-opacity="0.35"/></radialGradient></defs>`);
    parts.push(`<rect width="${W}" height="${H}" fill="url(#v)"/>`);
  }
  // double border
  parts.push(`<rect x="28" y="28" width="${W - 56}" height="${H - 56}" fill="none" stroke="${P.a}" stroke-width="${sw * 2.4}"/>`);
  parts.push(`<rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none" stroke="${P.b}" stroke-width="${sw}"/>`);

  const leaf = (x, y, s, rot) =>
    `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 0 C 12 -18 34 -18 46 0 C 34 18 12 18 0 0 Z M0 0 L46 0" fill="${fillOr(P.c, 0.85)}" stroke="${P.a}" stroke-width="${sw / s}"/>`;
  const rosette = (cx, cy, rad) => {
    let s = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fillOr(P.b, 0.9)}" stroke="${P.a}" stroke-width="${sw}"/>`;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s += `<circle cx="${cx + Math.cos(a) * rad * 0.68}" cy="${cy + Math.sin(a) * rad * 0.68}" r="${rad * 0.2}" fill="${fillOr(P.bg)}" stroke="${P.a}" stroke-width="${sw * 0.8}"/>`;
    }
    return s + `<circle cx="${cx}" cy="${cy}" r="${rad * 0.32}" fill="${fillOr(P.c)}" stroke="${P.a}" stroke-width="${sw}"/>`;
  };
  const vine = (x1, y1, x2, y2, n) => {
    let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.a}" stroke-width="${sw}"/>`;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const ang = Math.atan2(y2 - y1, x2 - x1) * 57.3;
      s += leaf(x, y, 0.9, ang - 40 + (i % 2) * 80);
    }
    return s;
  };
  const corners = () => {
    let s = '';
    for (const [x, y] of [[90, 90], [W - 90, 90], [90, H - 90], [W - 90, H - 90]]) s += rosette(x, y, 38);
    return s;
  };
  const illustration = (x, y, w, h) => {
    // abstract "hero" panel: arch, sun, hills, tools silhouettes — clearly placeholder
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fillOr(P.b, 0.18)}" stroke="${P.a}" stroke-width="${sw * 1.5}"/>`;
    s += `<circle cx="${x + w / 2}" cy="${y + h * 0.32}" r="${Math.min(w, h) * 0.16}" fill="${fillOr(P.b, 0.8)}" stroke="${P.a}" stroke-width="${sw}"/>`;
    for (let i = 0; i < 3; i++) {
      const yy = y + h * (0.55 + i * 0.13);
      s += `<path d="M${x + 10} ${yy} Q ${x + w * 0.3} ${yy - 60 - r() * 40} ${x + w * 0.55} ${yy} T ${x + w - 10} ${yy}" fill="none" stroke="${i % 2 ? P.c : P.a}" stroke-width="${sw * 1.4}"/>`;
    }
    return s;
  };

  if (layout === 'framed') {
    parts.push(vine(150, 90, W - 150, 90, Math.round(W / 110)), vine(150, H - 90, W - 150, H - 90, Math.round(W / 110)));
    parts.push(vine(90, 150, 90, H - 150, Math.round(H / 110)), vine(W - 90, 150, W - 90, H - 150, Math.round(H / 110)));
    parts.push(corners());
  } else if (layout === 'crest') {
    parts.push(corners());
    parts.push(rosette(W / 2, portrait ? 240 : 150, portrait ? 130 : 88));
    parts.push(vine(W / 2 - 150, portrait ? 240 : 150, W / 2 - W * 0.36, portrait ? 240 : 150, 4), vine(W / 2 + 150, portrait ? 240 : 150, W / 2 + W * 0.36, portrait ? 240 : 150, 4));
  } else if (layout === 'art-left') {
    const iw = portrait ? W * 0.26 : 440;
    parts.push(illustration(80, 80, iw, H - 160));
    parts.push(vine(iw + 120, H - 90, W - 150, H - 90, 6));
  } else if (layout === 'art-right') {
    const iw = portrait ? W * 0.26 : 440;
    parts.push(illustration(W - 80 - iw, 80, iw, H - 160));
    parts.push(vine(150, H - 90, W - iw - 120, H - 90, 6));
  } else {
    // scene
    for (let i = 0; i < 4; i++) {
      const base = H - 80 - i * (portrait ? 110 : 55);
      const pts = Array.from({ length: 9 }, (_, k) => `${(k / 8) * (W - 120) + 60},${base - 40 - r() * 90}`).join(' L ');
      parts.push(`<path d="M60 ${H - 60} L ${pts} L ${W - 60} ${H - 60} Z" fill="${fillOr([P.c, P.b, P.a, P.c][i], 0.25 + i * 0.12)}" stroke="${P.a}" stroke-width="${sw}"/>`);
    }
    parts.push(corners());
  }
  parts.push(
    `<g opacity="0.75"><rect x="${W - (photo ? 470 : 300)}" y="${H - 44}" width="${photo ? 420 : 250}" height="26" rx="13" fill="#000" fill-opacity="0.55"/><text x="${W - (photo ? 260 : 175)}" y="${H - 26}" font-family="Arial, sans-serif" font-size="14" fill="#fff" text-anchor="middle">TEST ARTWORK — not AI${photo ? ' · photo would be painted in' : ''}</text></g>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}
