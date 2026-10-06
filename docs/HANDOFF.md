# Handoff — 2026-10-05 (evening)

Branch `paldb-ranks-and-theme`, pushed to origin up to 4443f26; later commits are local (push on
"wrap it up"). Type-check, 110 tests, `npm run build` pass. `docs/WEBSITE-PLAN.md` has every phase's
detail and decisions; `docs/A11Y.md` the accessibility checklist. Learning page: claude.ai artifact
`9hUfnrC8NXRkssEC4Tjcz6` (source: last session's scratchpad `build-log.html`; read it with the
Artifact tool before editing). Every new part gets a quiz and a "Why, and the evidence" block with
sources checked in-session (see memory).

## Phases

| Phase | Status |
|---|---|
| 0–3 | done |
| 4 Art loader | **done**: Edge, Firefox, Firefox private. `src/art/` (pack, storage OPFS/IndexedDB, worker, resolver, loader) |
| 5 Card pictures in the browser | **built**: `src/art/stills.ts`, `stillsRunner.ts`. 288 in 94 s (RTX 4070), 0 failures. Not yet measured on a laptop without a GPU |
| 6 Full extractor | **next** (plan below) |
| 7 A11y + cross-browser | open items in A11Y.md (spotlight dots 24 px, two aria-prohibited-attr, 12 px text floor, model alt/pause, phone first tile, dark mode decision), Safari |
| 8 Ship | own work/element icons, favicon (404 today), self-hosted fonts, pal URLs, deploy |

**Scope cut rejected:** cards show stills taken from the 3D models; detail pages show live 3D.

## Built on 2026-10-05 (all committed)

- Contrast 2,702 → 0 (text tokens per theme); main landmark + skip link; focus to heading on open,
  back to opener on Back; NVDA fixes (glyphs, names, announcements). Audit script really switches
  themes and now flags any element past the screen edge.
- Hatch style D (egg squash → grow), once per species per visit; 150 ms rule.
- Spotlight: Hide (Undo 8 s), Potential/Passives order, "Hidden from the spotlight" page; user data
  format 2 (`hidden`).
- My Pals loads as you scroll (marker 600 px ahead, 60 per batch, announced); `content-visibility`
  keeps 1,990 cards at 16.7 ms frames; hover room fix.
- Star = outline → solid theme accent, no disc.
- Import screen: drifting rows filling the height (eggs, then pal silhouettes), pause, reduced motion.
- Phone fixes: search box border-box, filter switch wraps at 320 px.
- `npm run make-art-pack` writes `art-pack/` **without** stills by default (`--with-stills` adds them).

## Decisions

- **Type mappings (`.usmap`) = community sources with safety nets**: fetch at runtime (GitHub raw
  sends `Access-Control-Allow-Origin: *`), backup source, verify by decoding a known table, cache with
  the pack, else ask the player for a file. Never host it ourselves for now. Local copies:
  `scripts/pal-textures/mappings/` (elliotks repo archived Feb 2025; PalworldModding/UsefulFiles).
- "Wrap it up" = commit, rewrite this file, scan for game art/personal data, push.

## In progress

- **User is doing a chibi model review** at `localhost:5173/#chibi` (local tool, gitignored), with marks
  (1 ok, 2 head big, 3 head small, 4 broken) and a "What's off?" note per pal. It autosaves to
  `scripts/.cache/chibi-review.json` (dev-only endpoint in vite.config.ts). When they say done: read
  that file, turn findings into `scripts/chibi-overrides.json` edits / model fixes. Don't rebuild
  models or touch public/pal-models while the review runs.

## Next: Phase 6 plan (agreed to propose; step 1 not started)

1. Research mappings sources for Palworld 1.0 (current, update lag, version match); pick main + backup.
2. Mappings module: fetch, fallback, verify, cache, ask-for-file.
3. Move the CUE4Parse WebAssembly spike (`spikes/cue4parse-wasm`) into an app worker, loaded on demand.
4. Game folder picking from Program Files (classic input + copyable path hint); user tests by hand.
5. Export all 288 pals in the browser, streaming per pal, progress/stop/resume.
6. Port `build-pal-models.mjs` to the browser (head overrides, animations, meshopt) → `pal-models/`;
   Phase 5 then makes the stills.
7. End to end in a fresh browser, measured; learning page chapter with quiz + evidence.

Also pending: user's NVDA pass (note editor, Saved plans, restore dialog).

## How things work (unchanged)

Dev: `npm run dev` (5173, loads `public/roster.json` + server art). Public build: `npm run build` then
`npx vite preview` (4173; no art, import screen). Test art: `npm run make-art-pack` → "Choose the art
folder". Pipelines and local-only notes as in WEBSITE-PLAN.md and README.
