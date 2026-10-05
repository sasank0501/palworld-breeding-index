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
- **The 3D is required, not an opt-in.** Every visitor gets the 3D pal models; loading the art is
  part of the first visit, not a setting or an extra. Silhouettes and placeholders exist only as a
  loading state while the 3D arrives, never as a mode to stay in. No browser gets a 2D-only path:
  where a storage API is missing (Firefox private: no OPFS), the fallback still delivers the 3D.
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

**Status (2026-10-04): done.** Showcase committed; baseline in `docs/A11Y.md` (`npm run audit-a11y`);
`src/lib/features.ts` logs a table in the dev console. Host: Cloudflare Pages, set up at deploy time.
Feature report:

| | Edge | Firefox | Firefox private |
|---|---|---|---|
| Folder / save-file pickers | yes | no | no |
| `<input webkitdirectory>` | yes | yes | yes |
| OPFS, streamed writes | yes | yes | **no** |
| Service Worker API present | yes | yes | yes (registration still to test) |
| IndexedDB, BroadcastChannel, OffscreenCanvas, WebGL2, WASM | yes | yes | yes |
**Learn:** how to audit accessibility; feature detection vs. checking the browser name.

### Phase 1 — Extraction spike (time-boxed: 3 days)

This is the riskiest question in the plan, so it goes first. If the answer is no, the plan changes
before anything else is built on it.

1. A new C# project referencing CUE4Parse, built for `browser-wasm`.
2. A file reader for CUE4Parse whose reads call `file.slice()` in JavaScript, inside a Worker.
3. Replace the native dependencies: Oodle → `ooz-wasm`; texture decoding → a pure C# or JS BCn decoder.
4. Goal: mount `Pal-Windows.pak`, export Lamball's mesh and one animation in a browser tab.
5. Measure: download size, memory use, seconds per pal.

**Progress.** Code in `spikes/cue4parse-wasm/`. Run: `dotnet publish -c Release`, then
`node serve.mjs bin/Release/net10.0/publish/wwwroot 5190` and open `http://localhost:5190/`.

- **Part 1 — CUE4Parse in the browser: passed (2026-10-04).** Builds with the
  `Microsoft.NET.Sdk.WebAssembly` SDK and no workload. Runs in a module Web Worker in Edge and
  Firefox; the .NET runtime starts in 0.5 s (Edge) / 0.8 s (Firefox) served locally. One processor;
  `Parallel.For` runs inline, so no threading changes needed so far. Download: 44 MB raw, **14 MB
  Brotli**, with nothing trimmed yet (BouncyCastle, the largest file, is likely unused here).
  **The game's files:** Palworld is not IoStore (`.utoc`/`.ucas`). It is one **39 GB
  `Pal-Windows.pak`**, pak version 11, with its index at the end (7.4 MB, starting 39,236,438,058
  bytes in) and **Oodle** compression. The desktop extractor has no Oodle DLL because CUE4Parse
  uses **OodleSharp**, a C# port of the Oodle decompressor, so decompression runs in WebAssembly
  as-is. Texture decoding (AssetRipper.TextureDecoder) and PNG (ImageSharp) are managed too.
