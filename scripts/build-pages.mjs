// Builds the public idea pages (SEO) from the idea library + hand-written copy.
//   node scripts/build-pages.mjs
// Writes public/<slug>/index.html for every page in scripts/pages-content.mjs, the hub public/ideas/index.html,
// and public/sitemap.xml. Re-run after editing pages-content.mjs, prompts.json or the example images.
// Pages are plain static HTML (no app JS) so Google can read them; every idea links into the app with /?idea=<id>.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, FAQ_COMMON } from './pages-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const SITE = 'https://craftedinhonor.com';
const CSS_V = 1; // bump when public/css/pages.css changes
const today = new Date().toISOString().slice(0, 10);
const all = JSON.parse(readFileSync(join(PUB, 'data/prompts.json'), 'utf8'));

// finished example designs shown on pages (public/img/examples, made by tests/make_examples.py)
const IMAGE_SETS = {
  veterans: [
    { src: '/img/examples/veteran-eagle-lifetime.jpg', w: 1200, h: 800, alt: 'Wood-burning pattern for a Navy veteran: graphite bald eagle beside the words A Lifetime of Honor, with the veteran’s name and years of service' },
    { src: '/img/examples/veteran-folded-flag.jpg', w: 1200, h: 800, alt: 'Veterans Day tribute pattern with a folded American flag and the words With Honor and Gratitude above an Army veteran’s name' },
    { src: '/img/examples/veteran-boots-tall.jpg', w: 800, h: 1200, alt: 'Tall wood-burning pattern with combat boots under the words You Answered the Call, personalized for a Marine Corps veteran' },
  ],
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// spread a long list across its categories (round-robin) so a capped page isn't all one trade
function pick(list, limit) {
  if (!limit || list.length <= limit) return list;
  const groups = new Map();
  for (const x of list) {
    const k = x.c + '|' + (x.k || '');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const queues = [...groups.values()];
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const q of queues) {
      if (q[i]) { out.push(q[i]); any = true; if (out.length >= limit) break; }
    }
    if (!any) break;
  }
  return out;
}

const GA = `<script>
(function () {
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return;
  var id = 'G-XETDJV7Y63';
  var s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', id);
})();
</script>`;

// the header mark, taken from the app's own header so it never drifts
const MARK = (readFileSync(join(PUB, 'index.html'), 'utf8').match(/<svg class="brand-mark"[\s\S]*?<\/svg>/) || [''])[0].replace('class="brand-mark"', 'class="mark"');

