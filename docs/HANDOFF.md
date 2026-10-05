# Handoff — 2026-10-05

Branch `paldb-ranks-and-theme`, 21 commits since `9f19252`, **nothing pushed**. Type-check, the 93
tests, `npm run build` and `npm run build:resume` pass.

The project is turning into a **public website**: a player opens the page, points it at their save
(and later their game folder), and gets the full app with nothing installed and no game art hosted.
`docs/WEBSITE-PLAN.md` has the phases and the detailed results; `docs/A11Y.md` the accessibility
baseline. A learning page follows the work chapter by chapter (claude.ai artifact
`9hUfnrC8NXRkssEC4Tjcz6`, private); the Phase 3 design picks are on the canvas "Paldex Data
Controls" (`H5LinWAA8QyiAihyKFSMHm`).

## What was done on 2026-10-04/05

| Phase | Status | Where |
|---|---|---|
| 0 Groundwork | done | Showcase committed; `docs/A11Y.md` + `npm run audit-a11y`; `src/lib/features.ts`; host: Cloudflare Pages (at deploy) |
| 1 Extraction spike | **verdict go** | `spikes/cue4parse-wasm`: CUE4Parse runs in a browser and exports the same files as the desktop |
| 2 Save import in the browser | done, hand-tested | `src/save/importWorld.ts`, `findWorlds.ts`, `import.worker.ts`, `pick.ts`, `store.ts`; `src/routes/Import.tsx` |
| 3 The player's own data | done | `src/userdata/` (format, merge, IndexedDB store, backups) and its UI in `src/routes/showcase/` |
| 4–8 | not started | next: Phase 4, the art loader |

**Phase 3 UI**, from Sasank's picks on the design canvas:
- a **settings gear** in the top bar (`Settings.tsx`): **Themes** (the four skins; players see
  "Themes", the code still says skin), Your data (download a backup, restore through a Merge /
  Replace / Cancel dialog, Chrome/Edge: keep a backup file updated), Open a different save. The
  theme buttons left the top bar.
- **stars** on My Pals cards and the pal sheet, plus a Favourites filter (`Fav.tsx`)
- **"+ Add note"** on the pal sheet (`Note.tsx`)
- **"Save this plan"**, a Saved plans menu (5 recent) and a full **Saved plans** page (`SavedPlans.tsx`)
- a **notice after an import** when starred or noted pals have left the save (`Missing.tsx`)

The player's data rides on the Showcase `ctx` (`ctx.user`, from `useWorldData`).

## What we found out

**About the game files**
- Palworld is **one 39 GB `Pal-Windows.pak`** (pak version 11), not IoStore `.utoc`/`.ucas`. The
  index sits at the end: footer 262 B, primary index 7.4 MB, directory index 7.9 MB; mounting reads
  only those (15.3 MB, 0.04% of the file) and indexes 185,141 files.
- It is **Oodle**-compressed in 64 KB blocks, but no native Oodle is needed: CUE4Parse uses
  **OodleSharp**, a C# port, which runs in WebAssembly unchanged.
- Some material files are named **`Ml_`** (lowercase L), not `MI_`. Find materials by content.
- Each world folder has **`LevelMeta.sav`** with the world name, host, level and in-game day: the
  import screen names worlds from it ("pal1.0 · RougeStark · level 80 · day 201").
- `backup/` folders beside each world hold older `Level.sav` copies; never treat them as worlds.

**About running CUE4Parse in a browser** (details in WEBSITE-PLAN, Phase 1)
- Builds with the `Microsoft.NET.Sdk.WebAssembly` SDK, no workload; 14 MB Brotli download.
- Reads must be synchronous, so the extractor runs in a **Web Worker** with `FileReaderSync` over
  `file.slice()`.
- `SubmitKey()`/`Mount()` block on `Task.Result`, which the single-threaded runtime refuses
  ("Cannot wait on monitors"): call `SubmitKeyAsync`/`MountAsync` and await.
- CUE4Parse joins output paths with `\`, which in the browser's Unix-style file system is part of a
  file name; normalise when listing output.
- Textures: **SkiaSharp is native** and fails; use the managed AssetRipper decoder
  (`TextureDecoder.UseAssetRipperTextureDecoder = true`) and ImageSharp. `.glb` and `.psa` come out
  **byte-identical** to the desktop's; colours within ±2/255; BC5 normal maps' rebuilt Z within 18.
- Cost for all 333 meshes: 53 min as the desktop does it, **18 min** decoding 1024 mips without PNG,
  **≈ 9 min** estimated with a mesh-only export. Memory levels off at 412–594 MB if each pal's output
  is handed off and deleted (WebAssembly memory never shrinks).

**About browsers**
- **Chrome and Edge block `showDirectoryPicker` for all of AppData** ("contains system files") —
  every Steam save lives there. Found by hand; saves now always use `<input webkitdirectory>`. The
  same block covers Program Files, the default Steam install: Phase 6 must plan for it.
- **Firefox private windows have no OPFS** (IndexedDB still works): the art loader needs a fallback.
- Firefox's automation can't fill a folder input, and headless browsers can't drive native folder
  dialogs: those paths need a person.
- ooz-wasm uses top-level await, so the build targets **ES2022** and workers are ES modules.

**About the app** (each caught by a test before commit)
- `display: grid` on an element overrides its `hidden` attribute: add `[hidden] { display: none }`.
- An element with an entrance animation gets its own stacking layer; a menu inside it can open
  under later content. Raise the layer.
- No button inside a button: card stars sit beside the card in a wrapper.
- A control's state needs 3:1 contrast: a gold star alone on white is 1.4:1.
- Keyboard shortcuts must ignore every text field, not only `<input>`.
- `width: 100%` plus padding overflows a phone with the default `box-sizing`.
- A pal that leaves the save takes its name with it: stars and notes now keep a `label`.
- **The one recurring axe failure** is the accent button (white on `#2f7bff`, 3.89:1; Sakurajima
  4.3:1): `docs/A11Y.md` item 1.

