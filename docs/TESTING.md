# Test report — 2026-10-31

## How tested
- Local Cloudflare runtime (`wrangler pages dev`, local D1 + R2), **test mode** (placeholder artwork — OpenAI is not reachable from the build environment).
- Automated real-user flows in Chrome via Playwright: `tests/e2e.py`.
- "iPhone" below means **Chromium emulating iPhone 15 / SE screen size and touch**. It is **not** Safari on a real iPhone.

## Cases (all passing)
| Case | Device | Output | What it exercises |
|---|---|---|---|
| Union carpenter retirement (Mike Kowalski) | Desktop | Certificate | Library pick + edit, Workshop lettering, custom colors, 2 signatures + date, details line, PDF + PNG, simulated AI failure, redraw-with-change, switch to wood-burning version, restore version 1 |
| ICU nurse thank-you | iPhone emu | Certificate | Short wording, Elegant script, color change |
| Navy veteran appreciation | Desktop | Certificate | Engraved capitals, role-only signature line |
| Kindergarten graduation (very long name) | iPhone emu | Certificate | Handwritten lettering, name shrink-to-fit |
| Fishing-buddy plaque | iPhone emu | Wood-burning | Frontier lettering, outline lettering, cleared lines, mirrored transfer page |
| 25-year custodian (very long title/body/name) | Desktop | Certificate | Auto-fit of long wording, 2 signatures + date |
| Dog memorial plaque | Desktop | Wood-burning | Elegant lettering in burn tone |

Every case: sign in → design → type while art paints → lettering/color change → tap words on the design to edit → autosave → **reopen in a separate browser session** (simulated second device; data identical) → export → **PDF text extracted and compared with typed wording** → in-app PDF preview opens separately from saving.
Also tested: dropped connection mid-generation → artwork recovered automatically.

## Bugs found and fixed during testing
1. Desktop editor panel pushed off-screen (CSS class collision).
2. **PDFs missing letters** ("CER C E RE RE E") — pdf-lib font subsetting; now full font embedding.
3. **PDF spacing gaps / unextractable text** in script & handwritten fonts — ligature/alternate tables handled differently by pdf-lib; removed so preview == PDF.
4. Lettering-style cards all showed the same system font (attribute quoting bug).
5. iPhone: scrolled-to controls hidden under the pinned preview → scroll padding.
6. iPhone header wrapping; toasts covering form fields; style cards taking 4 rows on phones (now one swipeable row).
7. Ornament line cutting through the name's descenders.
8. Test-mode planner titled thank-you/veteran pieces "Certificate of Completion".

## Live test with real AI — 2026-10-31 (recognitionstudio.pages.dev)
Driven in the Claude desktop app's built-in browser (Chromium, desktop window — **not** an iPhone), account wagobart@gmail.com. 8 artwork generations ($0.97 actual per OpenAI dashboard ≈ $0.12 per design incl. planning). Saved in My projects:

| Project | Output | Result |
|---|---|---|
| Mike Kowalski — union carpenter retirement | Certificate | Tool belt, hammer, tape, framing square, pencil, oak leaves + walleye in border. Planner wording specific and accurate. 18 s. |
| Priya Natarajan, RN — Nurses Week | Certificate | Stethoscope hearts, roses, night sky; Elegant script. 25 s. |
| CPO Robert L. Hayes — Navy veteran | Certificate | Destroyers, ship's wheel, anchors, rope border; Engraved. 34 s. |
| Dale — railroad retirement, gone fishin' | Wood-burning | Clean burnable line art: walleye, lure, cattails, trestle + train; outline lettering. 32 s. |
| Copper — dog memorial | Wood-burning | Retriever portrait, paw prints, rainbow; lettering shifted to avoid the portrait. 34 s. |
| Isabella Gonzalez-Whitfield — kindergarten | Certificate | Crayons, blocks, balloons, caps; long name fits; Personal lettering. 32 s. |
| Bart Fitzgerald-Montgomery III — 25-yr custodian | Certificate | Very long title/body/name + 2 signers + date all fit. Then "change something" redraw (remove mops, add bell + autumn leaves) honored; wording kept; version 1 still selectable. 31 s. |

### Problems found with real AI, and fixes
1. **Lettering overlapped the artwork** (signature row on the border, text into the fish). The AI rarely leaves exactly the requested space → app now **measures the empty area of each image** and fits text inside it (`public/js/zone.js`). Verified on all 7 designs.
2. **Planner invented a date** ("2024") → numbers not present in the user's idea are now stripped from date/details/body/title.
3. **Planner left a placeholder** ("Years of Service: [Years]") → prompt forbids placeholders and bracketed fragments are removed.
4. Planner sometimes writes awkward lead-ins (e.g. "Forever in our hearts, remember") — editable by the user; not fixed automatically.

## Photos — 2026-10-31 (test mode)
`tests/e2e_photos.py`, passing. Desktop: photo picked on the start screen → exact photo → exact graphite → circle/right/125% → "Paint into art" (photo layer stays until the artwork is painted from it, then hides; framed switches to crest) → back to graphite → reopened in a separate session (photo settings identical, thumbnail shows it) → PDF + PNG contain the photo. iPhone 15 emulation: wood-burning memorial, photo added in the editor defaults to graphite, page never wider than the screen, mirrored transfer page mirrors the photo too. iPhone SE emulation: controls fit (mode buttons wrap to two lines).
Graphite quality checked by eye on a portrait and a cat at three shading levels: reads as a pencil drawing with exact likeness.
Fixed while testing: lettering shrank too much beside a photo — now keeps near full size and wraps.

