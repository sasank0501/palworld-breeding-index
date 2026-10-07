# Handoff — 2026-10-06

Branch `paldb-ranks-and-theme`, pushed to origin. Type-check, 110 tests, `npm run build` ("no game
art") and `npm run build:resume` pass; `npm run audit-a11y`: 0 axe violations and no text under
12px on 48 screens. `docs/WEBSITE-PLAN.md` has every phase's detail and decisions; `docs/A11Y.md`
the accessibility checklist. Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it
with the Artifact tool before editing; Chapter 22 is the deploy guide). Every new part gets a quiz
and a "Why, and the evidence" block with sources checked in-session (see memory).

**The portfolio site is live:** https://sasank-paldex.pages.dev (Cloudflare Pages, Direct Upload).
The public site isn't deployed: it waits for Phase 6, since its visitors have no other way to get
art. Both builds come from the same source, so every UI fix below is in both; only the takedown
line in the footer is resume-only.

## Phases

| Phase | Status |
|---|---|
| 0–4 | done |
| 5 Card pictures in the browser | **built**: 288 in 94 s (RTX 4070). Not yet measured on a laptop without a GPU |
| 6 Full extractor | **next** (plan below) |
| 7 A11y + cross-browser | started: A11Y.md items 2, 3, 4, 5, 8, 9 done. Left: the user's manual passes (NVDA, keyboard-only Planner, 200% zoom, High Contrast, colour alone), Safari, phone first tile (10), dark mode decision (6) |
| 8 Ship | portfolio site **live**. Public site after Phase 6: own work/element icons, self-hosted fonts, pal URLs |

## Pick up here

1. **Waiting on the user:** keep the theme picker in each theme's own shapes (recommended), or draw
   each theme button in its own theme's shape?
