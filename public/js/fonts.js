// Lettering styles: each is a genuinely different typeface pairing (headline / name / body).
// Font files are local TTFs so the same outlines are used on screen and embedded in the PDF.

export const FONT_FILES = {
  'Garamond-Regular': 'Garamond-Regular.ttf',
  'Garamond-SemiBold': 'Garamond-SemiBold.ttf',
  'Garamond-Italic': 'Garamond-Italic.ttf',
  'Cinzel-Medium': 'Cinzel-Medium.ttf',
  'Cinzel-Bold': 'Cinzel-Bold.ttf',
  GreatVibes: 'GreatVibes.ttf',
  Fraktur: 'Fraktur.ttf',
  'Montserrat-Regular': 'Montserrat-Regular.ttf',
  'Montserrat-SemiBold': 'Montserrat-SemiBold.ttf',
  'Slab-Regular': 'Slab-Regular.ttf',
  'Slab-SemiBold': 'Slab-SemiBold.ttf',
  'Caveat-Medium': 'Caveat-Medium.ttf',
  'Caveat-Bold': 'Caveat-Bold.ttf',
  'Playfair-Bold': 'Playfair-Bold.ttf',
  Rye: 'Rye.ttf',
};

// size multipliers let visually small faces (script, handwriting) read at the same weight
export const STYLES = {
  classic: {
    label: 'Classic', hint: 'Book serif',
    kicker: { f: 'Garamond-Regular', caps: true, track: 0.2, k: 1 },
    title: { f: 'Garamond-SemiBold', k: 1 },
    lead: { f: 'Garamond-Italic', k: 1 },
    name: { f: 'Garamond-Italic', k: 1.05 },
    body: { f: 'Garamond-Regular', k: 1.05 },
    small: { f: 'Garamond-Regular', caps: true, track: 0.12, k: 1 },
  },
  engraved: {
    label: 'Engraved', hint: 'Roman capitals',
    kicker: { f: 'Cinzel-Medium', caps: true, track: 0.22, k: 0.9 },
    title: { f: 'Cinzel-Bold', k: 0.86 },
    lead: { f: 'Garamond-Italic', k: 1 },
    name: { f: 'Cinzel-Bold', k: 0.8 },
    body: { f: 'Garamond-Regular', k: 1.05 },
    small: { f: 'Cinzel-Medium', caps: true, track: 0.12, k: 0.85 },
  },
  elegant: {
    label: 'Elegant', hint: 'Flowing script',
    kicker: { f: 'Garamond-Regular', caps: true, track: 0.24, k: 0.95 },
    title: { f: 'Playfair-Bold', k: 0.92 },
    lead: { f: 'Garamond-Italic', k: 1 },
    name: { f: 'GreatVibes', k: 1.45 },
    body: { f: 'Garamond-Italic', k: 1.08 },
    small: { f: 'Garamond-Regular', caps: true, track: 0.14, k: 1 },
  },
  diploma: {
    label: 'Diploma', hint: 'Old English',
    kicker: { f: 'Garamond-Italic', k: 1.15 },
    title: { f: 'Fraktur', k: 1.1 },
    lead: { f: 'Garamond-Italic', k: 1 },
    name: { f: 'Fraktur', k: 1.12 },
    body: { f: 'Garamond-Regular', k: 1.05 },
    small: { f: 'Garamond-Regular', caps: true, track: 0.12, k: 1 },
  },
  modern: {
    label: 'Modern', hint: 'Clean sans',
    kicker: { f: 'Montserrat-SemiBold', caps: true, track: 0.3, k: 0.78 },
    title: { f: 'Montserrat-SemiBold', caps: true, track: 0.08, k: 0.7 },
    lead: { f: 'Montserrat-Regular', k: 0.82 },
    name: { f: 'Montserrat-Regular', k: 0.86 },
    body: { f: 'Montserrat-Regular', k: 0.86 },
    small: { f: 'Montserrat-SemiBold', caps: true, track: 0.14, k: 0.8 },
  },
  workshop: {
    label: 'Workshop', hint: 'Sturdy slab',
    kicker: { f: 'Montserrat-SemiBold', caps: true, track: 0.26, k: 0.8 },
    title: { f: 'Slab-SemiBold', caps: true, track: 0.04, k: 0.86 },
    lead: { f: 'Slab-Regular', k: 0.95 },
    name: { f: 'Slab-SemiBold', k: 0.95 },
    body: { f: 'Slab-Regular', k: 0.95 },
    small: { f: 'Montserrat-SemiBold', caps: true, track: 0.14, k: 0.8 },
  },
  frontier: {
    label: 'Frontier', hint: 'Western woodtype',
    kicker: { f: 'Slab-SemiBold', caps: true, track: 0.26, k: 0.85 },
    title: { f: 'Rye', k: 0.78 },
    lead: { f: 'Slab-Regular', k: 0.95 },
    name: { f: 'Rye', k: 0.8 },
    body: { f: 'Slab-Regular', k: 0.95 },
    small: { f: 'Slab-SemiBold', caps: true, track: 0.14, k: 0.85 },
  },
  personal: {
    label: 'Personal', hint: 'Handwritten',
    kicker: { f: 'Caveat-Medium', k: 1.35 },
    title: { f: 'Caveat-Bold', k: 1.3 },
    lead: { f: 'Caveat-Medium', k: 1.3 },
    name: { f: 'Caveat-Bold', k: 1.4 },
    body: { f: 'Caveat-Medium', k: 1.32 },
    small: { f: 'Caveat-Medium', k: 1.3 },
  },
};

const loaded = new Map(); // font key -> Promise
const buffers = new Map(); // font key -> Promise<ArrayBuffer>

export function fontBuffer(key) {
  if (!buffers.has(key)) buffers.set(key, fetch('/fonts/' + FONT_FILES[key]).then((r) => r.arrayBuffer()));
  return buffers.get(key);
}

export function loadFont(key) {
  if (!loaded.has(key)) {
    loaded.set(
      key,
      fontBuffer(key).then(async (buf) => {
        const face = new FontFace('rs-' + key, buf);
        await face.load();
        document.fonts.add(face);
        return face;
      })
    );
  }
  return loaded.get(key);
}

export function styleFontKeys(styleId) {
  const s = STYLES[styleId] || STYLES.classic;
  return [...new Set(['kicker', 'title', 'lead', 'name', 'body', 'small'].map((r) => s[r].f))];
}

export const loadStyle = (styleId) => Promise.all(styleFontKeys(styleId).map(loadFont));
export const cssFamily = (key) => `"rs-${key}"`;