function head({ title, description, path, ogImage, jsonld }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#f5f2ec">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Crafted In Honor">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${ogImage || '/og-image.jpg'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/css/pages.css?v=${CSS_V}">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
${GA}
</head>
<body>
<header class="top">
  <a class="brand" href="/">${MARK}<span>Crafted <em>In Honor</em></span></a>
  <a class="btn btn-small" href="/">Start designing</a>
</header>
`;
}

function footer(currentSlug) {
  const links = PAGES.filter((p) => p.slug !== currentSlug)
    .map((p) => `<li><a href="/${p.slug}/">${esc(p.nav)}</a></li>`)
    .join('');
  return `<footer class="foot">
  <h2>More ideas</h2>
  <ul class="foot-links">${links}<li><a href="/ideas/">All idea pages</a></li></ul>
  <p class="fine">© ${new Date().getFullYear()} Rendered Craftworks LLC · <a href="/">Crafted In Honor</a></p>
</footer>
</body>
</html>
`;
}

const startUrl = (x, make) => `/?idea=${encodeURIComponent(x.id)}${make ? '&make=' + make : ''}`;

function howItWorks() {
  return `<section class="how">
  <h2>How it works</h2>
  <ol>
    <li><strong>Describe them.</strong> Who they are, the occasion, what they love — or pick an idea below and add their name.</li>
    <li><strong>AI paints the artwork.</strong> Made for that person, with an open space for the words. Choose a printable certificate or a wood-burning pattern.</li>
    <li><strong>Make the words exact.</strong> Type the name, wording, dates and signatures; pick lettering and colors. Then save a print-ready PDF.</li>
  </ol>
  <p class="note">Your designs are saved to your account, so you can come back to them on any device.</p>
</section>`;
}

function pageHtml(pg) {
  const ideas = pick(pg.ideas(all), pg.limit);
  if (!ideas.length) throw new Error(`page ${pg.slug} has no ideas`);
  const path = `/${pg.slug}/`;
  const faq = [...(pg.faq || []), ...FAQ_COMMON];
  const images = (IMAGE_SETS[pg.images] || []).filter((im) => existsSync(join(PUB, im.src)));
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Crafted In Honor', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Ideas', item: SITE + '/ideas/' },
        { '@type': 'ListItem', position: 3, name: pg.h1, item: SITE + path },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
  const cta = pg.make ? `/?make=${pg.make}` : '/';
  return head({ title: pg.title, description: pg.description, path, jsonld }) + `<main class="page">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/ideas/">Ideas</a> › <span>${esc(pg.nav)}</span></nav>
<h1>${esc(pg.h1)}</h1>
${pg.intro.map((p) => `<p class="lead">${esc(p)}</p>`).join('\n')}
<p><a class="btn" href="${cta}">Design one now</a></p>
${images.length ? `<section class="examples" aria-label="Examples">
${images.map((im) => `  <figure class="${im.h > im.w ? 'tall' : ''}"><img src="${im.src}" width="${im.w}" height="${im.h}" alt="${esc(im.alt)}" loading="lazy" decoding="async"></figure>`).join('\n')}
</section>` : ''}
<section class="ideas">
  <h2>Ideas to start from</h2>
  <p class="note">Tap an idea to open it in the designer, then add their name and anything personal. Every idea is a starting point — change any of it.</p>
  <ul class="cards">
${ideas.map((x) => `    <li class="card"><h3>${esc(x.t)}</h3><p>${esc(x.p)}</p><a class="btn btn-ghost" href="${startUrl(x, pg.make)}">Start with this idea</a></li>`).join('\n')}
  </ul>
</section>
${howItWorks()}
<section class="faq">
  <h2>Questions</h2>
${faq.map((f) => `  <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>
</main>
` + footer(pg.slug);
}

function hubHtml() {
  const path = '/ideas/';
  const jsonld = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Crafted In Honor', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Ideas', item: SITE + path },
    ],
  }];
  const cats = new Map();
  for (const x of all) cats.set(x.c, (cats.get(x.c) || 0) + 1);
  return head({
    title: 'Certificate, Award & Wood-Burning Ideas | Crafted In Honor',
    description: `${all.length.toLocaleString('en-US')} ideas for personalized certificates, awards, tributes and wood-burning patterns — retirements, veterans, teachers, nurses, coaches, memorials and more.`,
    path, jsonld,
  }) + `<main class="page">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Ideas</span></nav>
<h1>Ideas for certificates, awards and keepsakes</h1>
<p class="lead">Crafted In Honor has ${all.length.toLocaleString('en-US')} ready-made ideas to start from — every one a starting point you can change, for any person and any occasion. Pick a topic below, or open the designer and search them all.</p>
<p><a class="btn" href="/">Open the designer</a></p>
<ul class="hub">
${PAGES.map((p) => `  <li><a href="/${p.slug}/"><strong>${esc(p.h1)}</strong><span>${esc(p.description)}</span></a></li>`).join('\n')}
</ul>
${howItWorks()}
</main>
` + footer(null);
}

function sitemap() {
  const urls = ['/', '/ideas/', ...PAGES.map((p) => `/${p.slug}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

// remove pages this script made earlier that are no longer in PAGES (list kept in scripts/pages-built.json)
const BUILT = join(ROOT, 'scripts/pages-built.json');
const before = existsSync(BUILT) ? JSON.parse(readFileSync(BUILT, 'utf8')) : [];
for (const slug of before) if (!PAGES.some((p) => p.slug === slug) && existsSync(join(PUB, slug))) rmSync(join(PUB, slug), { recursive: true });
writeFileSync(BUILT, JSON.stringify(PAGES.map((p) => p.slug), null, 1) + '\n');
const write = (rel, html) => {
  const f = join(PUB, rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, html);
};
const slugs = new Set();
for (const pg of PAGES) {
  if (slugs.has(pg.slug)) throw new Error('duplicate slug ' + pg.slug);
  slugs.add(pg.slug);
  write(`${pg.slug}/index.html`, pageHtml(pg));
  console.log(`${pg.slug}: ${pick(pg.ideas(all), pg.limit).length} ideas`);
}
write('ideas/index.html', hubHtml());
writeFileSync(join(PUB, 'sitemap.xml'), sitemap());
console.log(`wrote ${PAGES.length} pages + /ideas/ + sitemap.xml`);