2. **Phase 6, step 1** (plan below).
3. Small cleanups found by today's repo audit: `@tanstack/react-virtual` is a dependency nobody
   imports; `docs/UX-BRIEF.md:39` says "virtualised" (it isn't: batches + content-visibility);
   `docs/data-gaps.md:12,16` are stale (all 289 have art; the roster is 1,990 pals).
4. `vite.config.ts` shows as modified: line endings only (CRLF, no final newline, saved 10-06 12:18
   by an editor). Left out of the commits; `git checkout -- vite.config.ts` once the user agrees.

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name sasank-paldex --branch preview --commit-dirty=true`
(→ https://preview.sasank-paldex.pages.dev, for checking on the phone), and `--branch main` for the
live site. The user is logged in (`npx wrangler whoami`). Rollback: dashboard → Deployments → ⋯.
Gotchas: wrangler 4.148 `pages project create` delegates to "Pages on Workers", which ignored the
name, picked `dist/` (the public build) and failed on Vite 5, so the project was created with
`--force` (classic Pages); only `create` needs it. A new project's HTTPS certificates take a minute
or two. Before each deploy: `dist-resume/` has no `roster.json`, Steam id, world names or source maps.

## Built on 2026-10-06

- **Accessibility:** spotlight dots 24px targets + one Tab stop (roving tabindex); work bars
  `role="img"`; 12px text floor (`audit-a11y` now lists any visible text under it); the 3D model's
  focus ring (its focus is inside model-viewer's shadow root: `PalModel.tsx` sets `data-kbd-focus`);
  reduced motion holds the model still, and every stage has a pause button.
- **Portfolio prep:** lite models rebuilt (they were from 10-03); takedown line (resume build only,
  GitHub issues); inline SVG egg favicon; `Microsoft.Bcl.Memory` pinned to 9.0.20 in both C#
  projects (CVE-2026-26127, via CUE4Parse → Fmod5Sharp → IndexRange).
- **Phone QA, three rounds with the user:**
  - Footer: last thing in `.sc-page`, plus a once-per-session notice card
    (`src/components/SiteNotice.tsx`) that flies into it.
  - Settings: animates; a scrim in `.sc-shell` (z 45, nav z 50) takes outside taps; the page is
    scroll-locked while it's open (`data-panel-open` → `.sc-page` overflow hidden). The scrim alone
    let swipes on the nav or panel scroll the page.
  - "Ghost tap" was **sticky hover**: every `:hover` rule is now inside `@media (hover: hover)`;
    Android's tap highlight is off, with an `:active` dim instead.
  - `--nav-h` is measured (ResizeObserver): the sub bar sat under the nav at every width.
  - Favourites chip uses `--star`; SVG chevrons; equal-height theme buttons; passive dots spaced.
  - Species page: all owned pals, with sort, IV floor and passive filters.
  - No auto-rotate; the stage ring is gone; the ring's number is sized from the ring
    (`.sc-ring` container, `min(34px, var(--ring-num, 21cqi))`). Re-measure if a display font changes.
  - Feybreak's display font: Unbounded → Josefin Sans (the user's pick of four rendered options).
  - Spotlight: no auto-advance; a `‹ n of N ›` pager by the counter, not on the 3D frame (dragging
    turns the model); buttons say "Next: <pal>"; focus is restored after the column re-renders.
  - "How to breed" taps: unchanged (user).
- **Chibi:** Croajiro's tongue: new override key `jaw` (grin degrees, 0 = mouth shut) and head 1.3.
  Review done; left as is unless raised: Woolipop Terra, ElecPanda, horns on Univolt/Loupmoon/Reindrix.

## Checks (local, `scripts/.cache/a11y/`, gitignored)

`qa-phone.mjs` (the phone QA items), `scrolllock3.mjs` (raw CDP touch events; `Input.synthesizeScrollGesture`
doesn't scroll `.sc-page` at all, so a test built on it can't fail), `spotlight.mjs`, `center-audit.mjs`
(318 controls, all within 1.5px of centre), `live.mjs URL` (smoke test of a deployed site),
`feytype.mjs` (renders font options in the real app). All need `npm run dev` except `live.mjs`.
Video frames: `imageio-ffmpeg` (pip, user site) has an ffmpeg that decodes iPhone HEVC; Edge can't.

## Tools (local only)

- `scripts/.cache/diag/`: `sheet.sh OUT Pal…` contact sheets (normal vs chibi, poses; `SHOTS` env),
  `animdiff.mjs`, `bones.mjs`, `mats.mjs`. Needs `npm run dev`; one Edge per pal.
- `.claude/skills/wrap-it-up/`: the end-of-day routine as a project skill (`/wrap-it-up`).

## Decisions

- **Type mappings (`.usmap`) = community sources with safety nets**: fetch at runtime, backup
  source, verify by decoding a known table, cache with the pack, else ask the player for a file.
- **Hosting:** Cloudflare Pages by Direct Upload. GitHub Pages ruled out: on GitHub Free it needs a
  public repo, so the art would be in git.
- **Motion:** nothing moves on its own except a pal's idle animation, which every stage can pause.

## Next: Phase 6 plan (agreed to propose; step 1 not started)

1. Research mappings sources for Palworld 1.0 (current, update lag, version match); pick main + backup.
2. Mappings module: fetch, fallback, verify, cache, ask-for-file.
3. Move the CUE4Parse WebAssembly spike (`spikes/cue4parse-wasm`) into an app worker, loaded on demand.
4. Game folder picking from Program Files (classic input + copyable path hint); user tests by hand.
5. Export all 288 pals in the browser, streaming per pal, progress/stop/resume.
6. Port `build-pal-models.mjs` to the browser (overrides incl. `jaw`, skeleton rescale, animations,
   meshopt) → `pal-models/`; Phase 5 then makes the stills.
7. End to end in a fresh browser, measured; learning page chapter with quiz + evidence.

## How things work (unchanged)

Dev: `npm run dev` (5173, loads `public/roster.json` + server art). Public build: `npm run build` then
`npx vite preview` (4173; no art, import screen). Test art: `npm run make-art-pack` → "Choose the art
folder". Pipelines and local-only notes as in WEBSITE-PLAN.md and README.
