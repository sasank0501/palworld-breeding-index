# Handoff — 2026-10-04

Branch `paldb-ranks-and-theme`. Type-check, the 74 tests, `npm run build` and `npm run build:resume` pass.

## Where things stand

- **Next: the public website.** `docs/WEBSITE-PLAN.md` has the phases; Phase 0 is done. Phase 1 is
  the in-browser extraction spike. Accessibility baseline and checklist: `docs/A11Y.md`
  (`npm run audit-a11y` with the dev server running).
- **Progress (2026-10-04):** Phase 1 spike verdict **go** (`spikes/cue4parse-wasm`); **Phase 2 done**:
  the app opens on an import screen (`src/routes/Import.tsx`) and reads the save in the browser.
  Next: Phase 3, the user-data layer.

- **The app is the Showcase** (`src/routes/Showcase.tsx`, views in `src/routes/showcase/`). It replaced the old Pal Box, Breeding gaps and Passive planner tabs, and the paper-style "Field register" experiment.
  - **Paldex** (home): completion ring, a rotating 3D spotlight of your top-potential pals, and all 289 species as tiles (owned in colour, breedable-now glowing, the rest silhouettes). Element and state filters.
  - **Species page** (`Dossier.tsx`): partner skill, work, your copies, the shortest route as a family tree (`tree.tsx`), every parent pair ranked by what you can do now.
  - **My Pals** (`Box.tsx`) and the pal sheet (`PalSheet.tsx`) with previous/next.
  - **Breeding** (`Breeding.tsx`): the gaps as lanes by distance, each card previewing its recipe.
  - **Planner** (`Planner.tsx`): species + up to four passives -> lineage tree, a "gather these pals" list with where each is stored, order of operations, alternatives per passive.
  - Navigation is a stack: a species or pal opens in place of the section, Back/Esc returns to the same list with scroll and filters kept; arrows step through.
- **Animations:** every model carries Rest, Idle, Walk, Sleep and Petting (whichever the pal has; `scripts/anim-roles.json` is the list, read by both the extractor and the model builder). The species and pal pages have a picker under the 3D model; the manifest's `clips` drives it. Known issue: some chibis' Sleep pose dips below the floor (Lamball lies on its back and its 2x head clips the stage bottom).
- **Four skins** (`skins.ts`, tokens in `src/design/showcase.css`): Palpagos, Mount Obsidian, Sakurajima, Feybreak. A skin is tokens plus an animated background, so every view re-skins from one place. The choice is remembered in localStorage.
- **No game art in the repo.** `npm run build-portraits` makes stills, models and icons locally; `npm run build` strips game art (and `roster.json`) from `dist/`; `npm run build:resume` ships stills + the lite model set to `dist-resume/` (never committed). See the README.
- **Demo save:** with no `public/roster.json`, the app loads `public/demo-roster.json`, built by `npm run make-demo-roster` with IDs stripped.

## Pipelines (all scripts in `scripts/`)

| Command | Makes | Notes |
|---|---|---|
| `npm run build-portraits` | everything below, in order | The one-command pipeline. `--check` only looks for the game, mappings and browser. `--only A B` for a few pals. `--lite` also builds the small model set. |
| `npm run build-pal-extras` | `src/data/palExtras.json`, `palExp.json` | Partner skills and rarity from paldb (pages cached in `scripts/.cache/paldb`), food from the wiki Cargo `Pal.hungerRate`, pal XP curve from thepalprofessor. **The wiki's partner skill table is stale.** |
| `npm run build-models` | `public/pal-models/` (gitignored) | Chibi files carry Rest02 (live viewer) and Idle (stills). Per-pal head sizes live in `chibi-overrides.json`. `-- --lite` writes `public/pal-models-lite/` (chibi only, 512px, meshopt). |
| `npm run render-portraits` | `public/pal-portraits/` | Needs `npm run dev`. Idle pose by default, `"pose": "bind"` per pal in the overrides. |
| `node scripts/audit-textures.mjs` | report | Lists materials with no texture. |
| `node scripts/fetch-work-icons.mjs` | `public/work-icons/` | paldb icon numbering skips 09. |

## Local-only

- The **Chibi review** tool (`src/routes/ChibiReview.tsx`, `src/design/chibi.css`) is gitignored and dev only. Open `http://localhost:5173/#chibi`. App.tsx loads it through `import.meta.glob` only if it is present.
- `public/pal-models/` is ~730 MB and `pal-models-lite/` ~133 MB; both are gitignored.

## Known issues / next

- **Panthalus (`KingWhale`)** was reported broken: the chibi head (scaled 2x) swelled through its crown ring. Fixed by lowering its head override to 1.4 in `chibi-overrides.json`; the still and both model sets are rebuilt. Worth a look in the Chibi review tool.
- A second chibi review pass on flagged pals (marks are saved in the review tool).
- Make species and pals URLs (Back button, shareable links).
- Fonts load from Google Fonts, so the skins need a network; self-host them for a fully offline build.
- Windows + Edge/Chrome only for `build-portraits`.
- Decide where to host `dist-resume/` (about 149 MB).
