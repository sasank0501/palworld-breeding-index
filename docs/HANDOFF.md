# Handoff — 2026-10-14 (end of day)

Branch `paldb-ranks-and-theme`, pushed to origin at the end of this wrap. `npx tsc -b`, 267 tests and
`npm run build` ("no game art except 8 silhouette screenshots for the homepage tour and 289 species
silhouettes for browsing") pass; `npm run audit-a11y` on the dev server: no violations, no text under 12px.
**The public site is live at https://paldoc.app** (Cloudflare Pages project `paldoc-app`, Direct Upload),
today's build deployed after a check on the preview address. The portfolio build (`paldoc.pages.dev`,
project `paldoc`) is still the 2026-10-07 one. `docs/WEBSITE-PLAN.md` has every phase's detail
(today's work under Phase 8, "Also built 2026-10-14"; the new Phase 9); `docs/A11Y.md` the checklist.
Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before editing);
Chapter 24 is Phase 6. **Chapters for 6b, 7 and 8 are owed.**

## Phases

| Phase | Status |
|---|---|
| 0–7 | done (Safari optional, unverified; not measured: a laptop without a GPU, 8 GB of memory or less) |
| 8 Ship | **deployed 2026-10-14.** Left: redeploy the portfolio build; pal URLs nice to have |
| 9 Multi-player worlds | **planned 2026-10-14, not started.** Four steps in WEBSITE-PLAN; needs a real co-op or server save to verify |

## Pick up here

**Waiting on the user**
1. **Cloudflare Web Analytics is switched on for paldoc.app, and our CSP blocks it.** On the live domain
   Cloudflare injects `static.cloudflareinsights.com/beacon.min.js` and an inline snippet; `public/_headers`
   allows neither, so it collects nothing and every visitor's console shows two CSP errors (not on
   `*.pages.dev`). Either turn it off in the dashboard (Web Analytics, or the Pages project's setting), or
   allow it: `script-src https://static.cloudflareinsights.com` plus the snippet's hash, and
   `connect-src https://cloudflareinsights.com`. Turning it on also changes what can be said about "no
   analytics" (resume wording, 2026-10-14).
2. **O2, 3D expressions per animation:** go or no-go. Report given: the eye atlas is 2×4 cells and the
   chibi build pins one (happy closed); the mouth is the jaw bone only; switching cells per animation needs a
   one-pal proof that the 3D viewer can change a texture offset at run time.
3. **Phase 9 (multi-player):** start with step 1 (world type on the picker), or wait for a real save.
4. `reddit/post-2.md` still has `LINK` in it; Sky Strider's name rests on paldb plus the id (confirm in game);
   a real Game Pass save for the Xbox reader.

**Next, in order** (the model for each, as the working agreement asks)
1. **Redeploy the portfolio build** (Sonnet): delete `public/extractor/` first, `npm run build:resume`, check
   `dist-resume/` (no `roster.json`, Steam id, world names or source maps), deploy to `paldoc`.
2. **A version on the art pack** (Opus: touches the pack format). A player who extracted before a model fix
   (Cawgnito) keeps the old model and nothing tells them. Store the builder's version in `pack.json`; when it
   is behind, say "some pals have better models: make the art again". A saved `.paldocart` copy has the same
   gap: its index has `format` and `createdAt`, no builder version.
3. **Learning-page chapters** (Sonnet): 6b, then 7 and 8. Today gives Phase 8 material: the CSP and what it
   costs (`unsafe-eval`), font metric overrides, the hybrid planner and its research.
4. Optional: a personal-use line on "Save art to a file" (the file holds the game's art and can be shared).

**Known loose ends**
- **History still names PalSphere** in five pushed commits on this branch (`36fc695`, `ed4eb8d`, `e47899e`,
  `d2e921e`, `7f4c3ff`); `main` has none. The owner wanted it gone; the rewrite and force-push were blocked
  by the permission check. **Merge this branch into `main` with a squash merge**, and keep PalSphere out of
  its message.
- The Settings panel's art-stored and save-with-no-art states were only type-checked (dev serves art; the
  public build has no demo save).
- Settings' theme cards sit about 1.2 px high (Nunito, the body face); left as is.
- `.claude/skills/brag-slim/` and `skills-lock.json` are untracked on purpose (a skill installed for this
  project; the repo is public). Commit only if the owner says so.
- From before: `audit-a11y` never reaches a finished plan (now the summary row too); `npm run
  build-portraits` still fetches the game's icon files nothing shows; scripts that click "Try the demo save"
  fail; the lineage frame's pinch on a real touch screen and Full screen were not tried by hand;
  `scripts/build-passives.mjs` is stale; `@tanstack/react-virtual` is imported nowhere.

## Built on 2026-10-14 (details in WEBSITE-PLAN, Phase 8 "Also built 2026-10-14")

- **Deployed**: `paldoc.app` (domain the owner bought), security headers, npm audit 0.
- **Spotlight Party view** (`Dex.tsx`): Party / Potential / Passives, remembered per device, no Hide in Party.
- **Hybrid planner** (`Planner.tsx`, `showcase-views.css`): set up beside the result, then a summary row
  with Edit once there is a plan; containers move and grow.
- **Settings Files block** (`Settings.tsx`, `ArtSettings` in `Art.tsx`, `settings.css`).
- **Browse pair calculator** = `BreedingPair` with `browse`; `PairCalc.tsx` deleted.
- **Nav highlight slides** (`TabSlider.tsx`); **font metrics** (`font-metrics.css`, generated); element-chip
  contrast on light skins; **Save a copy of the art** (`.paldocart`); PalSphere dropped as a source.
- Sonnet did the font fix, the dots, the spotlight, the browse calculator, the nav slide and the Settings
  block; Opus the hybrid planner, the Figma mock-ups and the save research.

## Local tools (gitignored under `scripts/.cache/`)

- `planner-redesign/`: `capture-now.mjs` (today's planner, measured), `mock.mjs` (the A/B/C mock-ups by
  restyling the real planner), `time-solve.mjs` (solve times: 0.3–2.6 s on the main thread), **`check-real.mjs`**
  (the hybrid planner: 44 checks on desktop, phone, Obsidian, reduced motion), `smoke.mjs <url>` (a deployed
  site: landing, browse, calculator, Settings, console and CSP errors), `figma-*.json`.
- `home-mock/`: `align.mjs`, `audit-center.mjs` (text and icon centring in every box, all skins),
  `coffee-ink.mjs`, `guide.mjs` (a guide line through the coffee button), `labelalign.mjs`, `metrics.mjs` (font
  ascent, descent and cap height), `spot.mjs` (spotlight), `pair-browse.mjs`, `slide.mjs`, `slide-axe.mjs`,
  `s7-check.mjs`, `s7-public.mjs`, plus the older ones (`verify-landing.mjs`, `bpair.mjs`, `tree.mjs`, …).
- `o3/`: `strings.ts`, `strings2.ts`, `owner.ts`: read-only scans of the owner's save files (party, preset,
  owner fields). Run with `node`; they read `%LOCALAPPDATA%/Pal/Saved/SaveGames`.
