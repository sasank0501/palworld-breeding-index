# Handoff — 2026-10-07 (end of day)

Branch `paldb-ranks-and-theme`, pushed to origin. Type-check, 137 tests and `npm run build` ("no game
art") pass; `npm run audit-a11y` was 0 axe violations and no text under 12px on 48 screens after the
rename, and the new game-file picker is axe-clean in all four themes. `docs/WEBSITE-PLAN.md` has every
phase's detail, measurements and decisions; `docs/A11Y.md` the accessibility checklist. Learning page:
claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with the Artifact tool before editing; Chapter 23
is the line-endings chapter). **One chapter per phase, written at the phase's end**, with a quiz and a
"Why, and the evidence" block (sources checked in-session): Phase 6's is still to write.

**The site is called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev** (Cloudflare
Pages project `paldoc`, Direct Upload). The old https://sasank-paldex.pages.dev still serves the
pre-rename build. The public site isn't deployed: it waits for Phase 6, since its visitors have no
other way to get art. Both builds come from the same source; only the takedown line in the footer is
resume-only.

## Phases

| Phase | Status |
|---|---|
| 0–5 | done (5: 288 stills in 94 s on an RTX 4070; not yet measured on a laptop without a GPU) |
| 6 Full extractor | **steps 1–5 done**, 6 next (below). In the browser, from the player's own game: mappings found and checked, 333/333 pal exports matching the desktop's, 289/289 icons |
| 7 A11y + cross-browser | started: A11Y.md items 2, 3, 4, 5, 8, 9 done; two NVDA passes 2026-10-05. Left: NVDA on species → My Pals → pal sheet, keyboard-only Planner, 200% zoom, High Contrast, colour alone, Safari, phone first tile (10), dark mode decision (6) |
| 8 Ship | portfolio site **live** at paldoc.pages.dev. Public site after Phase 6: own work/element icons, self-hosted fonts, pal URLs |

## Pick up here

**Waiting on the user**
1. **Cloudflare Web Analytics** (nothing counts visits yet): dashboard → Workers & Pages → paldoc →
   Metrics → Enable. Then redeploy (build:resume + the deploy command below). The status-line mod
   `paldoc-visits` (`~/.claude/dev-mods/<session>/paldoc-visits`, loaded this session) needs an API
   token (Account Analytics: Read) in the env var `PALDOC_CF_ANALYTICS_TOKEN`; untested on the real
   account, so the site lookup and the `refererHost` field name may need a tweak.
2. **Delete or redirect `sasank-paldex`?** I recommended deleting (nobody else has the link);
   `npx wrangler@4 pages project delete sasank-paldex` can't be undone, so ask first.
3. Reddit follow-up `reddit/post-2.md` (gitignored): replace `LINK` with the first post's URL; new
   screenshots are in `reddit/post-2-images/`.

**Next task: Phase 6, step 6**: port `scripts/build-pal-models.mjs` to the browser. `extractAll`'s
`onPal` receives each `PalExport` (glb, material JSON, raw textures, `.psa` per role) and must turn it
into `pal-models/<Name>.chibi.glb` + `index.json` in the art pack (store with the pack format in
`src/art/store-pack.ts`; stills come from Phase 5 afterwards). Needs, from the desktop script: texture
channel remaps (normal G flip, `_M` R/B swap) via canvas, the chibi build (adaptive head scale,
neckless rigs, `jaw`, overrides in `scripts/chibi-overrides.json`), skeleton rescale, `psa` → glTF
animation tracks (`scripts/lib/psa.mjs` is plain JS), meshopt (`meshoptimizer`, `@gltf-transform/*`
already run in browsers; `sharp` is the only native piece, replaced by canvas). Verify against the
desktop's models. Recommended model: Opus (subtle, only visible later; see memory).
Then step 7: end to end in a fresh browser, measured; the learning chapter.

