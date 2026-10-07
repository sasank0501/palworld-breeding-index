# Palworld Breeding Index

A breeding planner for Palworld v1.0 that works against **your actual Pal Box**, read
straight out of your local save file.

It opens on the **Paldex**, and goes deeper from there:

- **Paldex** — all 289 species as a collectible grid, with a spotlight on your strongest pals.
  Species you own show in colour, ones you can breed right now glow, the rest are silhouettes.
  Click one for its page: partner skill, work suitability, every parent pair, and a family tree
  of the shortest breeding route from what you own.
- **My Pals** — everything you own, searchable by name, nickname or passive, with a full sheet
  for each pal (potential, passives, techniques, jobs).
- **Breeding** — which species you can breed right now from pals you already have, how many
  steps away the rest are, and which need a mate you lack.
- **Planner** — pick a species and up to four passives, get a concrete breeding chain as a
  tree, the pals to gather (and where they are kept), and the order to breed in.

Four skins, switched from the top bar: **Palpagos** (the game's bright, chunky look),
**Mount Obsidian**, **Sakurajima** and **Feybreak**.

## Setup

```bash
npm install
npm run import-save      # reads your Pal Box from your own save (see below)
npm run build-portraits  # optional: pal art and 3D models, from your own copy of the game
npm run dev
```

Requires **Node 22.6 or newer**. `scripts/import-save.ts` runs as TypeScript directly via
Node's native type stripping; on older versions it fails rather than degrading.

The app works without `build-portraits`: cards fall back to a small sprite (after
`npm run fetch-images`, which mirrors third-party portraits) or to the pal's initials, and the
detail page simply has no 3D view.

## Pal art and 3D models

**This repository contains no Palworld art, models or icons.** `npm run build-portraits` makes
them on your own machine, from a copy of the game you own:

1. extracts each pal's mesh, textures and animations from the game's `.pak` files
   (`scripts/pal-textures`, built on [CUE4Parse](https://github.com/FabianFG/CUE4Parse)),
2. builds a `.glb` model of each pal, in the game's proportions and as a chibi, each carrying
   five animations (Rest, Idle, Walk, Sleep, Petting; the list is `scripts/anim-roles.json`),
   which the species and pal pages let you switch between,
3. renders a chibi still of each pal with headless Edge or Chrome, and
4. fetches the game's twelve work-suitability icons and nine element icons.

```bash
npm run build-portraits                                 # everything (long; resumable)
npm run build-portraits -- --only Alpaca KingBahamut    # try it on two pals first
npm run build-portraits -- --check                      # look for everything, change nothing
```

You need the **.NET 10 SDK**, Edge or Chrome, and a **`.usmap` type-mappings file** for your
installed game version. Unreal stores Palworld's data without field names, so it cannot be read
without one; the community publishes one per game update, at
[PalworldModding/UsefulFiles](https://github.com/PalworldModding/UsefulFiles) (see
[Outside dependencies](#outside-dependencies)). Put it in
`scripts/pal-textures/mappings/` (or pass `--usmap <file>`). The game folder is found through
Steam automatically (or pass `--paks <dir>`). Run with `--help` for every option.

Everything it writes (`public/pal-models`, `public/pal-portraits`, `public/work-icons`, `public/element-icons`,
`scripts/pal-textures/out`) is gitignored and stays on your machine. `npm run build` produces
the public site (`dist/`) **without** any of it, whatever is in `public/`.

### Portfolio build

The author's portfolio site shows the full art. `npm run build-portraits -- --lite` also builds a
much smaller model set (`public/pal-models-lite`: chibi only, 512px textures, compressed
meshes), and `npm run build:resume` writes `dist-resume/` with the art included. That build is
deployed from a private place and is not part of this repository.

## Importing your save

**In the browser (the usual way).** Open the app, choose **Choose save folder**, and pick
`%LOCALAPPDATA%PalSavedSaveGames`. Every world inside is listed by name; choose one. The
save is parsed in a Web Worker on your machine and kept in this browser's IndexedDB, so the next
visit opens straight to the Paldex. Nothing is uploaded. **Open a different save** in the footer
goes back to the import screen. Steam saves only for now; Xbox / Game Pass saves are not read yet.

**From the command line**, for development:

```bash
npm run import-save              # newest world in the default save folder
npm run import-save -- --list    # show worlds without importing
npm run import-save -- --world <id>
npm run import-save -- --save-dir "D:\path\to\<steamid>\<worldid>"
```

This writes `public/roster.json`, which the dev server loads when no browser import is stored.
Both paths run the same code (`src/save/importWorld.ts`) and produce the same roster.

**Your save is never modified.** The importer copies the files it needs to a temp folder
before parsing, so a mid-write file from a running game cannot be read halfway, and nothing
is ever written back. Close Palworld first anyway.

`public/roster.json` is gitignored. It contains your Steam ID and world ID, and it is
regenerated every time you play, so it does not belong in version control.

## Data

| File | Contents |
|---|---|
| `src/data/pals.json` | 289 pals — name, power, dex number, types, work suitabilities |
| `src/data/combos.json` | 41,617 parent pairs — an exhaustive matrix, not special cases |
| `src/data/meta.json` | 25 unbreedable species, 1 gender-dependent pairing |
| `src/data/passives.json` | 108 passive skills — names, effects, tiers, species locks |
| `src/data/skills.json` | 320 active skills — name, element, power, cooldown, keyed by the save's internal id |

`combos.json` covers every unordered pair of the 288 breedable-matrix species
(288 × 289 / 2 = 41,616, plus one extra entry for the gender-split Katress × Wixen), so
every breedable pal has a complete recipe and the breeding features need no external
lookups at runtime. Astralym (#204) is the 289th species and sits outside the matrix — it
has no recipe and is listed as unbreedable.

[docs/data-gaps.md](docs/data-gaps.md) tracks what is sourced and what is still missing —
notably base stats, mount speeds, element matchups, and the passive inheritance
probabilities. The passive planner deliberately does **not** quote success odds, because
those rates are not sourced; it answers "is this chain possible?" and ranks steps by how
diluted the parent pool is.

## Layout

```
src/save/      save-file parsing: binary reader, GVAS, container decode, roster assembly
src/lib/       breeding engine, passive planner, passive categorisation
src/routes/    the Showcase: Paldex, My Pals, Breeding and Planner (src/routes/showcase/)
src/design/    the Showcase's skins and styles, and the 3D model viewer
src/data/      extracted game data (JSON)
scripts/       one-off extraction and import pipelines
legacy/        the original single-file HTML tool this was built from
```

```bash
npm test        # unit tests for the save parser, breeding engine and data files
npm run build   # tsc -b && vite build
```

## Outside dependencies

Things this project needs that it doesn't control, apart from npm and NuGet packages.

**Type mappings (`.usmap`).** Reading the game's files needs a mappings file that lists the game's
types and field names. Only a dumper injected into the running game can make one, so neither the
local tools nor the website can make their own. As of 7 Oct 2026 there is one current source:

| | |
|---|---|
| Source | [PalworldModding/UsefulFiles](https://github.com/PalworldModding/UsefulFiles), `Mappings.usmap` (the file the [Palworld modding docs](https://pwmodding.wiki/) point to) |
| Kept up to date? | 1.0 and 1.0.3 the same day, 1.0.5 five days later. Patches that don't change the game's types (1.0.1, 1.0.2, 1.0.4) get no new file, and an older file can still work: the 1.0.3 file reads the 1.0.5 meshes |
| Second host | The same repo through jsDelivr (`cdn.jsdelivr.net/gh/PalworldModding/UsefulFiles@<commit>/Mappings.usmap`). Same source, so not independent |
| Others checked | [TheNaeem/Unreal-Mappings-Archive](https://github.com/TheNaeem/Unreal-Mappings-Archive) stops at 0.6.6; [elliotks/Palworld-FModel](https://github.com/elliotks/Palworld-FModel) is archived; Pocketpair publishes none |

How the website will use it (Phase 6, `docs/WEBSITE-PLAN.md`): fetch the latest file, check it by
decoding a table we know (an outdated file gives empty tables, not an error), fall back to older
versions from the repo's history, keep the working file with the art pack, and if nothing works,
ask the player for a file.

**Open risk.** If that repo stops updating or disappears, players with a cached file are fine, but
new players and new patches would depend on finding a file themselves. Whether to keep a copy of
our own (it holds type and field names, not art, but is derived from the game) is undecided, and
will be revisited later.

## Credits

Pal data is extracted from the legacy single-file index in `legacy/`, cross-checked against
[palworld.wiki.gg](https://palworld.wiki.gg) and [paldb.cc](https://paldb.cc), with op.gg
supplying the internal passive skill ids that no wiki publishes. Active skills come from
[PalCalc](https://github.com/tylercamp/palcalc) (MIT, © Tyler Camp), whose game-data
extraction is the only public source that pairs each skill with its internal id; `npm run
build-skills` pulls a pinned commit and spot-checks it against paldb's v1.0 values. Every element and work
suitability level in `pals.json` has been diffed against paldb's dex. `npm run
build-pal-extras` takes partner skills from paldb.cc (v1.0.5), food amounts from the wiki's
Cargo tables and the pal exp curve from [The Pal Professor](https://thepalprofessor.com/xp-tables/);
the curve is tested against every pal in an imported save. Portraits are
mirrored from a third-party host by `npm run fetch-images` and are not redistributed here.

Pal extraction uses [CUE4Parse](https://github.com/FabianFG/CUE4Parse) (Apache-2.0). The 3D view
is [`<model-viewer>`](https://modelviewer.dev) (Apache-2.0), and models are built with
[glTF-Transform](https://gltf-transform.dev) and [meshoptimizer](https://github.com/zeux/meshoptimizer)
(both MIT). Work-suitability and element icons are fetched from paldb.cc's mirror of the game's files.

## Disclaimer

This is an unofficial fan project. **Palworld and its characters, names, artwork and game data
belong to Pocketpair, Inc. This project is not affiliated with or endorsed by Pocketpair.**

This repository contains no game art, models or icons. `npm run build-portraits` reads a copy of
the game you own, locally, and writes only to gitignored folders on your machine; please do not
commit or redistribute what it makes, and follow Pocketpair's terms for the game. The
statistical data in `src/data/` (names, types, work levels, passives, breeding pairs) is
included for interoperability with the game and sourced as described under Credits.

## License

[MIT](LICENSE).

The license covers the code in this repository only. It does not cover Palworld's game data or
artwork, which belong to Pocketpair, Inc.
