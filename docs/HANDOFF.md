# Handoff — 2026-10-13 (end of day)

Branch `paldb-ranks-and-theme`, pushed to origin at the end of this wrap. Type-check, 259 tests and
`npm run build` ("no game art except 8 silhouette screenshots for the homepage tour and 289 species
silhouettes for browsing") pass. `npm run audit-a11y` on the dev server: 0 axe violations on 48
scans, no text under 12px. Not run: `npm run build:resume`.
**The app is ready to launch; it has not been deployed.** Phases 0–6 and the main part of 6b are
done, Phase 7's hand tests were done by the owner today (Safari aside, which is optional), and
Phase 8 is down to the deploy. `docs/WEBSITE-PLAN.md` has every phase's detail and measurements;
`docs/A11Y.md` the checklist.
Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before
editing); Chapter 24 is Phase 6. One chapter per phase, at the phase's end, so **Phase 6b's chapter
is owed**, and Phases 7 and 8 will each owe one.

**The site is called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev** (Cloudflare
Pages project `paldoc`, Direct Upload), last deployed 2026-10-07: it shows none of the work since.

## Phases

| Phase | Status |
|---|---|
| 0–6 | done |
| 6b Faster extraction | main part done 2026-10-11. The player can now also choose how many extractors run. Left, optional: the player's own pals first (Sonnet), AOT (Opus, experiment) |
| 7 A11y + cross-browser | automated part done 2026-10-09; **hand tests done by the owner 2026-10-13**: NVDA in Firefox, Windows High Contrast, the extraction in Firefox. Safari: optional, unverified. Not measured: a laptop without a GPU, 8 GB of memory or less |
| 8 Ship | done: landing page, browse mode, fonts, **our own icons**, the report link. **Left: deploy the public site**, redeploy the portfolio build; pal URLs nice to have |

## Pick up here