- `icons/`: `figma.mjs` calls the local Figma connector from a JSON list (images go as files). **The Figma
  file is on the Starter plan: three pages, all used.** Adding a page fails without a clear error: the
  planner mock-ups are a frame on the "Breeding pair calculator mock-up" page, below the board.
- **Ports**: dev server **5174** (`npx vite --port 5174 --strictPort`), preview 4180;
  `APP=http://localhost:5174/ npm run audit-a11y`. Kill them when done.
- axe right after a page appears reports false contrast failures (cards fading in): wait about 3 s.
- A heredoc holding JavaScript with backticks and quotes fails in this shell: write the script with the
  Write tool. No Prettier config: don't run `npx prettier --write`.

## Deploying

Public site: `npm run build`, then
`npx wrangler@4 pages deploy dist --project-name paldoc-app --branch preview --commit-dirty=true`
(→ https://preview.paldoc-app.pages.dev), check it (`node scripts/.cache/planner-redesign/smoke.mjs <url>`),
then `--branch main` for https://paldoc.app. Portfolio: `npm run build:resume`, same command with
`dist-resume --project-name paldoc`. If `public/extractor/` exists, both builds copy it (43 MB); the
portfolio doesn't use it, so delete it before `build:resume`. Deploying needs the owner's yes each time.

## Decisions

- **2026-10-14 (owner):** Settings is version B (one Files block). The planner is the hybrid (choose beside,
  then a summary row; the layout stays put after the first plan; containers move and grow). Spotlight: option C,
  right-aligned, Party first, last view remembered, no Hide in Party. No "…" on buttons. Work icons: style 1.
  Squash-merge to `main`. The owner's saves are solo only (no co-op, no server).
- **2026-10-13 (owner):** element icons are the mark alone (style C); the lineage tree is steps as columns in a
  zoom frame, a ladder on phones; Panthalus stays epic; "Upload save" keeps its wording; Pocketpair's
  permission is not sought first (content comes down on notice); **the site names no data-source websites**.
- **Not a source:** PalSphere (dropped 2026-10-14; data checked against the game's own tables).
- **Game art in the repo**: none, except the 8 tour screenshots and 289 species outlines (2026-10-12).
- **Extractors**: 4 / 3 / 2 / 1 by cores and memory, 2 where the browser won't report memory; the player
  may override, within half the processor's threads.
- **Data changes**: only when two independent sources agree against ours.
- **Dark mode**: follow the system until a pick. **Rarity**: 1–5 gems. **Motion**: only a pal's idle
  animation moves on its own, and every stage can pause it; layout changes the player starts may animate.
- **Hosting**: Cloudflare Pages by Direct Upload. **Game file**: one `Pal-Windows.pak`.
- **Name**: PalDoc; the species list inside it, and its tab, are the Paldex.
- **Working agreements** (in memory): recommend Opus or Sonnet before each task; learning chapter at each
  phase's end; don't file upstream issues for him; timings in seconds also get "N min M s".

## How things work

Dev: `npm run dev` (loads `public/roster.json` + server art, so the landing page, browse mode and the
extraction notice don't show: test those on the public build; a pack stored in the browser wins over the
server's art). Public build: `npm run build` then `npx vite preview`. Extractor runtime: `npm run
build-extractor` once after a fresh clone (needs the .NET 10 SDK). Font metric overrides: remeasure with
`scripts/.cache/home-mock/metrics.mjs`, then `node scripts/build-font-metrics.mjs`. Pipelines as in
WEBSITE-PLAN.md and README.