- **Part 2 — the pak through file.slice(): passed (2026-10-04).** `StreamedFileProvider` with one
  `JsFileStream` whose `Read` calls `readRange()` in the worker over `[JSImport]`; `readRange` uses
  `file.slice()` + `FileReaderSync`. Usmap from bytes through a small `UsmapTypeMappingsProvider`
  subclass.

  | | Edge | Firefox |
  |---|---|---|
  | Mount: files indexed | 185,141 | 185,141 |
  | Mount time | 0.6 s | 0.95 s |
  | Mount reads | 3 reads, 15.3 MB of 39 GB | same |
  | Usmap load (2.3 MB) | 0.18 s | 0.22 s |
  | Lamball `SK_SheepBall` decode | 0.12 s, 5 reads, 90 KB | 0.14 s |
  | Managed heap after mount | 107 MB | 107 MB |

  The mesh matches the desktop export exactly: 3 sections, 3,792 vertices, 27 bones, materials
  Eye/Mouth/Body. Its `.uexp` is Oodle-compressed (89,650 -> 198,824 B, four 64 KB blocks), so
  OodleSharp works under WebAssembly. Mount reads: footer (262 B at the end), primary index (7.4 MB),
  directory index (7.9 MB). **Bug met:** `SubmitKey()`/`Mount()` block on their async versions
  (`Task.Result`), which the single-threaded runtime refuses ("Cannot wait on monitors on this
  runtime"). Fix: `SubmitKeyAsync`/`MountAsync`, awaited up to a JS Promise. Expect the same for any
  other sync-over-async call in Part 3.
- **Part 3 — export and measure: passed (2026-10-04).** The desktop's own `ExportSession` export
  runs unchanged into .NET's in-memory file system. Checked against the desktop output for 7 pals
  (Lamball, Jetragon, Blazamut, Anubis, Depresso, Alpaca, Ganesha):
  - every `.glb` and `.psa` **byte-identical**; material JSON identical apart from line endings;
  - textures: SkiaSharp (native) fails, so they are decoded with the managed AssetRipper decoder
    (`TextureDecoder.UseAssetRipperTextureDecoder = true`) and encoded with ImageSharp. Same sizes;
    colour and mask channels within ±2 of 255; BC5 normal maps ±1 on X/Y and up to 18 on the
    reconstructed Z (the two decoders round sqrt(1-x²-y²) differently).

  25 pals spread across the list, back to back (Edge; Firefox on 8 of them):

  | Pipeline | Edge, per pal | Edge, 333 meshes | Firefox, 333 meshes |
  |---|---|---|---|
  | As the desktop (full-size PNG) | 9.6 s | 53 min | 59 min |
  | 1024 mip, raw pixels, no PNG | 3.2 s | 18 min | 21.5 min |
  | + mesh-only export (measured on 4 pals) | ≈ 1.5 s | ≈ 8–9 min | ≈ 10 min |

  WebAssembly memory levels off at **594 MB** (full-size) or **412 MB** (1024 mips), provided each
  pal's files are handed off and deleted (they live in Wasm memory, which never shrinks). PNG
  encoding was 53% of the time; `ExportSession` with `exportMaterials` decodes every texture at full
  size before Skia fails, which is most of the mesh step (2.4 s -> 0.3–0.8 s without it).

  Gotchas found, all handled or listed for Phase 6:
  - CUE4Parse joins output paths with `\`; on the browser's Unix-style FS that makes one file named
    `\out\SheepBall\...` in `/`. Handled by normalising names.
  - Some material files are `Ml_` (lowercase L), not `MI_`. Read materials by content.
  - Variants (`_Ice`, `_Dark`, `_Fire`) borrow the base species' animations: port the desktop's
    fallback.
  - Phase 6: take the texture list from the material objects, not the exported JSON, so
    `exportMaterials` can stay off.

**Verdict: go.** Extraction in the browser works in Edge and Firefox, produces the desktop's files,
fits in ~400–600 MB, and should take roughly 10 minutes once (plus model building and stills,
measured in Phases 5–6). The `.exe` fallback is not needed.

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

**Status (2026-10-04): done.** `src/save/importWorld.ts` is the one import both the CLI and the
browser run (the refactored CLI's roster is identical to the old one's). `findWorlds` groups a picked
folder into worlds, skips `backup/`, finds `GlobalPalStorage.sav` one level up, and names worlds from
`LevelMeta.sav` (world name, host, level, in-game day). `import.worker.ts` copies every file into
memory first, then parses; rosters live in IndexedDB (`palworld-index/rosters`, key `roster:<world>`,
plus `current`). Results on the real save: Edge (full UI, fallback input) and Firefox (the worker,
fed Files) both produce a roster identical to the CLI's, 1,990 pals, in about 1 s. Reload opens from
IndexedDB. axe: clean apart from the accent-button contrast already in `docs/A11Y.md` item 1.

- **Hand test (Sasank, 2026-10-04):** Firefox's folder input works end to end (it asks to trust the
  site, then lists both worlds); a wrong folder gives the plain message. **Edge refused the save folder
  in `showDirectoryPicker`** ("can't open this folder because it contains system files"): Chromium
  blocks that picker for all of AppData, where every Steam save lives. Fixed: saves always use
  `<input webkitdirectory>`; re-verified in Edge, then by hand in Edge, Firefox, Brave and a private
  window. Keyboard-only pass on the import screen: works as intended. Still to try: NVDA.
- **Consequence for Phase 6:** the same block covers Program Files, the default Steam install
  (`C:Program Files (x86)Steam`). Use the classic input for the game folder too, or offer
  `showDirectoryPicker` only when it succeeds and fall back on refusal.
- Xbox / Game Pass: detected and explained, not read. Possible later phase: an adapter that turns the
  `wgs` container into the same in-memory files (needs a real Xbox save to build against).

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

**Status (2026-10-04): data layer done; UI waits for review.** `src/userdata/`:
`schema.ts` (format v1, migrations, checks), `edit.ts` (favourite, note, plan; merge; pals no longer
in the save), `store.ts` (`WorldStore`: IndexedDB `palworld-index-userdata`, 300 ms debounce, flush on
`visibilitychange`/`pagehide`, merge-on-write, `BroadcastChannel`, `persist()` on first item,
memory-only fallback, unreadable data set aside), `backup.ts` (download, preview + merge/replace
restore, Chrome/Edge file sync with reconnect), `useWorldData.ts` (React). The skin now also goes
into the store, so backups carry it. Deletes leave dated tombstones so a merge can't revive them.
18 tests (fake-indexeddb). Checked in Edge: choosing a skin writes `prefs`.

- **UI done (2026-10-05),** from Sasank's picks on the design canvas "Paldex Data Controls":
  a settings gear in the top bar (Themes, Your data: backup / restore dialog / backup file, Open a
  different save; the theme buttons left the top bar); stars on My Pals cards and the pal sheet plus
  a Favourites filter; "+ Add note" on the pal sheet; "Save this plan" and a "Saved plans" menu (5
  recent) with a full Saved plans page; and a notice after an import listing marked pals that left
  the save. Marks now keep a `label` so departed pals can be named. Each piece checked end to end in
  Edge with axe: nothing new beyond the accent-button contrast (docs/A11Y.md item 1).
- **Follow-ups:** a per-plan "steps left" status on the Saved plans page (needs the solver per
  plan); NVDA pass on the new controls.

### Phase 4 — Art loader

1. Pack format: `pack.json` (pack format version, game version) + `pal-models/` + `pal-portraits/`.
2. Write into OPFS, streamed (`createWritable`, or `createSyncAccessHandle` in a Worker).
3. Service Worker answers `/pal-models/*` and `/pal-portraits/*` from OPFS. The existing components
   don't change.
4. Fallbacks, from the Phase 0 feature report: when the Service Worker isn't controlling the page,
   `blob:` URLs. **Firefox private windows have no OPFS at all** (IndexedDB still works there), so the
   pack goes into IndexedDB instead, and the page says it will be gone when the window closes.
5. Test with your own `pal-models-lite` output zipped up, before any extractor exists.

**Done when:** with the server's art folders deleted, the app shows full 3D from OPFS in Chrome,
Firefox and Safari, and in a Firefox private window through the fallback.
**Learn:** OPFS, Service Workers and their lifecycle, streams.

**Status (2026-10-05): built; Edge passes, Firefox to try by hand.** Decisions made while building:

- **No Service Worker.** A hard reload (Ctrl+F5, Shift+Reload) skips it by spec, and Firefox private
  windows only gained Service Worker support in Nightly 138, so the `blob:` fallback would carry real
  traffic either way. One path instead: `src/art/resolve.ts` turns a path like
  `pal-models/Anubis.chibi.glb` into a `blob:` URL from the stored pack (or the plain URL when the
  server hosts the art: dev and the portfolio build). Three loaders changed (`PalModel`,
  `loadStills`, the species art); a worker can still come later for offline use.
- **A pack is a folder, not a zip.** Picked like the save (`<input webkitdirectory>`), so no zip
  library. `npm run make-art-pack` builds one from this machine's art (`art-pack/`, gitignored:
  866 files, 190 MB with the lite models). Phase 6 writes the same layout from the game.
- **Storage:** OPFS where it opens (written in a worker through sync access handles), IndexedDB
  where it doesn't (Firefox private). A pack is written under a fresh id and made current only once
  complete; a stopped or failed load leaves the old pack untouched (`src/art/store-pack.ts`).
  `navigator.storage.persist()` is asked after a load.
- **Loading states** (3D required; these are only on the way to it): the element-tinted egg
  (`ArtPlaceholder`, our own drawing) while there is no art, the flat icon as a silhouette while an
  extraction is still filling the pack (Phase 6 sets `complete: false`), then the still, then 3D.
- **The 3D is asked for, not offered:** with no art, an "Add the game art" notice sits above every
  page until there is some. The settings panel has a "Game art" section (status, replace, remove).

Measured (Edge, headless): the 190 MB pack loads in 34 s; storage use 190 MB; every Paldex picture
and the species page's 3D model come from `blob:` URLs, and still do after a reload. axe: no
violations with the notice and the settings section open, in all four themes. Safari can't be tested
on this machine.

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
