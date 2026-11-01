# CLAUDE.md — Crafted In Honor internals (authoritative reference)

**Brand (2026-10-31):** the app is **Crafted In Honor** (domain craftedinhonor.com; formerly "Recognition Studio"). The brand shows in the header (`Crafted <em>In Honor</em>`), page title, manifest (`short_name` "In Honor"), PDF creator/producer and the planner prompt. Infrastructure keeps the old names on purpose — renaming them would break deploys/data: GitHub repo `wagobart/recognitionstudio`, Pages project + D1 `recognition-studio`, R2 `recognition-studio-art`, `rs_` cookie/localStorage keys, `recognitionstudio.pages.dev` (still works).

Separate app and repo from Pyrography Patterns and Stitched Patterns. Do not assume features from either exist here.

## Core design principle
AI artwork and lettering are **separate layers**. The image model paints a decorative shell with a deliberately
**empty lettering area** and no text. All words are rendered by the app in real fonts. Therefore text edits,
font/color/size/position changes never call the AI and never cost money.

## Flow
1. Start screen: idea textarea + idea library + optional photo + output choice (certificate | pyrography) → "Design it". A description, a photo, or both — **a photo alone is enough** (no description required).
2. `POST /api/plan` → design plan (layout, artPrompt, lettering style, colors, starter wording, designNotes).
   With a photo, `startDesign` uploads it first and sends `photoKey`; the planner gets the image (`detail: low`) and designs around what it sees without putting the subject into artPrompt (the exact photo is a layer), returns `photoSubject` (prefills `photo.subject`), never guesses names/dates or that someone died. Photo-only `localPlan` fallback = neutral appreciation with an elegant frame. If the upload fails and there's no description, the user goes back to the start screen with the photo still chosen.
   Text model `PLANNER_MODEL` with strict JSON schema; on any failure or budget limit → `localPlan()` (keyword heuristics). `dropInventedFacts()` strips numbers not in the user's idea and `[placeholder]` fragments.
3. Editor opens immediately with the plan's wording over blank paper; user can type while art paints.
   `applyPlan` never overwrites fields the user already typed.
4. `POST /api/art` → `buildImagePrompt()` wraps artPrompt with composition rules for the layout + strict no-text rule;
   pyrography asks for a photorealistic grayscale graphite drawing (tonal shading, no color, lettering area kept pure white) — changed from black line art on 2026-10-31. Result stored in R2 `art/{userId}/{artId}`, served by `GET /api/art/...` (owner only).
5. Autosave: every change → localStorage draft immediately + debounced `PUT /api/projects/:id` (900 ms). Retries every 6 s on failure.

