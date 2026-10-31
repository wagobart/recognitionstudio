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
   pyrography asks for a photorealistic grayscale graphite drawing (tonal shading, no color, lettering area kept pure white) — changed from black line art on 2026-10-31. Result stored in R2 `art/{userId}/{artId}`, served by `GET /api/art/...` (owner only).
5. Autosave: every change → localStorage draft immediately + debounced `PUT /api/projects/:id` (900 ms). Retries every 6 s on failure.

## Files
- `functions/api/[[path]].js` — single router: config, auth, plan, art, art-latest (recovery), art serving, projects CRUD.
- `functions/_lib/design.js` — LAYOUTS (5 compositions), lettering ids, planner prompt/schema, `buildImagePrompt`, `localPlan`.
- `functions/_lib/openai.js` — image call: `POST /v1/images/generations`, model `IMAGE_MODEL` (`gpt-image-2.5-sunburst`), 1536x1024, quality high; planner uses `POST /v1/chat/completions` with `PLANNER_MODEL` (`gpt-4.1-mini`); maps errors to friendly messages (moderation, 429, 401).
- `functions/_lib/auth.js` — email+password (PBKDF2-SHA256 100k), session cookie `rs_session` (HttpOnly, 60 days), invite gate.
- `functions/_lib/mockart.js` — test-mode SVG artwork, tagged "TEST ARTWORK — not AI". Mock tweak `SIMULATE_FAILURE` returns 502 (test hook).
- `public/js/fonts.js` — 8 lettering STYLES (pairings) over 15 local TTFs. Size multipliers `k` equalize visual size.
- `public/js/layout.js` — **the one layout engine**: ZONES per layout in a 1500×1000 design space; stack (kicker, title ≤2 lines, lead-in, name 1 line shrink-to-fit, ornament rule, body ≤5 lines, details) + bottom row (up to 2 signature columns + date). Auto-shrinks to fit. User offsets: `style.offsetX/offsetY/widthScale/scale`.
- `public/js/zone.js` — `detectZone(url, layout)`: measures the artwork's calm/empty area (edge-density grid, shrinks a nominal rect until edges are calm). Stored as `art.zone`; `layout.zoneFor` uses it over the nominal ZONE. Computed on new art, recovered art, and on opening older projects.
- `public/js/render.js` — SVG preview, PNG (canvas) and PDF (pdf-lib) all draw from `computeLayout()`. PDF: artwork fit on Letter/A4/11×17 with 0.25" margin; optional mirrored 2nd page for pyrography transfer; outline lettering via PDF text render mode.
- `public/js/app.js` — UI state, editor, library, export, projects, auth, artwork recovery.
  Start screen heading is "Who are we honoring?" (not "celebrating" — memorials and tributes are first-class occasions).
  Header nav: Home (`#navHomeBtn` → `newDesign()`, saves current work, highlighted on the start screen) · My projects (folder) · account. Phones (≤480px): icons only, signed-in account is a person icon (full email in the Account sheet), "Sign in" never shrinks; the brand name truncates first so the header never exceeds the screen width. Project cards carry `data-id` (used by tests/e2e.py).
  My projects is split into **Wood-burning patterns** and **Color certificates** sections (`projectCard`). `GET /api/projects` returns `versions{certificate,pyrography}` = latest artwork of each kind from `artHistory`; a project with both is listed in both sections, with a line under the title "Also as a pattern" / "Also as a certificate" (deliberately not an overlay on the picture — the old "+ WOOD-BURNING" corner tag read like a wrong label), and opening it from a section shows that section's version (`openProject(id,{output})`). Delete removes the whole project, both versions (confirm says so).
  Switching output always goes through `setOutputColors`/`useArtVersion`: pyrography forces burn tone and stashes the certificate colors in `style.certHead/certText`, restored when switching back.
- `scripts/build-prompts.mjs` → `public/data/prompts.json` (1,277 ideas; fields id,c,o,t,p,k).
- `tests/e2e.py` — Playwright suite (desktop + iPhone emulation). `tests/e2e_photos.py` — photo feature (fixtures in `tests/fixtures/`, public-domain/CC0).

