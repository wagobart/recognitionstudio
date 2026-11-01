// Cache-busting for every front-end file. Browsers (and Cloudflare, on the custom domain) can hold
// on to old copies of /js/*.js; a new app.js importing an old layout.js fails to start and the whole
// page goes dead. So every module import carries the same ?v= as index.html.
// usage: node scripts/bump-version.mjs        (increments)   node scripts/bump-version.mjs 15  (sets)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('../public/', import.meta.url);
const idx = new URL('index.html', root);
let html = readFileSync(idx, 'utf8');
const cur = Number((html.match(/app\.js\?v=(\d+)/) || [])[1] || 0);
const v = Number(process.argv[2]) || cur + 1;
html = html.replace(/(\/(?:js\/app\.js|css\/app\.css))(?:\?v=\d+)?/g, `$1?v=${v}`);
writeFileSync(idx, html);
const jsDir = new URL('js/', root);
for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
  const p = new URL(f, jsDir);
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/(from\s+'\.\/[\w-]+\.js)(?:\?v=\d+)?'/g, `$1?v=${v}'`);
  if (out !== src) writeFileSync(p, out);
}
console.log('front-end version', v);
