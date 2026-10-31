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

## NOT yet verified — required before calling it production-ready
- Broader real-AI coverage (only 7 subjects tried so far; layouts art-left/art-right/crest not yet produced by the planner).
- **Real iPhone Safari**: share sheet → Save to Files, in-app PDF preview (iframe PDF rendering differs on iOS), keyboard + pinned preview behaviour, safe areas. Emulation cannot confirm these.
- Real print test of a Letter PDF and a mirrored transfer page on wood.
- Password reset, account deletion, abuse controls beyond invite-only sign-up.
