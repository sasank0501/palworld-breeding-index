# Website plan — 2026-10-04

Turning the app into a public website that anyone who owns Palworld can use: open the page, point it
at the save and the game folder, and get the full 3D experience. Nothing is installed, no server
runs, and no game art is hosted.

## Ground rules

- **Zero install.** Everything runs in the browser, and the in-browser extractor is the main path. An
  unsigned `.exe` is a fallback only if the spike in Phase 1 fails.
- **No compromise on quality or accessibility.** WCAG 2.2 AA, and it works in Chrome, Edge, Firefox and
  Safari. We check whether a feature exists and fall back when it doesn't; we never check which
  browser it is.
- **The public site hosts no Pocketpair files.** The portfolio page is a separate site with the art, a
  disclaimer and a takedown policy.
- **Nothing the user made is lost without a way back.** Data is saved continuously, can be backed up,
  and old formats can always be migrated.

## The two sites

| | Public site | Portfolio page |
|---|---|---|
| Who it's for | Players who own the game | Recruiters, anyone with the link |
| Art | Extracted in the visitor's browser | Hosted (stills + lite models) |
| Save | The visitor's own | The demo roster |
| Build | `npm run build` | `npm run build:resume` |

## What the visitor goes through (public site)

```
First visit
  └─ Landing: what this is, "your files never leave your computer"
       └─ 1. Pick your save folder ──► choose a world (if there are several)
            └─ 2. Pick your game folder (Pal/Content/Paks)
                 └─ Extract: progress per stage, cancellable, resumable
                      └─ Render stills (progress)
                           └─ Paldex, fully 3D

Next visits
  └─ Everything still stored? ──yes──► straight to the Paldex
       └─ no ──► say exactly what's missing, one button for each fix:
                 art pack gone → re-extract (Chrome: one "Allow" click)
                 roster gone   → re-pick the save
                 notes gone    → restore from backup file

After a play session
  └─ "Re-import save" (art is kept; only the roster changes)
```

---

## Phases

Each phase has a **done when** list. A phase isn't finished until every item is true, including the
accessibility ones.

### Phase 0 — Groundwork

1. Commit the Showcase work that is currently uncommitted on `paldb-ranks-and-theme`.
2. **Accessibility baseline:** run axe DevTools and Lighthouse on every screen, go through Paldex →
   species → back with the keyboard only, then with NVDA. Write the findings into a checklist
   (`docs/A11Y.md`). This is the "before" picture.
3. Pick the host for the public site (Cloudflare Pages: free, static, HTTPS).
4. A small `features.ts` that reports which browser features exist (`showDirectoryPicker`, OPFS,
   `createWritable`, Service Worker, `storage.persist`). Everything later depends on it.

**Done when:** a clean commit, an A11Y checklist exists, and the feature report is logged on Chrome
and Firefox.
**Learn:** how to audit accessibility; feature detection vs. checking the browser name.

### Phase 1 — Extraction spike (time-boxed: 3 days)

This is the riskiest question in the plan, so it goes first. If the answer is no, the plan changes
before anything else is built on it.

1. A new C# project referencing CUE4Parse, built for `browser-wasm`.
2. A file reader for CUE4Parse whose reads call `file.slice()` in JavaScript, inside a Worker.
3. Replace the native dependencies: Oodle → `ooz-wasm`; texture decoding → a pure C# or JS BCn decoder.
4. Goal: open the `.utoc`, export Lamball's mesh and one animation in a browser tab.
5. Measure: download size, memory use, seconds per pal.

**Done when:** a written verdict in this file. **Go** (browser path) or **No-go** (fallback to an
unsigned single-file `.exe` that writes the same pack).
**Learn:** WebAssembly, .NET in the browser, JS ↔ WASM calls, Web Workers, synchronous vs.
asynchronous I/O.

### Phase 2 — Save import in the browser

Today the roster comes from `npm run import-save` (Node). The parser in `src/save/` is already
TypeScript plus `ooz-wasm`, so it can move into the page.

1. Folder picker: `showDirectoryPicker`, or `<input webkitdirectory>` when that's missing.
2. Find the worlds in the folder; let the user choose; add **`worldId`** to the roster.
3. Parse in a **Web Worker** with progress messages, so the page never freezes.
4. Clear errors: wrong folder, Xbox save, save from an unknown game version.
5. Store the roster in IndexedDB under its `worldId`.

**Done when:** your own 1,990-pal save imports in Chrome and Firefox with no page freeze; every error
has a plain-language message read out by a screen reader (`aria-live`).
**Learn:** the File API, Workers and `postMessage`, IndexedDB basics.