## Photos (added 2026-10-31)
User photos are a **third layer** (artwork · photo · lettering), except in "Paint into art" mode. Three modes per project (`project.photo.mode`):
- `color` **Exact photo** and `graphite` **Exact graphite** — no AI, exact likeness. `public/js/photo.js` `renderPhotoCanvas()` does it all in the browser: crop (zoom + focus fx/fy) to the shape's aspect (oval/rounded 4:5, circle 1:1, full = original), soft-edge alpha mask (`fade`), and for graphite a colour-dodge pencil pass (blur radius from `detail`) multiplied by tonal shading (`shading`) + seeded paper grain, cool grey. Deterministic, so preview (760px), thumbnails (260px), PNG and PDF (1800px) match. Nothing rendered is stored; only the original upload is.
- `ai` **Paint into art** — `/api/art` gets `photoKey` (+ optional `photoSubject`); server loads the photo from R2 and calls `POST /v1/images/edits` (multipart, `image` + prompt, `input_fidelity=high`, auto-retried without it if the model rejects that field). `photoInstruction()` in design.js says where the subject goes per layout; the Paint button switches `framed` → `crest` so the subject gets a featured spot. Result art carries `fromPhoto: <photoKey>`. The photo layer stays visible in `ai` mode until the current art was painted from it (`photoPainted`/`photoLayerOn`); later redraws in `ai` mode keep sending the photo. Moderation refusal → message pointing to the exact modes. **Not yet verified against the real model.**
- Layout: `layout.splitForPhoto()` puts the photo inside the measured empty area — `left`/`right` or `top`. 100% size = a comfortable fit whichever way the area is tight (left/right: min(36% of width, 78% of height); top: min(36% of height, 45% of width)), and `size` (0.6–1.45) scales from there, capped at 98% of the area height / 55% of its width (top: 62% height / 70% width) — so the slider always works, including in short scene-layout areas (fixed 2026-10-31: it used to hit the height cap immediately and do nothing). Beside a photo, type size uses unit `U = max(textW, fullW*0.78)` and title/body may wrap to 3/8 lines, so lettering stays readable instead of shrinking to the column.
- Storage: `POST /api/photos` (raw JPEG/PNG body, ≤12 MB) → R2 `photo/{userId}/{ph_id}`, served owner-only by `GET /api/photo/...`. Client `prepareUpload()` shrinks to ≤2400px (PNG kept as PNG for logos → defaults shape `full`, no soft edge; others JPEG 0.92). Uploaded-this-session photos render from a local object URL (`localPhotos`).
- Defaults when added: graphite for wood-burning, color for certificates; position left if the empty area is wide, else top. Photo can be picked on the start screen (`state.pendingPhoto`, attached right after "Design it") or in the editor's Photo section. Tapping the photo on the design opens the Photo section.
- No background removal yet (would need an on-device cut-out model; the good one is AGPL and large). "Soft edges" + shape is the current answer to busy backgrounds.

## Fonts — important
TTFs are Google Fonts (OFL), static instances, subset to Latin, **GSUB removed**, name table renamed `RS-*`.
- GSUB removal is deliberate: pdf-lib applied ligatures/contextual alternates differently from the browser, causing gaps and lost text in PDFs.
- PDF embeds fonts with `subset: false` — pdf-lib's subsetter dropped glyphs (blank letters). Fonts are small, so full embedding is fine.
If you add a font: instance → pyftsubset → delete GSUB → add to FONT_FILES → verify with the e2e PDF text check.

## Project JSON (stored in D1 `projects.data`)
`{ id 'p_…', v, title, output, idea, createdAt, updatedAt, plan{layout,artPrompt,designNotes,source}, art{key,url,contentType,layout,output,test?}, artHistory[], text{name,title,body,date,kicker,presented,details,sig1Name,sig1Role,sig2Name,sig2Role}, style{lettering,headColor,textColor,certHead?,certText?,scale,offsetX,offsetY,widthScale,outline}, photo?{key,url,w,h,type,mode,shape,place,size,fade,shading,detail,zoom,fx,fy,subject?} }` — art may also carry `fromPhoto`.
A signature column renders if name OR role is set (role-only = blank line to sign by hand). Pyrography forces burn tone `#1f1610`.

## Export UX rules
- "Preview PDF" opens an in-app viewer (labelled *Preview only — not saved*). Saving is a separate action.
- On touch devices that support file sharing (iPhone Safari) the main button is **"Save to Files or Share…"** → native share sheet (Save to Files / Print / Mail). Elsewhere it is **"Download PDF"**. The PDF is pre-built when the sheet opens so the share call stays inside the tap gesture (iOS requirement).

## Resilience
- Artwork failure leaves current art + wording untouched; retry buttons on stage and panel.
- Dropped connection during generation (iPhone app switch): client polls `GET /api/art-latest?since=` and attaches finished artwork; also checked on reload via `rs.pendingArt`.
- Server errors never lose work: localStorage draft is restored if newer than cloud copy.

## Known gaps (as of 2026-10-31)
No password reset (no email provider); photos in R2 are never cleaned up either; no background removal; no admin UI; orphaned R2 images are never cleaned up; pyrography page sizes are fit-to-paper (no actual-size tiling); real-iPhone behaviour not yet verified; planner can produce awkward lead-in lines — see docs/TESTING.md.
