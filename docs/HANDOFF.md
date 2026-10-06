# Handoff — 2026-10-05 (night)

Branch `paldb-ranks-and-theme`, pushed to origin. Type-check, 110 tests, `npm run build` pass ("no
game art"). `docs/WEBSITE-PLAN.md` has every phase's detail and decisions; `docs/A11Y.md` the
accessibility checklist. Learning page: claude.ai artifact `9hUfnrC8NXRkssEC4Tjcz6` (read it with
the Artifact tool before editing). Every new part gets a quiz and a "Why, and the evidence" block
with sources checked in-session (see memory).

## Phases

| Phase | Status |
|---|---|
| 0–3 | done |
| 4 Art loader | **done**: Edge, Firefox, Firefox private. `src/art/` (pack, storage OPFS/IndexedDB, worker, resolver, loader) |
| 5 Card pictures in the browser | **built**: `src/art/stills.ts`, `stillsRunner.ts`. 288 in 94 s (RTX 4070), 0 failures. Not yet measured on a laptop without a GPU |
| 6 Full extractor | **next** after the chibi re-check (plan below) |
| 7 A11y + cross-browser | open items in A11Y.md (spotlight dots 24 px, two aria-prohibited-attr, 12 px text floor, model alt/pause, phone first tile, dark mode decision), Safari |
| 8 Ship | own work/element icons, favicon (404 today), self-hosted fonts, pal URLs, deploy |

**Scope cut rejected:** cards show stills taken from the 3D models; detail pages show live 3D.

## Pick up here: chibi review round 2

Round 1 (71 flagged pals) is applied; all 342 models and 288 stills rebuilt. The user re-checks at
`localhost:5173/#chibi`. On first load the page reads `scripts/.cache/chibi-review-replies.json`
(round `2026-10-05`, 63 pals, served by the dev route `/__chibi-review-replies` in vite.config.ts):
clears those pals' marks (archive kept in localStorage), moves old notes to "You said", shows a
re-check / question badge and the reply, and adds a "changed" filter. When the user says done, read
`scripts/.cache/chibi-review.json` (entries carry `afterReply`) and do the next round the same way:
edit `scripts/chibi-overrides.json`, rebuild those pals, `npm run render-portraits`, write a new
replies file with a new `round`.

Waiting on the user's answers:
- Croajiro (KendoFrog/_Dark), Woolipop Terra, Grizzbolt: flagged with no detail; look fine in every
  pose rendered. Ask what's off.
- Horns on Univolt, Loupmoon, Reindrix: skinned to `head` inside the one body mesh, no bone or
  material to scale. Only a smaller head shrinks them. Asked if they want that.

Known limits (told the user): Needoll's bent lower body is the game's own pose; Mammorest keeps a
1.0 head because any growth tears its leaf coat open.

## Built on 2026-10-05 (all committed)

- **Builder (`build-pal-models.mjs`)**: animation loops keyed for another skeleton size are rescaled
  (median keyed bone length / mesh bone length, frame 0, outside 1.25× tolerance). Caught Hoocrates
  and Elphidran (metres, 0.01×, rig folded into a knot), Sweepa (2.7×, spikes), Azurmane, Snock, one
  NPC. Materials marked `TwoSided` draw both sides.
- **New override keys** in chibi-overrides.json (documented above `OVERRIDES` in the builder):
  `leg`/`arm`/`tail`, `bones` (multiply one bone's scale; works on headless rigs like Hangyu),
  `keepHeight`, `plain`, `doubleSided`, `size` (Anubis at 2048 px). `pose` is read by render-portraits.
- Earlier today: contrast 2,702 → 0, landmarks/skip link/focus handling, NVDA fixes; hatch style D;
  spotlight Hide + Undo, user data format 2; My Pals loads as you scroll; star style; import screen
  drifting rows; phone fixes; `make-art-pack` without stills by default.

## Tools (local only)

- `scripts/.cache/diag/` (gitignored): `sheet.sh OUT Pal…` renders contact sheets (normal vs chibi,
  bind/Idle/side/Rest/Walk; `SHOTS` env picks tiles) through the portrait harness; needs `npm run
  dev`. Headless Edge's GPU dies after a few dozen renders, so `sheet.sh` starts one browser per
  pal. `animdiff.mjs Pal` compares a .psa with the mesh skeleton; `bones.mjs` / `mats.mjs` list a
  rig's bones and materials. Close leftover headless Edges by `diag-edge-` in the command line.

## Decisions

- **Type mappings (`.usmap`) = community sources with safety nets**: fetch at runtime (GitHub raw
  sends `Access-Control-Allow-Origin: *`), backup source, verify by decoding a known table, cache with
  the pack, else ask the player for a file. Never host it ourselves for now. Local copies:
  `scripts/pal-textures/mappings/` (elliotks repo archived Feb 2025; PalworldModding/UsefulFiles).
- "Wrap it up" = commit, rewrite this file, scan for game art/personal data, push.

## Next: Phase 6 plan (agreed to propose; step 1 not started)

1. Research mappings sources for Palworld 1.0 (current, update lag, version match); pick main + backup.
2. Mappings module: fetch, fallback, verify, cache, ask-for-file.
3. Move the CUE4Parse WebAssembly spike (`spikes/cue4parse-wasm`) into an app worker, loaded on demand.
4. Game folder picking from Program Files (classic input + copyable path hint); user tests by hand.
5. Export all 288 pals in the browser, streaming per pal, progress/stop/resume.
6. Port `build-pal-models.mjs` to the browser (overrides incl. the new keys, skeleton rescale,
   animations, meshopt) → `pal-models/`; Phase 5 then makes the stills.
7. End to end in a fresh browser, measured; learning page chapter with quiz + evidence.

Also pending: user's NVDA pass (note editor, Saved plans, restore dialog).

## How things work (unchanged)

Dev: `npm run dev` (5173, loads `public/roster.json` + server art). Public build: `npm run build` then
`npx vite preview` (4173; no art, import screen). Test art: `npm run make-art-pack` → "Choose the art
folder". Pipelines and local-only notes as in WEBSITE-PLAN.md and README.