**Waiting on the user**
1. **Where the public site goes, and the go-ahead to deploy.** `paldoc.pages.dev` holds the
   portfolio build. Either the public site takes that address and the portfolio moves, or the public
   site gets a new Pages project (creating a project is the user's job). Deploying needs a yes: the
   wrap-up's permission covers commit and push only.
2. **Work icons:** style 1 (the game's colour per job) was used because no pick was given; style 2
   (one ink) is on the Figma board if preferred.
3. **Planner, before a result:** the save buttons sit above the "Pick a species" card and push it
   58 px below the left column's top. Hide them until there is a plan?
4. **Browse page's pair calculator** still has the two drop-downs; give it the Breeding page's cards?
5. Sky Strider's name rests on paldb plus the id (confirm in game); a real Game Pass save for the
   Xbox reader; Cloudflare Web Analytics; `reddit/post-2.md` still has `LINK` in it.
6. "High Contrast looks better than our own dark theme" (2026-10-13): what about it, for Mount Obsidian?

**Next, in order** (the model for each, as the working agreement asks)
1. **Deploy** (Sonnet): `npm run build`, check `dist/`, deploy the public site where the user says;
   then `npm run build:resume`, check `dist-resume/` (no `roster.json`, Steam id, world names or
   source maps; delete `public/extractor/` first), redeploy the portfolio build.
2. **A version on the art pack** (Opus: touches stop/resume and the pack format). A player who
   extracted before a model fix keeps the old model and nothing tells them (seen with Cawgnito).
   Store the builder's version in `pack.json`; when it is behind, say "some pals have better
   models: make the art again".
3. **"Save a copy of the art"** (Opus): the user's idea. After the first run, let the player write
   the pack to a folder, and load it back later without a second extraction. That gives the folder
   route (now dev-only) a reason to exist for players.
4. **Learning-page chapters** (Sonnet): 6b (Amdahl's law, cores against memory, a shared queue, why
   a 42-pal sample over-promised), then 7 and 8.
5. Time the card stills in a normal window (396 s / 6 min 36 s headless against 94 s / 1 min 34 s
   in Phase 5). Optional: the player's own pals first; AOT; the Safari storage fix.

**Known loose ends**
- `audit-a11y` never reaches a finished plan; two contrast gaps hid there until today. Add that scene.
- `npm run build-portraits` still fetches the game's icon files, which nothing shows any more
  (`scripts/fetch-work-icons.mjs`, `public/work-icons`, `public/element-icons`, their entries in
  `vite.config.ts` and `.gitignore`).
- Local scripts under `scripts/.cache` that click "Try the demo save" fail (`extract/e2e.mjs` among
  them), and any that load an art folder on the built site now need the dev server.
- The lineage frame: pinch on a real touch screen and Full screen were not tried by hand.
- `scripts/build-passives.mjs` is stale (it carries a warning). Eternal Flame's tier is disputed.
- From before: `@tanstack/react-virtual` is imported nowhere; `docs/UX-BRIEF.md:39` says
  "virtualised"; the collection card says "8 owned" twice; some spotlight pals are framed from above.

## Built on 2026-10-13 (details in WEBSITE-PLAN, Phase 8 "Also built 2026-10-13")

- **Icons:** `src/design/iconData.ts` (path data) and `icons.tsx`; `ElementIcon` and `WorkIcon` use them.
- **Lineage tree:** `tree.tsx` (aligned steps, step numbers, `Sandbox`, `Ladder`), `src/lib/viewport.ts`.
- **Pair calculators:** `PairCalc.tsx` (browse page), `BreedingPair.tsx` (Breeding page), `src/lib/pair.ts`.
- **Extraction notice** (`Art.tsx`): elapsed time, processor warning, fixed Stop, "Speed and memory"
  (`extractorChoices`, `extractorsToUse`, `EXTRACTOR_FACTS` in `pool.ts`), folder route dev-only.
- **Landing theme switcher** (`Landing.tsx`), the **Paldex** tab, planner buttons on the header line.
- **Cawgnito** (`scripts/chibi-overrides.json`: `DarkCrow.bones.neck_03`), its silhouette rebuilt.
- **Screen reader fixes** from the owner's NVDA pass: the passive list and the page scroller are out
  of Firefox's Tab order, the list named; Breeding cards read as one sentence.
- **Launch prep:** the report link in both footers; `source` stripped from the served passives
  (`stripDataSources` in `vite.config.ts`); the 8 tour screenshots re-taken.
- Sonnet did the tab rename, the theme switcher, the elapsed time and the processor warning; Opus the rest.

## Local tools (gitignored under `scripts/.cache/`)

- `icons/`: `glyphs.mjs` (the icons' source drawing), `render.mjs` and `boards.mjs` (proof sheets and
  the Figma boards), **`emit.mjs`** (writes `src/design/iconData.ts` from `glyphs.mjs`: edit the
  drawing there, then run it), `figma.mjs` (calls the local Figma connector with a list of calls in
  a JSON file, so images go as files), `snap-model.mjs` (three views of one chibi model:
  `ANIM=Idle AT=0.5 node … DarkCrow tag`), `bones.mjs` and `weights.mjs` (a model's skeleton, and
  which bones hold its top), `tree-boards.mjs`, `breeding-board2.mjs`.
- `home-mock/`: `verify-landing.mjs`, `verify-fonts.mjs`, `pair.mjs` (browse calculator),
  **`bpair.mjs`** (Breeding calculator), **`tree.mjs`** (lineage frame, ladder, icons),
  **`planbar.mjs`**, **`choice.mjs`** (Speed and memory), `sonnet-tasks.mjs` (theme switcher, tab,
  warning, elapsed; runs a short real extraction), `nvda-fix.mjs`, `contrast.mjs`.
- `extract/`, `a11y/`, `sources/`: as before (WEBSITE-PLAN Phases 6 and 6b; `compare-sources`).
- Figma file **"paldoc icons"** (the user's): pages "Icon mock-ups", "Lineage tree mock-ups",
  "Breeding pair calculator mock-up". The boards are pictures; the connector can't draw vectors.
- **Ports**: dev server **5174** (`npx vite --port 5174 --strictPort`), preview 4180;
  `APP=http://localhost:5174/ npm run audit-a11y`. Kill them when done.
- **axe right after a page appears reports false contrast failures** (cards are still fading in):
  wait about 3 s first. A count in the hundreds on `.sc-dex-count` is that, not a regression.
- A heredoc holding JavaScript with backticks and quotes can fail in this shell: write the script
  with the Write tool. No Prettier config: don't run `npx prettier --write`.

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name paldoc --branch preview --commit-dirty=true`
(→ https://preview.paldoc.pages.dev), and `--branch main` for the live site. If `public/extractor/`
exists, both builds copy it (43 MB); the portfolio doesn't use it, so delete it before
`build:resume`. Before each deploy: `dist-resume/` has no `roster.json`, Steam id, world names or
source maps.

## Decisions

- **2026-10-13 (owner):** element icons are the mark alone (style C); the lineage tree is steps as
  columns in a zoom frame, a ladder on phones; the Breeding pair calculator is a row of list cards;
  Panthalus stays epic; "Upload save" keeps its wording; Pocketpair's permission is not sought first
  (content comes down on notice); **the site names no data-source websites**, credits live in the README.
- **Game art in the repo**: none, except the 8 tour screenshots and 289 species outlines (2026-10-12).
- **Extractors**: 4 / 3 / 2 / 1 by cores and memory, 2 where the browser won't report memory; the
  player may override, within half the processor's threads.
- **Art folder route**: developers only, until there is a way for a player to have such a folder.
- **Data changes**: only when two independent sources agree against ours.
- **Dark mode**: follow the system until a pick. **Rarity**: 1–5 gems. **Motion**: only a pal's idle
  animation moves on its own, and every stage can pause it.
- **Mappings**: latest `UsefulFiles`, verified by a real decode, fallbacks, else ask the player.
- **Hosting**: Cloudflare Pages by Direct Upload. **Game file**: one `Pal-Windows.pak`.
- **Name**: PalDoc; the species list inside it, and its tab, are the Paldex.
- **Working agreements** (in memory): recommend Opus or Sonnet before each task; learning chapter at
  each phase's end; don't file upstream issues for him; timings in seconds also get "N min M s".

## How things work

Dev: `npm run dev` (loads `public/roster.json` + server art, so the landing page, browse mode and the
extraction notice don't show: test those on the public build; a pack stored in the browser wins over
the server's art, so a model rebuilt on disk needs "Make the art again" to show there). Public build:
`npm run build` then `npx vite preview`. Extractor runtime: `npm run build-extractor` once after a
fresh clone (needs the .NET 10 SDK). Pipelines as in WEBSITE-PLAN.md and README.