## Files
- `functions/api/[[path]].js` — single router: config, auth, plan, art, art-latest (recovery), art serving, projects CRUD.
- `functions/_lib/design.js` — LAYOUTS (5 compositions), lettering ids, planner prompt/schema, `buildImagePrompt`, `localPlan`. Planner rule (2026-10-31): borders are built from the subject's own objects and simple bands — no generic leaves/vines/flowers/wreaths/floral scrollwork unless the idea asks (veteran art was coming out leafy: the library's military ideas had laurel/poppies baked in, the planner's own example said "oak leaves", and "rich decorative border" invited scrollwork). Library: Military & veterans chip is first after All.
- `functions/_lib/openai.js` — image call: `POST /v1/images/generations`, model `IMAGE_MODEL` (`gpt-image-2.5-sunburst`), 1536x1024, quality high; planner uses `POST /v1/chat/completions` with `PLANNER_MODEL` (`gpt-4.1-mini`); maps errors to friendly messages (moderation, 429, 401).
- `functions/_lib/auth.js` — email+password (PBKDF2-SHA256 100k), session cookie `rs_session` (HttpOnly, 60 days), invite gate.
- `functions/_lib/mockart.js` — test-mode SVG artwork, tagged "TEST ARTWORK — not AI". Mock tweak `SIMULATE_FAILURE` returns 502 (test hook).
- `public/js/fonts.js` — 8 lettering STYLES (pairings) over 15 local TTFs. Size multipliers `k` equalize visual size.
- `public/js/layout.js` — **the one layout engine** (shrink floor is size-based: body text ≥ ~14 design units, so wide-and-short open areas can shrink further than narrow ones without the signature row overlapping the body): ZONES per layout in a 1500×1000 design space; stack (kicker, title ≤2 lines, lead-in, name 1 line shrink-to-fit, ornament rule, body ≤5 lines, details) + bottom row (up to 2 signature columns + date). Auto-shrinks to fit. User offsets: `style.offsetX/offsetY/widthScale/scale`.
- `public/js/zone.js` — `detectZone(url, layout)`: measures the artwork's calm/empty area (edge-density grid, shrinks a nominal rect until edges are calm). Stored as `art.zone`; `layout.zoneFor` uses it over the nominal ZONE. Computed on new art, recovered art, and on opening older projects.
- `public/js/render.js` — SVG preview, PNG (canvas) and PDF (pdf-lib) all draw from `computeLayout()`. PDF: artwork fit on Letter/A4/11×17 with 0.25" margin; optional mirrored 2nd page for pyrography transfer; outline lettering via PDF text render mode.
- `public/js/app.js` — UI state, editor, library, export, projects, auth, artwork recovery.
  Start screen heading is "Who are we honoring?" (not "celebrating" — memorials and tributes are first-class occasions).
  Header nav: Home (`#navHomeBtn` → `newDesign()`, saves current work, highlighted on the start screen) · My projects (folder) · account. Phones (≤480px): icons only, signed-in account is a person icon (full email in the Account sheet), "Sign in" never shrinks; the brand name truncates first so the header never exceeds the screen width. Project cards carry `data-id` (used by tests/e2e.py).
  My projects is split into **Wood-burning patterns** and **Color certificates** sections (`projectCard`). `GET /api/projects` returns `versions{certificate,pyrography}` = latest artwork of each kind from `artHistory`; a project with both is listed in both sections, with a line under the title "Also as a pattern" / "Also as a certificate" (deliberately not an overlay on the picture — the old "+ WOOD-BURNING" corner tag read like a wrong label), and opening it from a section shows that section's version (`openProject(id,{output})`). Delete removes the whole project, both versions (confirm says so).
  Switching output always goes through `setOutputColors`/`useArtVersion`: pyrography forces burn tone and stashes the certificate colors in `style.certHead/certText`, restored when switching back.
- `scripts/build-prompts.mjs` → `public/data/prompts.json` (1,277 ideas; fields id,c,o,t,p,k).
- `tests/e2e.py` — Playwright suite (desktop + iPhone emulation). `tests/e2e_photos.py` — photo feature; `tests/e2e_photo_start.py` — starting from only a photo; `tests/e2e_no_artwork.py` — photo + words, no artwork; `tests/e2e_examples.py` — shared Examples; `tests/e2e_gallery.py` — public gallery (fixtures in `tests/fixtures/`, public-domain/CC0).

## Certificate ↔ wood-burning versions are the identical artwork (no AI)
"Make the wood-burning / certificate version (same design)" (`convertOutput` in app.js) never calls the image model:
- If the other version already exists as this art's partner (`derivedFrom` either way), it just switches to it.
- Certificate → wood-burning: `photo.js deriveArtCanvas(art,'pyrography')` = the same graphite conversion as Exact-graphite photos (shading 0.5, detail 0.65) on the full image.
- Wood-burning → certificate (design that started as a pattern): same drawing mapped to sepia ink `#3a2616` on parchment `#f4ead5`. Full color would need the AI (drift), so it isn't offered.
- Result is uploaded as JPEG to `POST /api/art/derived?from=&output=&layout=` (no cost, no usage log) and gets `derivedFrom`, plus the source's `zone` and `fromPhoto`, so lettering sits exactly where it did. A color photo layer switches to graphite for the pattern (`wasColor`) and back.
Older projects whose two versions were AI-drawn separately (before 2026-10-31 evening) still differ; re-run the button from the certificate to get an exact pattern.