Photo-only start (`tests/e2e_photo_start.py`, passing, test mode): no description + no photo → nudge; photo only → design starts (iPhone 15 emulation wood-burning → graphite; desktop certificate → color).

## Shared Examples — 2026-10-31 (test mode)
`tests/e2e_examples.py`: admin (desktop) adds a certificate and a no-artwork photo pattern to Examples from the ⋯ menu; a brand-new user (iPhone 15 emulation) sees Examples open in both sections, thumbnails load (no blocked images), sees only "Open a copy", opens each → own copy with every image copied into their account, edits the name, PDF has it; copies then list as their own designs and the Examples fold closes. Admin removes the example → copy still loads its artwork. All other suites re-run and pass (e2e.py's occasional 30 s timeout on one case pre-dates this; three clean runs after).
Live: 18 of Bart's projects seeded into Examples directly in D1; every image key they reference is in `example_assets` (checked by query). Not yet clicked through on the live site.

## Per-account artwork limit — 2026-10-31
Local server in live mode with a fake OpenAI key (so nothing is spent): new user with 14 designs used → request passes the limit check (then fails reaching OpenAI, as expected); at 15 → 429 `account_limit` with the friendly message; owner (UNLIMITED_EMAILS) with 20 used → passes. `/api/config` reports `accountArtLimit` 15 vs null. e2e.py re-run: all 7 pass.

## Public artwork gallery — 2026-10-31 (test mode)
`tests/e2e_gallery.py`: library idea + added name → art shared by default (switch on, toast says so, listed); switch off removes, on re-lists; own description → switch off, not listed; photo-painted art forced to share is still not listed; duplicated project listed once; deleted project unlisted. Signed-out iPhone visitor sees the gallery with images, tapping asks to sign in then holds the art on the start screen; Design it with no description → that art, 0 AI artwork calls, share switch hidden; editor "Use artwork from the gallery" swaps art (versions 2). Admin Hide removes it for everyone (hidden image → 404 signed out, checked with curl). All other suites re-run and pass.
Live: gallery seeded with 16 of Bart's artworks; not yet clicked through on the live site.

## Veterans Day gallery patterns, text fit, sign-in race — 2026-10-31
Three owner patterns load into the gallery from the repo on first gallery request (local check); designing over each with a name: eagle-head and folded-flag lettering fits the open area; eagle-over-lake (short wide box) had the signature row on top of the body → layout shrink floor made size-based, now fits. Intermittent e2e.py sign-in timeouts traced to a real focus race (password typed into email box) and fixed: 30/30 sign-ins, e2e.py clean twice. Library: laurel/vines removed from all ideas where they weren't the subject (11 genuine botanical mentions remain); "1th/21th birthday" → "1st/21st".

## Forgotten password — 2026-10-31 (test mode)
`tests/e2e_reset.py` (iPhone 15 emulation): Forgot → confirmation (same for an unknown email); link opens "Choose a new password" with the token stripped from the URL; new password signs in; the other device's session is signed out; old password 401, new 200; link reuse refused; 4th request in an hour sends nothing. e2e.py re-run: all 7 pass. Real email delivery through Resend not yet verified (needs RESEND_API_KEY + verified domain).

## NOT yet verified — required before calling it production-ready
- **Planner looking at a photo** with the real text model (test mode uses the built-in planner, which can't see images).
- **"Paint into art" with the real image model** (the edit endpoint + reference photo; test mode only shows placeholder art). Likeness quality and refusals for photos of people/children unknown.
- **Real iPhone photo picker** (HEIC from the camera roll, very large photos, Live Photos).
- Broader real-AI coverage (only 7 subjects tried so far; layouts art-left/art-right/crest not yet produced by the planner).
- **Real iPhone Safari**: share sheet → Save to Files, in-app PDF preview (iframe PDF rendering differs on iOS), keyboard + pinned preview behaviour, safe areas. Emulation cannot confirm these.
- Real print test of a Letter PDF and a mirrored transfer page on wood.
- Password reset, account deletion, abuse controls beyond invite-only sign-up.

### Portrait pages (2026-11-01)
`tests/e2e_portrait.py` (desktop 1440×900 + iPhone 15 emulation, test mode): Portrait chosen on the start screen → tall artwork (art.orient portrait, viewBox 1000×1500, stage 2:3), lettering inside the page, long name + two long signers + date → no overlaps (date on its own row), PNG 800×1200, PDF Letter 612×792; wood-burning version stays tall with 0 AI calls; "Redraw as a wide page" → one AI call with orient landscape, PDF 792×612, wording kept; tapping the tall version switches back; reopen from My projects keeps it, thumbnail viewBox tall. Plain design (photo + words): "Make it a tall page" flips instantly, photo moves to top, 0 AI calls, PDF portrait. iPhone: tall wood-burning pattern, preview 210×316 pinned above the form, no horizontal scroll. Gallery: shared tall art is listed with orient portrait, tile shows uncropped, using it sets Portrait and opens a tall design. Bart's three portrait Veterans Day seeds checked on iPhone: listed first, open tall, lettering inside each open area. All other suites re-run after the change. Real AI portrait artwork (1024×1536) not yet verified — the prompt asks for a "vertical 2:3 portrait page"; first real generation should be checked for where the model leaves the empty area.

