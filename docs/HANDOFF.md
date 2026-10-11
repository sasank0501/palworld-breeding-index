# Handoff — 2026-10-11 (end of day)

Branch `paldb-ranks-and-theme`, pushed to origin at the end of this wrap (it includes the Safari
storage fix from 2026-10-09, committed but unverified; Safari is optional for now). Type-check, 180 tests and `npm run build` ("no game art") pass. The
a11y audit was not re-run: nothing the player sees changed today (the only UI edit is the dev
bench); last run 0 axe violations, no text under 12px.
**Phases 0–6 and the main part of 6b are done**: on the public build, a fresh Edge profile goes
from the landing page to the 3D Paldex using only `Pal-Windows.pak` and a save, with a stop, reload
and resume on the way, and the extraction itself now takes **2 min 23 s to 3 min 43 s** on this
machine (it was 10 min 17 s to 10 min 54 s). `docs/WEBSITE-PLAN.md` has every phase's detail and
measurements; `docs/A11Y.md` the checklist.
Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before
editing); Chapter 24 is Phase 6, with quiz and evidence. One chapter per phase, at the phase's end,
so **Phase 6b's chapter is owed**.

**The site is called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev** (Cloudflare
Pages project `paldoc`, Direct Upload). The public site isn't deployed: Phase 6 no longer blocks it;
Phase 7 and the Phase 8 must-haves do (below).

## Phases