### Phase 3 — User data layer

The design from 2026-10-04: favourites, notes, plans, preferences.

1. Schema v1 (one document per world, objects keyed by ID, an `at` timestamp on each item) and the
   migration runner.
2. Store with `idb-keyval`: save ~300 ms after each change, flush on `visibilitychange`, and use
   `BroadcastChannel` so open tabs stay in step.
3. Pals that left the save keep their data in a "No longer in your save" list.
4. Back up / restore a JSON file: check it, migrate it, preview it, then merge or replace.
5. Chrome/Edge: automatic backup file through a stored file handle, plus "Reconnect backup".
6. Ask `navigator.storage.persist()` after the first favourite or plan.
7. Move the skin preference out of `localStorage` into this layer.

**Done when:** vitest covers migrations, merging and rejected files; "Clear site data" followed by a
restore brings everything back; the restore dialog works fully with the keyboard.
**Learn:** data modelling, schema migrations, merge rules, transactions.

### Phase 4 — Art loader

1. Pack format: `pack.json` (pack format version, game version) + `pal-models/` + `pal-portraits/`.
2. Write into OPFS, streamed (`createWritable`, or `createSyncAccessHandle` in a Worker).
3. Service Worker answers `/pal-models/*` and `/pal-portraits/*` from OPFS. The existing components
   don't change.
4. Fallback when the Service Worker isn't running (e.g. private windows): `blob:` URLs.
5. Test with your own `pal-models-lite` output zipped up, before any extractor exists.

**Done when:** with the server's art folders deleted, the app shows full 3D from OPFS in Chrome,
Firefox and Safari, and in a Firefox private window through the fallback.
**Learn:** OPFS, Service Workers and their lifecycle, streams.

### Phase 5 — Stills rendered in the browser

1. three.js on an `OffscreenCanvas` in a Worker; the same framing and lighting as `render-portraits`.
2. Idle pose → render → `convertToBlob('image/webp')` → OPFS → `index.json`.
3. Progress bar, cancellable, resumes where it stopped.
4. Compare side by side with the current stills until they match.

**Done when:** all 289 stills render with no visible difference from today's; time measured on a
mid-range laptop.
**Learn:** WebGL rendering outside the page, cameras and bounding boxes.

### Phase 6 — Full extractor

Following the Phase 1 verdict:

- **Go:** extend the spike to every pal; port `build-pal-models.mjs` to the browser (gltf-transform,
  `psa.mjs` and meshoptimizer as they are; canvas instead of `sharp`); write the Phase 4 pack.
- **No-go:** a self-contained single-file `.exe` that finds Steam on its own and writes the same pack
  as a `.zip`. Published on GitHub Releases, built by GitHub Actions, with checksums.

Either way: resumable, cancellable, honest progress, and a check that the mappings match the game version.

**Done when:** a fresh browser profile goes from the landing page to the full 3D Paldex using only a
game folder and a save.

### Phase 7 — Accessibility and cross-browser pass

Run against the Phase 0 checklist:

- Keyboard and NVDA through every flow, including import, extraction and restore.
- Contrast in all four skins, light and dark.
- `prefers-reduced-motion`: skin backgrounds, the spotlight, auto-playing models.
- Text equivalents for the models; the animation picker uses `aria-pressed`.
- Focus moves to the new heading on navigation and goes back to the tile on Back/Esc.
- Chrome, Edge, Firefox, Safari; a phone for the landing page.

**Done when:** every checklist item is closed or written down as a known issue with a reason.

### Phase 8 — Ship

1. **Reminder: make our own work and element icons** (replacing the ones from paldb).
2. Shareable URLs for species and pals (also from the handoff list).
3. Self-host the fonts.
4. Deploy the public site; deploy the portfolio page separately with its disclaimer.
5. Link GitHub issues for feedback.

---

## After each Palworld patch

1. Get the new `.usmap`; run the extractor on your own install.
2. Re-run the data scripts (`build-pal-extras`, `extract-data`) for new pals, passives and skills.
3. If the pack layout changed, bump the pack format version; the site then asks for a re-extract.
4. If the save format changed, add a test with the new save.
5. Release, with a short "what changed" note on the site.

## Order and dependencies

```
Phase 0 ──► Phase 1 (spike) ──────────────────────────────► Phase 6 ──► Phase 7 ──► Phase 8
       └──► Phase 2 (save) ──► Phase 3 (user data)            ▲
       └──► Phase 4 (art loader) ──► Phase 5 (stills) ────────┘
```

Phases 2–5 don't depend on the spike, so they can go ahead while its result is open, and none of that
work is lost whichever way it goes.
