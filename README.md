# Crafted In Honor

(Formerly "Recognition Studio" — infrastructure names such as the Pages project, D1 database and R2 bucket keep the old `recognition-studio` names.)

AI-designed awards, certificates and wood-burning (pyrography) recognition pieces.
Describe the person and occasion → AI plans the layout and paints custom artwork → you fill in
exact wording and lettering with a live preview → save to your account → export a print-ready PDF.

**Status: beta, not production-ready.** See `docs/TESTING.md` for what has and hasn't been verified.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Pages + Pages Functions | Matches existing deploy flow (Git → Pages) |
| Database | Cloudflare D1 `recognition-studio` (id `0e69c3fc-…`) | Accounts, projects, usage log |
| Artwork storage | Cloudflare R2 `recognition-studio-art` | Generated images, private per user |
| AI | OpenAI (planner text model + image model), called **only from the server** | Key never reaches the browser |
| Frontend | Plain HTML/CSS/ES modules, no build step | Simple to deploy and maintain |
| PDF | pdf-lib + fontkit in the browser | Real vector text in the exact on-screen typefaces |

D1 and R2 are already created in the Cloudflare account and the schema is applied.

## OpenAI key (do this once)

The key is stored as an **encrypted Cloudflare Pages secret** — never in the repo, `wrangler.toml`, or browser.

1. In the OpenAI dashboard create a **new project** called "Recognition Studio" and set its
   **monthly budget** (hard limit) — this is the real spending ceiling, separate from Pyrography Patterns.
2. Create an API key inside that project.
3. Cloudflare dashboard → Workers & Pages → `recognition-studio` → Settings → Variables and Secrets →
   **Add → Type: Secret**, name `OPENAI_API_KEY`, paste the key → Save. (Or: `npx wrangler pages secret put OPENAI_API_KEY --project-name recognition-studio`.)
4. Redeploy (any push, or "Retry deployment").

Until the secret exists the server automatically runs in **test mode** (free placeholder artwork, "TEST MODE" badge).

## Spending controls (three layers)

1. **OpenAI project budget** — hard stop at OpenAI.
2. **App monthly ceiling** `MONTHLY_BUDGET_USD` (default $25) — estimated spend across all users; when reached,
   artwork generation pauses but editing/export keep working.
3. **Per-user daily limit** `DAILY_ART_LIMIT` (currently 50 artworks per rolling 24 h).

Estimates use `EST_COST_PER_IMAGE` — the 2.5 image models bill per token, so tune this from the OpenAI usage dashboard after a few real runs.

## Deploy

1. Create a GitHub repo (e.g. `recognition-studio`), push this folder.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
   Build command: *(none)*. Output directory: `public`. Cloudflare reads bindings and vars from `wrangler.toml`.
3. Add the `OPENAI_API_KEY` secret (above) and redeploy.
4. Sign-ups are **invite-only**: only emails in `ALLOWED_EMAILS` can create accounts. Add testers there (comma-separated) or set `SIGNUP_MODE = "open"`.

Note: `[vars]` in `wrangler.toml` override dashboard values on every deploy — change settings in the file.

## Settings (`wrangler.toml` → `[vars]`)

| Var | Default | Meaning |
|---|---|---|
| `AI_MODE` | `live` | `mock` = free placeholder art, no OpenAI calls |
| `IMAGE_MODEL` | `gpt-image-2.5-sunburst` | Image model (same family as Pyrography Patterns) |
| `IMAGE_SIZE` / `IMAGE_QUALITY` | `1536x1024` / `high` | 3:2 landscape |
| `PLANNER_MODEL` | `gpt-4.1-mini` | Text model that plans layout/wording; falls back to a built-in planner if it fails |
| `SIGNUP_MODE`, `ALLOWED_EMAILS` | `invite`, owner email | Who can register |
| `ADMIN_EMAILS` | owner email | Who can add/remove shared Examples (⋯ menu in My projects) |
| `DAILY_ART_LIMIT`, `MONTHLY_BUDGET_USD`, `EST_COST_PER_IMAGE` | 30, 25, 0.25 | Spending guards |

## Local development

```
npm install
npx wrangler d1 execute recognition-studio --local --file=schema.sql
echo -e "AI_MODE=mock\nSIGNUP_MODE=open" > .dev.vars
npx wrangler pages dev public --port 8788
python3 tests/e2e.py http://127.0.0.1:8788      # end-to-end UI suite (needs Playwright + Chrome)
node scripts/build-prompts.mjs                   # rebuild the idea library
```
