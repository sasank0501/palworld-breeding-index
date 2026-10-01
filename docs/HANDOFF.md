# Handoff — 2026-10-01

Branch `paldb-ranks-and-theme`. Type-check, the 76 tests and `npm run build` pass.

## Where things stand

- **Pal Box** uses the new card and detail page from `src/components/PalCards.tsx`; the Design sandbox tab is gone.
  - Size presets: Comfortable (4 per row), Default (6) and Compact (8, no type or IVs). A preset drops columns rather than shrink a card below its floor width.
  - Row heights are measured by the virtualiser. Rows are keyed by layout so they remount and re-measure.
  - The detail page opens over the list, so Back keeps the scroll position.
  - Both pages follow the Light/Dark toggle (the light token block is at the end of `design.css`).
- **Card:** the frame shows rarity, not element (`rarityTier` in `src/design/palExtras.ts`). Alpha, Lucky and Awakened are pills. Passives slide up on hover. The portrait is a chibi still with a sprite fallback.
- **Detail page:** real partner skill, food, XP bar and work levels out of 10 (plus passive boosts) with the game's icons. The chibi model opens by default and the Normal toggle stays for now.
- **Demo save:** with no `public/roster.json`, the app loads `public/demo-roster.json`, built by `npm run make-demo-roster` from the real roster with IDs stripped.

## Pipelines (all scripts in `scripts/`)

| Command | Makes | Notes |
|---|---|---|
| `npm run build-pal-extras` | `src/data/palExtras.json`, `palExp.json` | Partner skills and rarity from paldb (pages cached in `scripts/.cache/paldb`), food from the wiki Cargo `Pal.hungerRate`, pal XP curve from thepalprofessor. **The wiki's partner skill table is stale.** |
| `npm run build-models` | `public/pal-models/` (gitignored) | Chibi files carry Rest02 (live viewer) and Idle (stills). Per-pal head sizes live in `chibi-overrides.json`. |
| `npm run render-portraits` | `public/pal-portraits/` | Needs `npm run dev`. Idle pose by default, `"pose": "bind"` per pal in the overrides, and an automatic bind fallback for empty stills. The harness logic is in `portrait-harness.js` and imported cache-busted (Vite's watcher ignores `scripts/`). |
| `node scripts/audit-textures.mjs` | report | Lists materials with no texture. 5 models still have one leftover "Extra" material. |
| `node scripts/fetch-work-icons.mjs` | `public/work-icons/` | paldb icon numbering skips 09. |

## Local-only

- The **Chibi review** tab (`src/routes/ChibiReview.tsx`, `src/design/chibi.css`) is gitignored. App.tsx loads it through `import.meta.glob` only if it is present.
- `public/pal-models/` is 670 MB. Vite copies `public/` into `dist/`, so delete it from `dist` (or build on a clean clone) before deploying.

## Next

- A second chibi review pass on the flagged pals (marks are saved in the review tab). Then remove the Normal toggle.
- Make the detail page a URL (Back button, links) and add previous/next between pals.
- Mark the equipped skills, show souls and Awakened on the detail page, and add exact partner values per level (from the cached paldb pages).
- Decide whether the detail portrait frame should match the card's rarity colour.
