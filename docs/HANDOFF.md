# Handoff — 2026-10-13

Branch `paldb-ranks-and-theme`, pushed to origin at the end of this wrap. It now holds the work of
2026-10-12 (a session that ended on a usage limit before it could wrap) and 2026-10-13. Type-check,
226 tests and `npm run build` ("no game art except 8 silhouette screenshots for the homepage tour and
289 species silhouettes for browsing") pass. `npm run audit-a11y` on the dev server: 0 axe violations
on 48 scans, no text under 12px. Not re-run: `npm run build:resume`.
**Phases 0–6 and the main part of 6b are done; Phase 8 is under way** (landing page, browse mode,
self-hosted fonts). `docs/WEBSITE-PLAN.md` has every phase's detail and measurements; `docs/A11Y.md`
the checklist.
Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before
editing); Chapter 24 is Phase 6. One chapter per phase, at the phase's end, so **Phase 6b's chapter
is owed**.

**The site is called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev** (Cloudflare
Pages project `paldoc`, Direct Upload); it has not been redeployed since 2026-10-07, so it shows none
of the work below. The public site isn't deployed.

## Phases

| Phase | Status |
|---|---|
| 0–6 | done (6: 333 models, 207 MB, matching the desktop's; stop/resume works) |
| 6b Faster extraction | main part done 2026-10-11: 143–223 s (2 min 23 s to 3 min 43 s) with 3 extractors, was 617–654 s (10 min 17 s to 10 min 54 s). Extractor count is now 4 / 3 / 2 / 1 by machine (owner's rule, 2026-10-12). Left, optional: the player's own pals first (Sonnet), AOT (Opus, experiment) |
| 7 A11y + cross-browser | automated part done 2026-10-09. Left, by hand: NVDA (extraction notice, species → My Pals → pal sheet, and now the landing page, its dialog, browse mode and the pair calculator), Windows' real contrast themes, Firefox extraction, a laptop without a GPU. Safari is optional |
| 8 Ship | portfolio site live. Done: landing page, browse mode, self-hosted fonts. **Left: our own work and element icons**, then deploy the public site and add the GitHub issues link; pal URLs nice to have |

## Pick up here

**Waiting on the user**
1. **Try the pair calculator** and say whether it stays, and whether visitors with a save get it too
   (it shows in browse mode only). `npm run build`, `npx vite preview`, **Browse the Paldex**: the
   card under the hero. Screenshots: `scripts/.cache/home-mock/pair/`.
2. **Sky Strider** (`RideJumpCount_Increase2`): the name and "+2" rest on paldb plus the id, not on
   two sources. Confirm in game if you can (Warsect Terra and Whalaska alphas carry it).
3. **Hand tests for Phase 7** (only you can do these): NVDA through the landing page, the upload
   dialog, browse mode and the extraction notice; High Contrast; the extraction in Firefox.
4. **A real Game Pass save** for the Xbox reader (marked Beta; only ever fed a Steam save repacked
   into the Xbox layout).
5. Cloudflare Web Analytics (dashboard → Workers & Pages → paldoc → Metrics → Enable, then redeploy);
   the Reddit follow-up `reddit/post-2.md` still has `LINK` in it.

**Next, in order** (the model for each, as the working agreement asks)
1. **Our own element and work icons** (Opus: design work). The owner's direction (2026-10-12):
   "as similar to the game icon but with our webpage in mind". Nothing is drawn yet. Nine elements
   (`ElementIcon` in `src/routes/showcase/parts.tsx`, files in `public/element-icons/`) and twelve
   work icons (`public/work-icons/`), today `.webp` files fetched from paldb's mirror of the game's
   files and gitignored, so the public build has none. Inline SVG that takes the skin's colours is
   the obvious form.
2. **Deploy the public site** (Sonnet), with the GitHub issues link; redeploy the portfolio build
   after `npm run build:resume` is checked.
3. **Learning-page chapter for Phase 6b** (Sonnet): Amdahl's law, cores against memory, workers
   sharing a queue, why a 42-pal sample over-promised. Sources checked and linked, a quiz.
4. **Time the card stills in a normal (headed) window** (Sonnet, about 10 min): 396 s (6 min 36 s)
   headless against 94 s (1 min 34 s) in Phase 5.
5. Optional: the player's own pals first; AOT of the mesh export; the Safari storage fix (below).

**Known loose ends**
- Local scripts under `scripts/.cache` that click "Try the demo save" fail: the public build has no
  demo button any more (`extract/e2e.mjs` among them). They need the upload dialog or browse instead.
- `scripts/build-passives.mjs` is stale: it would overwrite `passives.json` with an older 104-entry
  table. It carries a warning; new passives go through `npm run compare-sources -- --apply`.
- Tour screenshots are desktop-width only. Not checked by hand on the landing page: NVDA, Firefox,
  Safari, a laptop without a GPU.
- Eternal Flame is tier 3 in ours, rank 4 on paldb, something else on PalSphere: left alone.
- Small cleanups from before: `@tanstack/react-virtual` is imported nowhere; `docs/UX-BRIEF.md:39`
  says "virtualised"; the species page's collection card says "8 owned" twice; some spotlight pals
  are framed from above (Warsect Terra); `ExtractorTest` still has the step-5 "Export pals" path.

**Optional, any time: finish the Safari storage fix.** Committed but not verified: on Playwright's
WebKit the page's OPFS `createWritable()` reports success and leaves empty files; `src/art/storage.ts`
`writeFile` now checks each write's size and falls back to `src/art/opfsWrite.worker.ts`. To verify:
`npm run build`, `npx vite preview --port 4180 --strictPort`, then
`PUB=http://localhost:4180/ node scripts/.cache/a11y/webkit-short.mjs`, then the full
`scripts/.cache/extract/e2e-webkit.mjs` (it uses the demo button: fix that first). A pass there is
"probably fine on a Mac", not proof.

## Built on 2026-10-12 and 2026-10-13 (details in WEBSITE-PLAN and docs/data-gaps.md)

- **Landing page** (`src/routes/home/`): a full-screen hero, a scroll-driven tour of the five pages
  (`reel.ts`, 14 tests), an **Upload save** dialog with both save paths. No demo button on the
  public build. Tour pictures: `npm run capture-tour` → `src/design/tour/` (8 silhouette screenshots).
- **Browse the Paldex** (`src/lib/browse.ts`): a visit with no save. All 289 species as silhouettes
  (`npm run build-silhouettes` → `public/silhouettes/`), search, element filters, species pages with
  every parent pair. On a phone it is the way in. `browse.test.ts` fails if a silhouette is missing,
  stray, large or coloured.
- **Pair calculator** (2026-10-13, `src/lib/pair.ts`, `src/routes/showcase/PairCalc.tsx`): two
  parents in, the child out, on the browse page. A demo for the owner to judge.
- **Xbox / Game Pass saves** (`src/save/xbox.ts`): reads the `wgs` folder and maps it to the Steam
  layout. Beta: never tried on a real Game Pass save.
- **Extractor count** by machine: 4, 3, 2 or 1 (`extractorCount` in `src/extract/pool.ts`).
- **Data cross-check** (`npm run compare-sources`): ours against PalSphere's open data export, paldb
  and palworld.gg. A value changes only when two independent sources agree. Result: 10 passives
  added (118 now), nothing else changed.
- **Self-hosted fonts** (`src/design/fonts.ts`, `public/font-licenses.txt`): six typefaces from the
  Fontsource packages, 0 outside requests.
- **Smaller:** rarity gems no longer overlap.

## Local tools (gitignored under `scripts/.cache/`)

- `home-mock/`: `verify-landing.mjs` (the landing page on the public build), `verify-fonts.mjs`
  (fonts load from the site, nothing outside), **`pair.mjs`** (new: the pair calculator's answers,
  phone width, axe in four skins). All take `APP=`, default `http://localhost:4180/`.
- `extract/`: `e2e.mjs`, `workers.mjs`, `models-compare.mjs`, `cmp-tex.mjs`, `pack.mjs`, `bench.mjs`
  and the rest, as before (see WEBSITE-PLAN Phase 6 and 6b).
- `a11y/`: `p7-*.mjs`, `webkit*.mjs`. WebKit install: `npx playwright-core install webkit`.
- `sources/`: the cached pages and files `compare-sources` fetched, and its `report.md`.
- **Ports**: PalDoc's dev server runs on **5174** (`npx vite --port 5174 --strictPort`), the preview
  on 4180. `APP=http://localhost:5174/ npm run audit-a11y`. Kill them when done.
- No Prettier config in the repo: don't run `npx prettier --write`.
- Node's `fs.openAsBlob` reports 32-bit sizes for files over 4 GiB: test big files in a browser.

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name paldoc --branch preview --commit-dirty=true`
(→ https://preview.paldoc.pages.dev), and `--branch main` for the live site. If `public/extractor/`
exists, both builds copy it (43 MB); the portfolio doesn't use it, so delete it before
`build:resume`. Before each deploy: `dist-resume/` has no `roster.json`, Steam id, world names or
source maps.

## Decisions

- **2026-10-13 (owner):** Panthalus stays epic, as the game's rarity has it. "Upload save" keeps its
  wording. Pocketpair's permission is not sought first: content comes down on notice. **The site
  names no data-source websites**; credits live in the README (PalSphere's data terms need one).
- **Game art in the repo**: none, except the 8 tour screenshots and 289 species outlines, all
  silhouettes (owner, 2026-10-12).
- **Extractor output**: lite models only. **Extractors**: 4 / 3 / 2 / 1 by cores and memory, 2 where
  the browser won't report memory.
- **Data changes**: only when two independent sources agree against ours.
- **Dark mode**: follow the system until a pick. **Rarity**: 1–5 gems. **Motion**: only a pal's idle
  animation moves on its own, and every stage can pause it.
- **Mappings**: latest `UsefulFiles`, verified by a real decode, fallbacks, else ask the player.
- **Hosting**: Cloudflare Pages by Direct Upload. **Game file**: one `Pal-Windows.pak`.
- **Name**: PalDoc; the species list inside it is the Paldex.
- **Working agreements** (in memory): recommend Opus or Sonnet before each task; learning chapter at
  each phase's end; don't file upstream issues for him; timings in seconds also get "N min M s".

## How things work

Dev: `npm run dev` (loads `public/roster.json` + server art, so the landing page, browse mode and the
extraction notice don't show: test those on the public build). Public build: `npm run build` then
`npx vite preview`. Extractor runtime: `npm run build-extractor` once after a fresh clone (needs the
.NET 10 SDK). Test art pack: `npm run make-art-pack`. Pipelines as in WEBSITE-PLAN.md and README.
