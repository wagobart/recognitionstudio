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

## NOT yet verified — required before calling it production-ready
- **Real AI quality**: planner wording/layout choice and image model actually leaving a clean, text-free lettering area for each composition. Needs the key + deployed site.
- **Real iPhone Safari**: share sheet → Save to Files, in-app PDF preview (iframe PDF rendering differs on iOS), keyboard + pinned preview behaviour, safe areas. Emulation cannot confirm these.
- Real print test of a Letter PDF and a mirrored transfer page on wood.
- Password reset, account deletion, abuse controls beyond invite-only sign-up.