| Phase | Status |
|---|---|
| 0–6 | done (6: 333 models, 207 MB, matching the desktop's; stop/resume works) |
| 6b Faster extraction | **main part done 2026-10-11.** 512 px decode, timers, several extractors sharing the pals: full run 143–223 s (2 min 23 s to 3 min 43 s) with 3 extractors, was 617–654 s (10 min 17 s to 10 min 54 s); the player's flow resumed 308 pals in 183 s (3 min 3 s). Left, optional: the player's own pals first (Sonnet), AOT (Opus, experiment) |
| 7 A11y + cross-browser | **automated part done 2026-10-09** (A11Y.md items 1–14). Left, by hand: NVDA through the extraction notice and species → My Pals → pal sheet (script in A11Y.md), Windows' real contrast themes, Firefox extraction (it now gets 2 extractors), a laptop without a GPU. **Safari is optional for now** (2026-10-11) |
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
4. Decide: a cap of 3 extractors (a fourth saves 28 s for another 0.5 GB), or 4 on strong machines.

**Next, in order** (the model for each, as the working agreement asks)
1. **Time the card stills in a normal (headed) window** (Sonnet, about 10 min). They are now the
   longer wait: 396 s (6 min 36 s) in the headless e2e against 183 s for extraction, and 94 s
   (1 min 34 s) in Phase 5. If the headed time holds, a whole first run is about 4–5 minutes; if
   not, the stills get their own speed-up pass.
2. **Learning-page chapter for Phase 6b** (Sonnet): Amdahl's law (the worker was 81% of the run),
   cores against memory, Web Workers sharing a queue, and why a 42-pal sample over-promised (the
   run-to-run noise was about 10%). Sources checked and linked, honest limits, a quiz.
3. **Phase 8 must-haves:** **self-host the fonts** (Google Fonts sees every visitor's IP; Sonnet),
   then **our own work and element icons** (design work, the biggest piece; Opus), then deploy the
   public site. Rough estimate to ship: 3–5 sessions.
4. Optional: the player's own pals first (Sonnet; changes the feel, not the total); AOT of the mesh
   export (Opus; the mesh is now about 58% of worker time, but the run is already a few minutes).

**Not tried by hand (6b):** several extractors in Firefox (it gets 2), a machine with 8 GB or less,
and a truly cold start (the session's first 3-extractor run took 223 s against 143 s warm).

**Optional, any time: finish the Safari storage fix.** Running the extraction in Playwright's
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
log: an earlier run sat silent for hours; with several extractors it will now be faster, but WebKit
gets 2 at most). Also worth a line in the learning page's Phase 6 chapter once confirmed. Note
`getDirectory()` failed with `UnknownError` in fresh non-persistent WebKit contexts, and worked in
persistent ones: the app falls back to IndexedDB when it throws. Not Safari itself: a pass is
"probably fine on a Mac", not proof.

**Small cleanups** (Sonnet-sized): `@tanstack/react-virtual` is imported nowhere;
`docs/UX-BRIEF.md:39` says "virtualised"; `docs/data-gaps.md:12,16` are stale; the species page's
collection card says "8 owned" twice; some spotlight pals are framed from above (Warsect Terra);
`ExtractorTest` (dev bench) still has the step-5 "Export pals" path beside "Extract to pack".

## Built on 2026-10-11 (Phase 6b; details, tables and method in WEBSITE-PLAN "Phase 6b")

- **Study first.** Time was measured before anything was changed. The worker (CUE4Parse on
  interpreted WebAssembly, one core) was 81% of a run, the page's model build 11%, message transfer
  7%, writing under 1%. Texture decode time is linear in pixels (132 ms per megapixel, r² 0.96).
  GPU and .NET's threaded runtime were rejected (CPU decode work; experimental, and it needs
  cross-origin isolation).
- **512 px decode** (`TEXTURE_EDGE` in `src/extract/types.ts`, used by the client, the runner and
  the builder). 59 textures compared against the old path: same wiring and geometry, median 41.8 dB,
  worst 34.5 dB (eye textures differ only in hidden colour under transparent texels).
- **Timers** (`PipelineTiming` in `pipeline.ts`: icons, worker with its mesh/textures/animations,
  build, write), printed by the bench as "Pack timing".
- **Several extractors, one list** (`src/extract/pool.ts`: `extractorCount`, `startHelpers`; a
  rewritten `run.ts`; `pipeline.ts` and `extractRunner.ts` pass `helpers` through). The first
  extractor starts at once and helpers join about 7 s later; a helper that fails or takes over 90 s
  is left out. Count: half the logical processors, capped by `navigator.deviceMemory` (8 GB or
  more: 3; 4 GB: 2; less: 1), and 2 where the browser won't say (Firefox, Safari). An extractor that
  fails two exports in a row while another is working retires and its pals go back on the list, once
  each; the page's own failures don't count. A stop waits for every extractor. Manifest saves take
  turns. 22 new tests (`run.test.ts`, `pool.test.ts`, `pipeline.test.ts`).
- **Measured**, 333 pals, same session: 1 extractor 485 s (8 min 5 s); 2: 208 s and 218 s (3 min
  28 s, 3 min 38 s); 3: 143 s (2 min 23 s); 4: 115 s (1 min 55 s). Browser peak memory 1.5, 2.1, 2.5
  and 3.0 GB. Packs from 1 and 3 extractors are byte for byte the same. Full runs of identical code
  vary about 10%: compare only within a session, and more than once. **A 42-pal sample over-promised**
  (it projected 410 s for 512 px alone; full runs gave 505–576 s).

## Built on 2026-10-09 (details in WEBSITE-PLAN, Phase 6 steps 6–8, and A11Y.md)

- **The models in the browser** (`src/extract/model/`): a port of `build-pal-models.mjs --lite`
  (`psa.ts`, `chibi.ts`, `animate.ts`, `materials.ts`, `build.ts`, `encodeImage.ts`). **Lite only,
  by the user's decision**: chibi, 512 px, meshopt, `normal: false`. `build.local.test.ts` compares
  with `public/pal-models-lite` (skipped without the desktop's staging folder): 288/288 match.
- **Game to pack** (`pipeline.ts`, `extractToPack`): icons, then models, pack live (`complete:
  false`) after the icons, manifest saved every 10 pals, a stopped run resumes the same pack, old
  pack deleted only when the new one is whole.
- **The player's screen:** the "Add the game art" notice (`src/routes/showcase/Art.tsx`) leads with
  `GameFilePicker`; `src/extract/extractRunner.ts` holds the run's state: .NET start (90 s timeout),
  mappings (or ask for a `.usmap`), progress with player names and time left, Stop, "Finish adding"
  after a stop, `beforeunload` only during a run. Card stills wait for a complete pack.
- **Phase 7, automated:** dark mode follows the system until a theme is picked; Paldex filters fold
  behind a button under 640 px; sticky nav scrolls on short windows (400% reflow); forced-colors
  focus and pressed states; rarity as 1–5 gems. WebKit findings and fixes above.

## Local tools (gitignored under `scripts/.cache/`)

- `extract/`: `e2e.mjs` (the Phase 6 "done when", public build: landing → demo save → pak → stop →
  reload → resume → stills; `APP=http://localhost:4180/` after `npm run build` and
  `npx vite preview --port 4180 --strictPort`), **`workers.mjs`** (new: `WORKERS=n [ONLY=…] [OUT=file]
  APP=http://localhost:5174/ node …`, a full pack run with n extractors on the dev server: time, the
  browser's peak memory, and with `OUT` a dump of the stored pack for comparing runs),
  **`models-compare.mjs`** (new: builds models and saves the glb files; `EDGE_OVERRIDE=1024`
  patches the old default in), **`cmp-tex.mjs`** and `cmp-eye.mjs` (new: compare two folders of
  models texture by texture, as drawn), `axe-notice.mjs`, `offline-check.mjs`, `pack.mjs`,
  `pack-app.mjs`, `models.mjs`, `export.mjs`, `compare.mjs`, `icons.mjs`, `picker.mjs`, `bench.mjs`,
  `peek-profile.mjs`, `report-all.json` (per-pal timings of the 2026-10-07 export).
- `a11y/`: `p7-checks.mjs`, `p7-reflow-hc.mjs`, `p7-planner-kbd.mjs`, `p7-pips.mjs`, `webkit.mjs`,
  `webkit-short.mjs`, `webkit-storage-probe.mjs`, `webkit-opfs-write.mjs`; `extract/`:
  `e2e-webkit.mjs`, `notice-kbd.mjs`. WebKit install: `npx playwright-core install webkit`.
- **Ports**: another project's Vite starter may be on 5173; PalDoc runs on **5174**
  (`npx vite --port 5174 --strictPort` as a background task). Most scripts take `APP=`. The dev
  bench (`#extract`) has an "Extractors" box for the worker count. Kill the dev server when done:
  it reloads on every edit and would disturb a timing run.
- `learn-check.mjs PAGE` (quiz option lengths, axe on Chapter 24, phone overflow) and
  `learn-overflow.mjs` for the learning page. `reddit/shots.mjs`, `a11y/…`, `diag/…` as before.
  `.claude/skills/wrap-it-up/`. Node's `fs.openAsBlob` reports 32-bit sizes for files over 4 GiB:
  test big files in a browser.
- No Prettier config in the repo: don't run `npx prettier --write` (it rewraps at 80 columns).
  Edits that end in a space can drop it: check the diff for `=(`-style joins.

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
- **Extractors**: up to 3 at once, from cores and memory (2 where memory is unknown); a fourth
  would save 28 s for 0.5 GB (open: user may want 4 on strong machines).
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
  don't file upstream issues for him; timings in seconds also get "N min M s".

## How things work

Dev: `npm run dev` (loads `public/roster.json` + server art; the extraction notice only shows with
no server art, so test it on the public build). Public build: `npm run build` then `npx vite
preview` (no art, import screen, extraction notice). Extractor runtime: `npm run build-extractor`
once after a fresh clone (needs the .NET 10 SDK; no `wasm-tools` workload, nothing is AOT-compiled).
Test art pack: `npm run make-art-pack` → "Already have an art pack folder?". Pipelines and
local-only notes as in WEBSITE-PLAN.md and README.
