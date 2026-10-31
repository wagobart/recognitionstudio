# CLAUDE.md — Recognition Studio internals (authoritative reference)

Separate app and repo from Pyrography Patterns and Stitched Patterns. Do not assume features from either exist here.

## Core design principle
AI artwork and lettering are **separate layers**. The image model paints a decorative shell with a deliberately
**empty lettering area** and no text. All words are rendered by the app in real fonts. Therefore text edits,
font/color/size/position changes never call the AI and never cost money.

## Flow
1. Start screen: idea textarea + idea library + output choice (certificate | pyrography) → "Design it".
2. `POST /api/plan` → design plan (layout, artPrompt, lettering style, colors, starter wording, designNotes).
   Text model `PLANNER_MODEL` with strict JSON schema; on any failure or budget limit → `localPlan()` (keyword heuristics). `dropInventedFacts()` strips numbers not in the user's idea and `[placeholder]` fragments.
3. Editor opens immediately with the plan's wording over blank paper; user can type while art paints.
   `applyPlan` never overwrites fields the user already typed.
4. `POST /api/art` → `buildImagePrompt()` wraps artPrompt with composition rules for the layout + strict no-text rule;
   pyrography adds black line-art / burnable constraints. Result stored in R2 `art/{userId}/{artId}`, served by `GET /api/art/...` (owner only).
5. Autosave: every change → localStorage draft immediately + debounced `PUT /api/projects/:id` (900 ms). Retries every 6 s on failure.

## Files
- `functions/api/[[path]].js` — single router: config, auth, plan, art, art-latest (recovery), art serving, projects CRUD.
- `functions/_lib/design.js` — LAYOUTS (5 compositions), lettering ids, planner prompt/schema, `buildImagePrompt`, `localPlan`.
- `functions/_lib/openai.js` — image call; maps errors to friendly messages (moderation, 429, 401).
- `functions/_lib/auth.js` — email+password (PBKDF2-SHA256 100k), session cookie `rs_session` (HttpOnly, 60 days), invite gate.
- `functions/_lib/mockart.js` — test-mode SVG artwork, tagged "TEST ARTWORK — not AI". Mock tweak `SIMULATE_FAILURE` returns 502 (test hook).
- `public/js/fonts.js` — 8 lettering STYLES (pairings) over 15 local TTFs. Size multipliers `k` equalize visual size.
- `public/js/layout.js` — **the one layout engine**: ZONES per layout in a 1500×1000 design space; stack (kicker, title ≤2 lines, lead-in, name 1 line shrink-to-fit, ornament rule, body ≤5 lines, details) + bottom row (up to 2 signature columns + date). Auto-shrinks to fit. User offsets: `style.offsetX/offsetY/widthScale/scale`.
- `public/js/zone.js` — `detectZone(url, layout)`: measures the artwork's calm/empty area (edge-density grid, shrinks a nominal rect until edges are calm). Stored as `art.zone`; `layout.zoneFor` uses it over the nominal ZONE. Computed on new art, recovered art, and on opening older projects.
- `public/js/render.js` — SVG preview, PNG (canvas) and PDF (pdf-lib) all draw from `computeLayout()`. PDF: artwork fit on Letter/A4/11×17 with 0.25" margin; optional mirrored 2nd page for pyrography transfer; outline lettering via PDF text render mode.
- `public/js/app.js` — UI state, editor, library, export, projects, auth, artwork recovery.
- `scripts/build-prompts.mjs` → `public/data/prompts.json` (1,277 ideas; fields id,c,o,t,p,k).
- `tests/e2e.py` — Playwright suite (desktop + iPhone emulation).

## Fonts — important
TTFs are Google Fonts (OFL), static instances, subset to Latin, **GSUB removed**, name table renamed `RS-*`.
- GSUB removal is deliberate: pdf-lib applied ligatures/contextual alternates differently from the browser, causing gaps and lost text in PDFs.
- PDF embeds fonts with `subset: false` — pdf-lib's subsetter dropped glyphs (blank letters). Fonts are small, so full embedding is fine.
If you add a font: instance → pyftsubset → delete GSUB → add to FONT_FILES → verify with the e2e PDF text check.

## Project JSON (stored in D1 `projects.data`)
`{ id 'p_…', v, title, output, idea, createdAt, updatedAt, plan{layout,artPrompt,designNotes,source}, art{key,url,contentType,layout,output,test?}, artHistory[], text{name,title,body,date,kicker,presented,details,sig1Name,sig1Role,sig2Name,sig2Role}, style{lettering,headColor,textColor,scale,offsetX,offsetY,widthScale,outline} }`
A signature column renders if name OR role is set (role-only = blank line to sign by hand). Pyrography forces burn tone `#1f1610`.

## Export UX rules
- "Preview PDF" opens an in-app viewer (labelled *Preview only — not saved*). Saving is a separate action.
- On touch devices that support file sharing (iPhone Safari) the main button is **"Save to Files or Share…"** → native share sheet (Save to Files / Print / Mail). Elsewhere it is **"Download PDF"**. The PDF is pre-built when the sheet opens so the share call stays inside the tap gesture (iOS requirement).

## Resilience
- Artwork failure leaves current art + wording untouched; retry buttons on stage and panel.
- Dropped connection during generation (iPhone app switch): client polls `GET /api/art-latest?since=` and attaches finished artwork; also checked on reload via `rs.pendingArt`.
- Server errors never lose work: localStorage draft is restored if newer than cloud copy.

## Known gaps (as of 2026-10-31)
No password reset (no email provider); no admin UI; orphaned R2 images are never cleaned up; pyrography page sizes are fit-to-paper (no actual-size tiling); real-iPhone behaviour not yet verified; planner can produce awkward lead-in lines — see docs/TESTING.md.
