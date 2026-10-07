# Handoff — 2026-10-07

Branch `paldb-ranks-and-theme`, pushed to origin. Type-check, 110 tests, `npm run build` ("no game
art") and `npm run build:resume` pass; `npm run audit-a11y`: 0 axe violations and no text under
12px on 48 screens. `docs/WEBSITE-PLAN.md` has every phase's detail and decisions; `docs/A11Y.md`
the accessibility checklist. Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it
with the Artifact tool before editing; Chapter 22 is the deploy guide). Every new part gets a quiz
and a "Why, and the evidence" block with sources checked in-session (see memory).

**The site is now called PalDoc.** The portfolio build is live at **https://paldoc.pages.dev**
(new Cloudflare Pages project `paldoc`, Direct Upload). The old https://sasank-paldex.pages.dev
still serves the pre-rename build; the user is deciding whether to shut it down or redirect it.
The public site isn't deployed: it waits for Phase 6, since its visitors have no other way to get
art. Both builds come from the same source; only the takedown line in the footer is resume-only.

## Phases

| Phase | Status |
|---|---|
| 0–4 | done |
| 5 Card pictures in the browser | **built**: 288 in 94 s (RTX 4070). Not yet measured on a laptop without a GPU |
| 6 Full extractor | **next** (plan below) |
| 7 A11y + cross-browser | started: A11Y.md items 2, 3, 4, 5, 8, 9 done; two NVDA passes done 2026-10-05 (A11Y.md). Left: NVDA on the species → My Pals → pal sheet flow, keyboard-only Planner, 200% zoom, High Contrast, colour alone, Safari, phone first tile (10), dark mode decision (6) |
| 8 Ship | portfolio site **live** at paldoc.pages.dev. Public site after Phase 6: own work/element icons, self-hosted fonts, pal URLs |

## Pick up here

1. **Waiting on the user:** shut down `sasank-paldex` (delete the Pages project) or redirect it to
   paldoc? Deleting needs the user's go-ahead; it can't be undone.
2. **Phase 6, step 4 hand test (user)**: on the dev server, `#extract`, choose Pal-Windows.pak through the real dialog (Edge and Firefox). Then step 5, exporting every pal. Steps 1–3 are done: mappings sources, `src/art/mappings.ts`, and the extractor worker (`extractor/`, `src/extract/`, dev bench at `#extract`; run `npm run build-extractor` once after a fresh clone).
3. Small cleanups: `@tanstack/react-virtual` is a dependency nobody imports; `docs/UX-BRIEF.md:39`
   says "virtualised" (it isn't: batches + content-visibility); `docs/data-gaps.md:12,16` are stale
   (all 289 have art; the roster is 1,990 pals).
4. Reddit follow-up draft `reddit/post-2.md` (gitignored): needs the link to the first post.

## Deploying the portfolio site

`npm run build:resume`, then
`npx wrangler@4 pages deploy dist-resume --project-name paldoc --branch preview --commit-dirty=true`
(→ https://preview.paldoc.pages.dev, for checking on the phone), and `--branch main` for the live
site. The user is logged in (`npx wrangler whoami`). Rollback: dashboard → Deployments → ⋯.
Gotchas: wrangler 4.148 `pages project create` delegates to "Pages on Workers", which ignored the
name, picked `dist/` and failed on Vite 5, so projects are created with `--force` (classic Pages);
only `create` needs it. Creating a project is blocked for Claude by the auto-mode classifier (new
public surface): the user runs `create` himself. A new project's HTTPS certificates take a few
minutes; until then the per-deploy URL (`<hash>.paldoc.pages.dev`) fails in Firefox with
`SSL_ERROR_NO_CYPHER_OVERLAP`, which only means "no certificate yet". Unknown paths return
`index.html` with 200 (so `/roster.json` "exists" but is the page). Before each deploy:
`dist-resume/` has no `roster.json`, Steam id, world names or source maps.

## Built on 2026-10-07

- **Rename to PalDoc:** browser tab, nav brand, home tab, home hero (`Pal<span>Doc</span>`, which a
  search for "Paldex" misses), import screen kicker, spotlight hints, backup error messages. Kept:
  the species grid heading "The Paldex" (user) and the backup format id `palworld-index` (old
  backups still load). The theme picker stays as it is: every button in the current theme's shapes (user).
- `vite.config.ts` line-ending change discarded (user agreed).
- Facts for the user's YC / Design Engineer applications sent to his portfolio Claude session.

## Built on 2026-10-06 (condensed)

- Accessibility pass (A11Y.md items 2, 3, 4, 5, 8, 9), portfolio launch, three rounds of phone QA
  (sticky hover was the "ghost tap"; settings scrim + scroll lock; measured `--nav-h`; spotlight
  pager instead of auto-advance; Feybreak font Josefin Sans), Croajiro `jaw` override, CVE pin.
  Details in commit 9bc72c5.

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
- **Name:** PalDoc (2026-10-07). The species list inside it is still the Paldex.

## Next: Phase 6 plan (agreed to propose; step 1 not started)

1. ~~Research mappings sources~~ **done 2026-10-07**: UsefulFiles (raw GitHub, then jsDelivr), older commits as fallback (WEBSITE-PLAN Phase 6).
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