## Decisions made today

- **Bring your own assets:** the public site hosts no Pocketpair files; the visitor's browser
  extracts the art from their own install. **No code signing**, so in-browser extraction is the main
  path (the spike says it works); an `.exe` is not needed.
- **Portfolio page:** a separate public page that hosts the art, with a disclaimer and a takedown
  policy.
- **Silhouettes before the 3D** (revised after seeing the art-less build): placeholders we draw
  ourselves first, then the game's 2D pal icons pulled quickly from the visitor's own pak as
  silhouettes, then 3D filling in. To plan into Phase 4/6.
- **Xbox / Game Pass:** detected and explained, not read. A later optional phase could add an adapter
  that turns the `wgs` container into the same in-memory files (needs a real Xbox save to test).
- **Before shipping:** make our own work and element icons (the current ones come from paldb).

## Next

1. **Accent-button contrast** (A11Y item 1): a darker accent per theme for text, fill unchanged. It is
   small and clears the most common failure on every screen.
2. **Phase 4, the art loader:** pack format, OPFS + Service Worker, IndexedDB in Firefox private,
   `blob:` URLs when the worker isn't running; plan the silhouette stage here.
3. Follow-ups: "steps left" per saved plan; NVDA pass on the import screen and the Phase 3 controls.

## How things work now

- **Opening the app:** a world imported in this browser before → straight to the Paldex; else a
  local `public/roster.json` (development) → that; else the portfolio build → the demo; else the
  import screen. The demo save has stable ids (`demo-0`…) and world `demo`, so stars and notes work
  on it without touching a real save.
- **Storage:** rosters in IndexedDB `palworld-index` (`roster:<world>`, `current`); the player's data
  in `palworld-index-userdata` (`world:<id>`, `prefs`); the backup-file handle in
  `palworld-index-backupfile`. The skin is also cached in localStorage so the first paint is right.
- **Testing the import by hand:** `npm run build`, then `npx vite preview` (the dev server would load
  `roster.json` and skip the import screen); "Open a different save" in the gear returns to it.
- The Showcase sections are unchanged from before: Paldex, species page, My Pals and pal sheet,
  Breeding, Planner; navigation is a stack (Back/Esc returns with scroll and filters kept).

## Pipelines (all scripts in `scripts/`)

| Command | Makes | Notes |
|---|---|---|
| `npm run build-portraits` | everything below, in order | The one-command pipeline. `--check` only looks for the game, mappings and browser. `--only A B` for a few pals. `--lite` also builds the small model set. |
| `npm run build-pal-extras` | `src/data/palExtras.json`, `palExp.json` | Partner skills and rarity from paldb (pages cached in `scripts/.cache/paldb`), food from the wiki Cargo `Pal.hungerRate`, pal XP curve from thepalprofessor. **The wiki's partner skill table is stale.** |
| `npm run build-models` | `public/pal-models/` (gitignored) | Chibi files carry Rest02 (live viewer) and Idle (stills). Per-pal head sizes live in `chibi-overrides.json`. `-- --lite` writes `public/pal-models-lite/` (chibi only, 512px, meshopt). |
| `npm run render-portraits` | `public/pal-portraits/` | Needs `npm run dev`. Idle pose by default, `"pose": "bind"` per pal in the overrides. |
| `npm run import-save` | `public/roster.json` | Same import code as the browser (`importWorld`). |
| `npm run audit-a11y` | `scripts/.cache/a11y/` | axe on every screen and theme, plus keyboard, reduced-motion and phone checks. Needs the dev server; `APP=<url>`. |
| `node scripts/audit-textures.mjs` | report | Lists materials with no texture. |
| `node scripts/fetch-work-icons.mjs` | `public/work-icons/` | paldb icon numbering skips 09. |

The spike: `cd spikes/cue4parse-wasm`, `dotnet publish -c Release`, then
`node serve.mjs bin/Release/net10.0/publish/wwwroot 5190` and open `http://localhost:5190/`.

## Local-only

- The **Chibi review** tool (`src/routes/ChibiReview.tsx`, `src/design/chibi.css`) is gitignored and
  dev only: `http://localhost:5173/#chibi`.
- `public/pal-models/` is ~730 MB and `pal-models-lite/` ~133 MB; both gitignored. `dist-resume/` now
  builds to **193.5 MB** (it was ~149 MB): worth checking which art it picks up before hosting it.

## Known issues

- Some chibis' Sleep pose dips below the floor (Lamball's 2x head clips the stage bottom).
- Panthalus (`KingWhale`): head override lowered to 1.4; worth a look in the Chibi review tool.
- Species and pals have no URLs yet (Back button, shareable links).
- Fonts load from Google Fonts; self-host them for a fully offline build.
- `build-portraits` is Windows + Edge/Chrome only.