## Accounts and AI limits (2026-10-31, for the veterans-gift launch)
- Sign-ups are **open** (`SIGNUP_MODE = "open"`; `ALLOWED_EMAILS` only matters if switched back to "invite"). No email verification — one person can make several accounts.
- Every account gets **15 AI artwork designs in total** (`ACCOUNT_ART_LIMIT`, counted from `generations` kind='art' status≠'error', all time — existing accounts included). Accounts in `UNLIMITED_EMAILS` (wagobart@gmail.com) have no total. Over the limit `/api/art` → 429 `account_limit` with a message listing what's still free. Plans, derived versions (`/api/art/derived`), photos and no-artwork designs never count. Test mode (`AI_MODE=mock`) is never limited.
- Still applies to everyone: `DAILY_ART_LIMIT` 50/24h and the site-wide `MONTHLY_BUDGET_USD` guard (blocks **all** accounts, the owner's too, once estimated monthly spend is reached).
- Budget: `MONTHLY_BUDGET_USD` $75, `EST_COST_PER_IMAGE` $0.10 (actual 2026-10-31 OpenAI bill: 37 images + 24 plans = $2.87 ≈ 7.8¢/image). A claude.ai scheduled task "Crafted In Honor budget alert" (every 4 h) queries D1 and push-notifies Bart once per month at 80% and once when the cap is reached; sent alerts are recorded in D1 `app_alerts` (`budget-80-YYYY-MM`, `budget-100-YYYY-MM`) so each fires only once. If the budget number changes, the task reads it from wrangler.toml.
- `/api/config` usage: `artToday, artTotal, monthSpend, dailyArtLimit, accountArtLimit` (null = unlimited). The Artwork section note and Account sheet show "N of 15 AI artwork designs left" (`artLeftText`).

## Public artwork gallery (added 2026-10-31)
Shares **only the AI artwork** (never wording, names, photos). UI is deliberately minimal: the start screen's "Browse ideas & art" opens the same sheet with a seg **Ideas | Artwork gallery**; the Artwork section has one switch **"Share in the public gallery"** (shown only when the design has shareable art) and one text button **"Use artwork from the gallery — free"** (opens the sheet gallery-only).
- Default: shared when the design started from a library idea (`p.fromIdea {id,t,p}` set in `startDesign` if the textarea still contains the idea's text — adding a name keeps it); otherwise not. `p.share` (boolean) = the user's explicit choice and wins. First AI artwork that gets shared says so in the "Artwork ready" toast.
- Shareable art (`shareableArt` server / `shareableArtOf` client, keep in step): the newest `artHistory` item in the user's own `art/` folder that is not `derivedFrom`, `fromPhoto` (likeness — never shared), `fromGallery` or `fromExample`.
- D1 `gallery`: one row per project (`g_` + project id), synced on every `PUT /api/projects` (`syncGallery`), deleted with the project; the same `art_key` is listed once (duplicates skip). Title = `p.galleryTitle` || library idea title || "Certificate artwork"/"Wood-burning artwork" — never user text. `hidden` = removed by an admin (`DELETE /api/gallery/:id`, "Hide" on tiles for ADMIN_EMAILS); a new artwork on that project shows again.
- `GET /api/gallery?output=&offset=` is **public** (24 per page), and `GET /api/art/...` is public for non-hidden gallery keys (`canView`), so the gallery works signed out. Tapping a tile needs sign-in; `POST /api/gallery/:id/use` copies the image into the user's folder (free, no usage log) → art with `fromGallery`, `zone`, layout. Start screen holds it like a chosen photo (`state.pendingGallery`, `#startGalNote`) and, if the description box is empty, fills it with the gallery item's library idea text (or "<title>. For ") for them to add a name to (`state.galPrefill`, taken back on Remove if unchanged) — the description only drives the planner's wording, never the artwork; Design it plans wording (idea = their text || gallery idea || title) and uses that art — no `/api/art` call. In the editor it replaces the art (kept in versions).
- **Owner artwork shipped with the site** (`functions/_lib/seeds.js` + `public/gallery-seed/*.jpg`): the first `GET /api/gallery` after a deploy copies any missing seed into R2 (`art/<owner>/a_<id>`, owner = first ADMIN_EMAILS user) and inserts its row (`project_id 'seed'`, hand-set `zone`, layout, title, and an `idea` that tells the planner the art already carries its own text). To add one: drop a 3:2 landscape JPEG in `public/gallery-seed/`, add an entry with its measured zone. 2026-10-31: Bart's three landscape Veterans Day patterns (eagle over lake, eagle 'A Lifetime of Honor', folded flag). His three **portrait** patterns can't be used until the app supports portrait pages (design space is fixed 1500×1000 landscape).
- Seeded 2026-10-31 from Bart's 16 projects with AI art (`share: true` + `galleryTitle` without the fictional names set in their JSON). Example copies never re-list the owner's art. Test: `tests/e2e_gallery.py`.

## Shared Examples (added 2026-10-31)
Every signed-in user sees an **Examples** fold-out under each My projects section (Wood-burning patterns / Color certificates), listed by the same `versions` rule as their own projects. Open by default only when the user has none of their own in that section; thumbnails are drawn when first opened.
- D1 `examples` (snapshot of a project's JSON, id `ex_…`, `source_project`) + `example_assets(key, example_id)` = the R2 images (art, versions, `derivedFrom`, `fromPhoto`, photo) any signed-in user may view. `GET /api/art/...` and `GET /api/photo/...` allow owner **or** a key in `example_assets` (`canView`). Example images stay in the owner's R2 folder — if R2 cleanup is ever added it must skip keys in `example_assets`.
- `GET /api/examples` (list, same shape as projects via shared `listItem`, plus `admin`). Opening an example → `POST /api/examples/:id/copy`: server copies every image the project mentions (`ASSET_RE`) into the user's own `art/`/`photo/` folder, rewrites keys, inserts a new project with `fromExample` — so versions, photo, Paint-into-art, export all work as the user's own work. Copies survive the example being removed.
- Owners (`ADMIN_EMAILS` var, currently wagobart@gmail.com) get **Add to Examples** on their own cards' ⋯ menu (`POST /api/examples {projectId}`, a snapshot — later edits don't change it) and **Remove from Examples** on example cards (`DELETE /api/examples/:id`). Others see only "Open a copy".
- Seeded 2026-10-31 with all 18 of Bart's projects (ids `ex_` + project id without `p_`); Madison's account was not included. Test: `tests/e2e_examples.py` (needs `ADMIN_EMAILS=exadmin@example.com` in `.dev.vars`).

## Designs with no artwork (photo + words)
`project.plainBg = true` with `art = null` (`layout.plainOn(p)`): clean paper + optional app-drawn double-rule border (`plainPaper`: cream `#faf6ec` or white via `style.paper`, wood-burning always white; `style.border` default on, drawn in the heading color, insets 40/58) — rendered by SVG, PNG and PDF. Lettering area `PLAIN_ZONE` {120,105,1260,790}; a full-size photo stops inside the border.
- Start screen: once a photo is chosen, checkbox **"No artwork — just my photo and words"** (`#noArtToggle`). `startDesign` still plans (wording) but never calls `/api/art`; photo defaults to size 1.5.
- Artwork section in plain mode shows Paper / Simple border / **Add AI artwork** and hides the AI redraw controls. With artwork, **"Use no artwork"** sets plainBg and clears `art` (history kept; tapping a version, or any new artwork, clears plainBg). Version switching on a plain design just flips output (no art to convert). Export skips the "artwork isn't ready" prompt; opening skips the "no artwork yet" warning.

## Photos (added 2026-10-31)
User photos are a **third layer** (artwork · photo · lettering), except in "Paint into art" mode. Three modes per project (`project.photo.mode`):
- `color` **Exact photo** and `graphite` **Exact graphite** — no AI, exact likeness. `public/js/photo.js` `renderPhotoCanvas()` does it all in the browser: crop (zoom + focus fx/fy) to the shape's aspect (oval/rounded 4:5, circle 1:1, full = original), soft-edge alpha mask (`fade`), and for graphite a colour-dodge pencil pass (blur radius from `detail`) multiplied by tonal shading (`shading`) + seeded paper grain, cool grey. Deterministic, so preview (760px), thumbnails (260px), PNG and PDF (1800px) match. Nothing rendered is stored; only the original upload is.
- `ai` **Paint into art** — `/api/art` gets `photoKey` (+ optional `photoSubject`); server loads the photo from R2 and calls `POST /v1/images/edits` (multipart, `image` + prompt, `input_fidelity=high`, auto-retried without it if the model rejects that field). `photoInstruction()` in design.js says where the subject goes per layout; the Paint button switches `framed` → `crest` so the subject gets a featured spot. Result art carries `fromPhoto: <photoKey>`. The photo layer stays visible in `ai` mode until the current art was painted from it (`photoPainted`/`photoLayerOn`); later redraws in `ai` mode keep sending the photo. Moderation refusal → message pointing to the exact modes. **Not yet verified against the real model.**
- Layout: `layout.splitForPhoto()` — `left`/`right`/`top`. Size slider 0.6–2.0 (`PHOTO_SIZE_MAX`). Up to 100% the photo sits inside the measured open area (100% = comfortable fit whichever way the area is tight: left/right min(36% of width, 78% of height); top min(36% of height, 45% of width)). Past 100% it grows out over the artwork toward the page edge (`PAGE` = page minus 60/50 margin): at 200% left/right fill the full page height on that side (≤46% of page width), top fills up to 55% of page height; the lettering area moves over/down, keeping at least 32% page width / 30% height. Beside a photo, type size uses unit `U = max(textW, fullW*0.78)` and title/body may wrap to 3/8 lines so lettering stays readable. (History 2026-10-31: size was first capped by the open area, which made the slider useless in short areas and stopped photos at the text-box height.)
- Storage: `POST /api/photos` (raw JPEG/PNG body, ≤12 MB) → R2 `photo/{userId}/{ph_id}`, served owner-only by `GET /api/photo/...`. Client `prepareUpload()` shrinks to ≤2400px (PNG kept as PNG for logos → defaults shape `full`, no soft edge; others JPEG 0.92). Uploaded-this-session photos render from a local object URL (`localPhotos`).
- Defaults when added: graphite for wood-burning, color for certificates; position left if the empty area is wide, else top. Photo can be picked on the start screen (`state.pendingPhoto`, attached right after "Design it") or in the editor's Photo section. Tapping the photo on the design opens the Photo section.
- No background removal yet (would need an on-device cut-out model; the good one is AGPL and large). "Soft edges" + shape is the current answer to busy backgrounds.

## Forgotten password (added 2026-10-31)
Self-service by email through Resend (`functions/_lib/mail.js`; secret **RESEND_API_KEY**, var `MAIL_FROM` = "Crafted In Honor <noreply@craftedinhonor.com>" — that domain must be verified in Resend; optional `APP_URL` for the link, else the request's origin).
- Sign-in sheet modes (`setAuthMode`): login · signup · **forgot** ("Forgot your password?" link → email → "Email me a reset link" → same confirmation whether or not the account exists) · **reset** (opened from `/?reset=<token>`; token removed from the address bar; "New password" → signs in).
- `POST /api/auth/forgot`: 32-byte token, only its SHA-256 stored in D1 `password_resets`, 1 hour, single use; max 3 per account per hour (extra requests quietly ignored). Without RESEND_API_KEY: local mock server returns `devLink` (tests); anywhere else → 503 "aren't set up yet" (never claims an email was sent).
- `POST /api/auth/reset`: new PBKDF2 hash, marks token used, **deletes all the user's sessions** (signs out other devices), then signs this device in.
- Test: `tests/e2e_reset.py`. Verified live with a real email on 2026-11-01.

## Sign-in focus race (fixed 2026-10-31)
`needAuth` focuses the email box 60 ms after opening — now only if nothing in the sheet has focus yet. Before, a fast typist/password manager (and Playwright) could have the password typed into the email box ("email+password" → 401). This was the cause of the intermittent e2e.py sign-in timeouts.

## Icons (2026-11-01)
Award-ribbon mark (navy `#1f3a5f` tile, gold rosette + star + ribbon tails). `public/icon.svg` (full, rounded tile) · `favicon.svg` + `favicon.ico` (16/32/48) = simplified rosette without ribbons so it stays crisp in browser tabs · `icon-180.png` (apple-touch, square — iOS rounds it) · `icon-192/512.png` · `icon-maskable-512.png` (medal at 80% for Android masks). Header `.brand-mark` is the same mark in `currentColor` (viewBox cropped to `10 7 44 51`). Regenerate all from one script if the mark changes; never hand-edit the PNGs.

## Caching (2026-10-31)
`public/_headers` sends `Cache-Control: no-cache` for `/`, `/index.html`, `/js/*`, `/css/*` (browser re-checks each load; unchanged files are a quick 304). Added after an iPhone showed the new HTML (gallery tabs) with stale JS (tap did nothing). The `?v=` on app.js/app.css in index.html is a belt-and-braces bump — raise it when shipping UI changes.

## Fonts — important
TTFs are Google Fonts (OFL), static instances, subset to Latin, **GSUB removed**, name table renamed `RS-*`.
- GSUB removal is deliberate: pdf-lib applied ligatures/contextual alternates differently from the browser, causing gaps and lost text in PDFs.
- PDF embeds fonts with `subset: false` — pdf-lib's subsetter dropped glyphs (blank letters). Fonts are small, so full embedding is fine.
If you add a font: instance → pyftsubset → delete GSUB → add to FONT_FILES → verify with the e2e PDF text check.

## Project JSON (stored in D1 `projects.data`)
`{ id 'p_…', v, title, output, idea, plainBg?, createdAt, updatedAt, plan{layout,artPrompt,designNotes,source}, art{key,url,contentType,layout,output,test?}, artHistory[], text{name,title,body,date,kicker,presented,details,sig1Name,sig1Role,sig2Name,sig2Role}, style{lettering,headColor,textColor,certHead?,certText?,paper?,border?,scale,offsetX,offsetY,widthScale,outline}, photo?{key,url,w,h,type,mode,shape,place,size,fade,shading,detail,zoom,fx,fy,subject?} }` — art may also carry `fromPhoto`.
A signature column renders if name OR role is set (role-only = blank line to sign by hand). Pyrography forces burn tone `#1f1610`.

## Export UX rules
- "Preview PDF" opens an in-app viewer (labelled *Preview only — not saved*). Saving is a separate action.
- On touch devices that support file sharing (iPhone Safari) the main button is **"Save to Files or Share…"** → native share sheet (Save to Files / Print / Mail). Elsewhere it is **"Download PDF"**. The PDF is pre-built when the sheet opens so the share call stays inside the tap gesture (iOS requirement).

## Resilience
- Artwork failure leaves current art + wording untouched; retry buttons on stage and panel.
- Dropped connection during generation (iPhone app switch): client polls `GET /api/art-latest?since=` and attaches finished artwork; also checked on reload via `rs.pendingArt`.
- Server errors never lose work: localStorage draft is restored if newer than cloud copy.

## Known gaps (as of 2026-10-31)
Password reset by email verified live 2026-11-01 (RESEND_API_KEY set, craftedinhonor.com verified in Resend); photos in R2 are never cleaned up; no background removal; no admin UI; orphaned R2 images are never cleaned up; pyrography page sizes are fit-to-paper (no actual-size tiling); real-iPhone behaviour not yet verified; planner can produce awkward lead-in lines — see docs/TESTING.md.
