# Handoff — 2026-10-09 (end of day, second wrap)

Branch `paldb-ranks-and-theme`, pushed to origin except the Safari storage fix below (committed
unverified; see "Pick up here"). Type-check, 158 tests and `npm run build` ("no game
art") pass; `npm run audit-a11y` is 0 axe violations and no text under 12px; the new extraction notice
is axe-clean in its four states (ready, running, stopped, asking for mappings) in all four themes.
**Phase 6 is done**: on the public build, a fresh Edge profile goes from the landing page to the 3D
Paldex using only `Pal-Windows.pak` and a save, with a stop, reload and resume on the way.
`docs/WEBSITE-PLAN.md` has every phase's detail and measurements; `docs/A11Y.md` the checklist.
Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before
editing); Chapter 24 is Phase 6, with quiz and evidence. One chapter per phase, at the phase's end.

**The site is called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev** (Cloudflare
Pages project `paldoc`, Direct Upload). The old `sasank-paldex` project was deleted on 2026-10-09
(its address no longer resolves). The public site isn't deployed: Phase 6 no longer blocks it; Phase 7 and the
Phase 8 must-haves do (below).

## Phases

| Phase | Status |
|---|---|
| 0–6 | done (6: 333 models in ~10 min, 207 MB, matching the desktop's; stop/resume works) |
| 7 A11y + cross-browser | **automated part done 2026-10-09** (A11Y.md items 1–14: dark mode follows the system, phone filters fold, 400% reflow, forced colors, focus fixes, rarity gems). Left, by hand: NVDA through the extraction notice and species → My Pals → pal sheet (script in A11Y.md), Windows' real contrast themes, real Safari/iPhone, Firefox extraction, a laptop without a GPU. **Safari work in progress** (below) |
| 8 Ship | portfolio site **live**. Public site needs: our own work/element icons (replacing paldb's), self-hosted fonts, deploy + GitHub issues link; pal URLs nice to have |

## Pick up here

**Waiting on the user**
1. **Cloudflare Web Analytics** (nothing counts visits yet): dashboard → Workers & Pages → paldoc →
   Metrics → Enable, then redeploy. The status-line mod `paldoc-visits` needs an API token (Account
   Analytics: Read) in `PALDOC_CF_ANALYTICS_TOKEN`; untested on the real account.
2. Reddit follow-up `reddit/post-2.md` (gitignored): replace `LINK` with the first post's URL.
3. **Hand tests for Phase 7** (only you can do these): NVDA through the extraction notice (Add the
   game art → choose the pak → progress → Stop → Finish adding), High Contrast, Safari on a Mac or
   iPhone, and the extraction in Firefox.

**First job next session: finish the Safari storage fix.** Running the extraction in Playwright's
WebKit (Safari's engine, on Windows; no Mac at hand) found real bugs; three are fixed and pushed
(`encodeImage`: Safari's canvas can't encode WebP and returns PNG, textures carry their real type;
no `OffscreenCanvas` fallback; IndexedDB fallback stores bytes, since WebKit has refused Blobs;
`extractAll` gives up after 3 failures before any success). The fourth is **committed but not
verified**: on that WebKit the page's OPFS `createWritable()` reports success and leaves **empty
files**, so an extraction looks fine and keeps nothing, and the app then shows "Add the game art" as
if no pack exists. Stable Safari mostly lacks `createWritable` too. The fix (`src/art/storage.ts`
`writeFile`, new `src/art/opfsWrite.worker.ts`): check each write's size, fall back to a worker that
writes with a sync access handle. To verify: `npm run build`, `npx vite preview --port 4180
--strictPort` (background task), then `PUB=http://localhost:4180/ node
scripts/.cache/a11y/webkit-short.mjs` (a few pals, stop, reload: the pack must still be there, files
non-empty), then the full `scripts/.cache/extract/e2e-webkit.mjs` (~25 min, with a watcher on its
log: an earlier run sat silent for hours). Also worth a line in the learning page's Phase 6 chapter
once confirmed. Note `getDirectory()` failed with `UnknownError` in fresh non-persistent WebKit
contexts, and worked in persistent ones: the app falls back to IndexedDB when it throws.
Not Safari itself: a pass is "probably fine on a Mac", not proof.

**Then, by size** (rough estimate to ship: 4–6 sessions)
- Phase 8 must-haves: **our own work and element icons** (design work, the biggest piece; Opus),
  **self-host the fonts** (Google Fonts sees every visitor's IP; Sonnet), deploy the public site.
- Phase 7 fixes from the hand tests above (Opus for whatever NVDA/Safari turn up).
- Measure the card stills in a normal (headed) window: 392 s in the headless e2e vs 94 s in Phase 5.
- Phase 7 hand tests (above), then the learning chapter for Phase 7.

**Small cleanups** (Sonnet-sized): `@tanstack/react-virtual` is imported nowhere;
`docs/UX-BRIEF.md:39` says "virtualised"; `docs/data-gaps.md:12,16` are stale; the species page's
collection card says "8 owned" twice; some spotlight pals are framed from above (Warsect Terra);
`ExtractorTest` (dev bench) still has the step-5 "Export pals" path beside "Extract to pack".

## Built on 2026-10-09 (details and numbers in WEBSITE-PLAN, Phase 6 steps 6–8)

- **Step 6, the models in the browser** (`src/extract/model/`): a port of `build-pal-models.mjs
  --lite`: `psa.ts`, `chibi.ts`, `animate.ts`, `materials.ts` (channel remaps on RGBA arrays),
  `build.ts` (`buildModel`, `foldAliases`, `manifestText`), `encodeWebp.ts` (OffscreenCanvas).
  **Lite only, by the user's decision**: chibi, 512 px, meshopt, `normal: false`.
  `build.local.test.ts` compares with `public/pal-models-lite` (skipped without the desktop's staging
  folder): 288/288 match; `ALL=1` for every model, `BROWSER=<dir>` for models built in Edge
  (`scripts/.cache/extract/models.mjs`). glTF-Transform and meshoptimizer moved to dependencies;
  the builder loads only when an extraction starts (383 KB chunk).
- **Step 7, game to pack** (`src/extract/pipeline.ts`, `extractToPack`, 4 tests): icons, then models,
  pack live (`complete: false`) after the icons, manifest saved every 10 pals, a stopped run resumes
  the same pack, old pack deleted only when the new one is whole. Full run: 617 s, 333 models, 289
  icons, 207 MB, 0 failures.
- **Step 8, the player's screen**: the "Add the game art" notice (`src/routes/showcase/Art.tsx`) leads
  with `GameFilePicker` (new `intro` prop); the art-pack folder is under "Already have an art pack
  folder?". `src/extract/extractRunner.ts` holds the run's state: .NET start (90 s timeout), mappings
  (or ask for a `.usmap`; says "offline" when nothing downloaded), progress with player names and
  time left, Stop, "Finish adding" after a stop, `beforeunload` only during a run, screen readers hear
  every 10%. Card stills wait for a complete pack. Settings: "Add/Make the art from your game…".
  First inline link styled (ink + underline; the default blue was 1.95:1 on Obsidian).
- Learning page Chapter 24, and a phone-overflow fix in Chapter 22 (a long verdict pill).

## Built later on 2026-10-09 (Phase 7, automated; details in A11Y.md)

Dark mode follows the system until a theme is picked; the Paldex filters fold behind a "Filters"
button under 640 px (first tile 1,695 → 1,421 px); sticky nav and notice scroll on short windows
(400% reflow); forced-colors focus and pressed states; focus kept on "Find the lineage" and in the
art notice; rarity as 1–5 gems with an ink edge and the tier in the tile's name. WebKit findings
and fixes above. Seven commits, 0 axe violations, no text under 12 px.

## Local tools (gitignored under `scripts/.cache/`)

- `extract/`: `e2e.mjs` (the Phase 6 "done when", public build: landing → demo save → pak → stop →
  reload → resume → stills; `APP=http://localhost:4180/` after `npm run build` and
  `npx vite preview --port 4180 --strictPort`), `axe-notice.mjs` (notice states × themes),
  `offline-check.mjs`, `pack.mjs` (bench "Extract to pack", fresh profile), `pack-app.mjs`,
  `models.mjs`, `export.mjs`, `compare.mjs`, `icons.mjs`, `picker.mjs`, `bench.mjs`,
  `peek-profile.mjs` (reopen the last e2e profile and read its pack).
- `a11y/`: `p7-checks.mjs`, `p7-reflow-hc.mjs`, `p7-planner-kbd.mjs`, `p7-pips.mjs`, `webkit.mjs`
  (all screens + axe + iPhone size + extraction start in WebKit), `webkit-short.mjs`,
  `webkit-storage-probe.mjs`, `webkit-opfs-write.mjs`; `extract/`: `e2e-webkit.mjs`,
  `notice-kbd.mjs`. WebKit install: `npx playwright-core install webkit`.
- **Ports**: another project's Vite starter was on 5173 this session; PalDoc ran on **5174**
  (`npx vite --port 5174 --strictPort` as a background task). Most scripts take `APP=`.
- `learn-check.mjs PAGE` (quiz option lengths, axe on Chapter 24, phone overflow) and
  `learn-overflow.mjs` for the learning page.
- `reddit/shots.mjs`, `a11y/…`, `diag/…` as before. `.claude/skills/wrap-it-up/`. Node's
  `fs.openAsBlob` reports 32-bit sizes for files over 4 GiB: test big files in a browser.
- No Prettier config in the repo: don't run `npx prettier --write` (it rewraps at 80 columns).

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name paldoc --branch preview --commit-dirty=true`
(→ https://preview.paldoc.pages.dev), and `--branch main` for the live site. Logged in
(`npx wrangler whoami`). Rollback: dashboard → Deployments → ⋯. If `public/extractor/` exists, both
builds copy it (43 MB, 213 files); the portfolio doesn't use it, so delete it before `build:resume`.
Creating a project is the user's job (`--force`, classic Pages). Before each deploy: `dist-resume/`
has no `roster.json`, Steam id, world names or source maps.

## Decisions

- **Extractor output**: lite models only (user, 2026-10-09).
- **Dark mode**: follow the system until a pick (Palpagos light, Obsidian dark). **Phones**: filters
  fold behind a button, spotlight unchanged. **Rarity**: 1–5 gems (all user's choices, 2026-10-09).
- **Pack during extraction**: live from the first icon, resumable; deliberately different from the
  folder load's "write first, switch last".
- **Mappings**: latest `UsefulFiles`, verified by a real decode, older commits and TheNaeem's
  archive as fallbacks, kept with the pack, else ask the player. Hosting our own copy: undecided.
- **Hosting**: Cloudflare Pages by Direct Upload (GitHub Pages would put the art in git).
- **Game file**: one `Pal-Windows.pak` through a file input, not a folder.
- **Motion**: only a pal's idle animation moves on its own, and every stage can pause it.
- **Name**: PalDoc; the species list inside it is the Paldex.
- **Working agreements** (in memory): recommend Opus or Sonnet before each task, and don't launch
  subagents on other models (say when to switch instead); learning chapter at each phase's end;
  don't file upstream issues for him.

## How things work

Dev: `npm run dev` (loads `public/roster.json` + server art; the extraction notice only shows with
no server art, so test it on the public build). Public build: `npm run build` then `npx vite
preview` (no art, import screen, extraction notice). Extractor runtime: `npm run build-extractor`
once after a fresh clone (needs the .NET 10 SDK). Test art pack: `npm run make-art-pack` →
"Already have an art pack folder?". Pipelines and local-only notes as in WEBSITE-PLAN.md and README.