**Small cleanups** (Sonnet-sized): `@tanstack/react-virtual` is imported nowhere;
`docs/UX-BRIEF.md:39` says "virtualised" (it's batches + content-visibility); `docs/data-gaps.md:12,16`
are stale (all 289 have art; the roster is 1,990 pals); the species page's collection card says "8 owned"
twice (heading and beside the filters); some spotlight pals are framed from above (Warsect Terra).

## Built on 2026-10-07

- **Rename to PalDoc** (tab, nav, home tab, hero `Pal<span>Doc</span>`, import screen, spotlight hints,
  backup errors). Kept: the species list heading "The Paldex" and the backup format id `palworld-index`.
- **Phase 6, steps 1–5** (details and numbers in WEBSITE-PLAN):
  1. Mappings (`.usmap`) sources: `PalworldModding/UsefulFiles` is the only current one (+ jsDelivr, older
     commits, and TheNaeem's archive to 0.6.6, which works for the art). README has "Outside dependencies".
     Experiment: for the art, mappings from 0.1.3 to 1.0.5 decode identically; only Pocketpair's own
     tables need the exact file.
  2. `src/art/mappings.ts` (13 tests): kept file → commit list → tested pinned files → ask the player.
  3. `extractor/` (C#, .NET browser-wasm, CUE4Parse) + `src/extract/` (worker, `client.ts`). **.NET hangs
     if a worker assigns `onmessage`** (dotnet/runtime#114918): the worker uses `addEventListener` and
     sets `self.dotnetSidecar = true`. `npm run build-extractor` publishes into `public/extractor/`
     (gitignored, 43 MB, needs the .NET 10 SDK; run it once after a fresh clone).
  4. `src/extract/pickPak.ts` + `src/components/GameFilePicker.tsx`: one `Pal-Windows.pak` through a
     file input; reads only its 512-byte footer to reject wrong files. Hand-tested in Edge, Firefox
     private and Brave.
  5. `extractAll` (`src/extract/run.ts`): every pal in 727 s, 0 failures; meshes and 937 material files
     byte-identical to the desktop, animations equal up to a 1.2e-7 rotation rounding; WebAssembly
     memory flat at 412–495 MB. Icons from the game: 289/289 in 5 s.
- **Dev bench** at `#extract` on the dev server (`src/routes/ExtractorTest.tsx`, dropped from builds).
- **Dev server**: Vite's watcher crashed (EBUSY) on `dotnet build` output, so top-level `scripts/`,
  `extractor/` and `spikes/` are unwatched; the rule is anchored, because `**/extractor/**` also hid
  `public/extractor/` and Vite served new runtime files as HTML.
- Reddit post 2 draft and screenshots; YC / Design Engineer facts for the portfolio Claude session;
  `GitHub/contributions/paldoc-upstream-issues.md` (14 entries + a "nothing to contribute" list; add
  dependency bugs there, never file upstream yourself); memory notes for the model recommendation.

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name paldoc --branch preview --commit-dirty=true`
(→ https://preview.paldoc.pages.dev, for checking on the phone), and `--branch main` for the live site.
The user is logged in (`npx wrangler whoami`). Rollback: dashboard → Deployments → ⋯.
**Note:** if `public/extractor/` exists, both builds copy it (43 MB, 213 files, none over 25 MiB). The
portfolio doesn't use it yet; delete the folder before `build:resume` to keep the deploy small.
Gotchas: wrangler 4.148 `pages project create` hands off to "Pages on Workers", which ignored the name,
picked `dist/` and failed on Vite 5, so projects are created with `--force`. Creating a project is
blocked for Claude by the auto-mode classifier (new public surface): the user runs `create` himself.
A new project's certificate takes a few minutes (`SSL_ERROR_NO_CYPHER_OVERLAP` until then). Unknown
paths return `index.html` with 200. Before each deploy: `dist-resume/` has no `roster.json`, Steam id,
world names or source maps.

## Local tools (gitignored under `scripts/.cache/`, all need `npm run dev` unless noted)

- `extract/`: `bench.mjs` (mappings cases), `export.mjs` (drive "Export pals": `ONLY="A, B"` or all; writes
  a report), `compare.mjs REPORT` (vs the desktop's `scripts/pal-textures/out`), `icons.mjs`,
  `picker.mjs`, `axe-picker.mjs`. The dev server dies when started from a one-off shell: run
  `npx vite --port 5173 --strictPort` as a background task.
- `reddit/shots.mjs`: re-shoots the live site for posts (`APP=` to shoot another copy).
- `a11y/`: `qa-phone.mjs`, `scrolllock3.mjs` (raw CDP touch; `synthesizeScrollGesture` can't scroll
  `.sc-page`), `spotlight.mjs`, `center-audit.mjs`, `live.mjs URL` (no dev server), `feytype.mjs`.
- `diag/`: `sheet.sh OUT Pal…` contact sheets, `animdiff.mjs`, `bones.mjs`, `mats.mjs`.
- `.claude/skills/wrap-it-up/` (`/wrap-it-up`). Node's `fs.openAsBlob` reports 32-bit sizes for files
  over 4 GiB (nodejs/node#52585): test big files in a browser, not in Node.

## Decisions

- **Mappings**: fetch the latest `UsefulFiles` file, verify by decoding a pal's mesh, materials and an
  animation (not a table), fall back through older commits and TheNaeem's archive, keep the working
  file with the pack, else ask the player. Hosting our own copy: undecided ("we'll see later").
- **Hosting**: Cloudflare Pages by Direct Upload; GitHub Pages ruled out (free plan needs a public repo,
  so the art would be in git).
- **Game file**: one `Pal-Windows.pak` through a file input, not a folder (no "upload" prompt, no Program
  Files block, mods never opened).
- **Motion**: nothing moves on its own except a pal's idle animation, which every stage can pause.
- **Name**: PalDoc; the species list inside it is the Paldex.
- **Working agreements** (in memory): recommend Opus or Sonnet before each task, with why; learning
  chapter at the end of each phase; don't file upstream issues for him.

## How things work

Dev: `npm run dev` (5173, loads `public/roster.json` + server art). Public build: `npm run build` then
`npx vite preview` (4173; no art, import screen). Test art: `npm run make-art-pack` → "Choose the art
folder". Pipelines and local-only notes as in WEBSITE-PLAN.md and README.
