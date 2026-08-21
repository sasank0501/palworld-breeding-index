# Palworld Breeding Index

A breeding planner for Palworld v0.1 that works against **your actual Pal Box**, read
straight out of your local save file.

Three tools, each a tab in the app:

- **Pal Box** — everything you own, searchable by name, nickname or passive.
- **Breeding gaps** — of the 288 species, which ones you can breed right now from pals you
  already have, and which are out of reach.
- **Passive planner** — pick a species and a passive set, get a concrete breeding chain that
  lands them together.

## Setup

```bash
npm install
npm run fetch-images   # 288 portraits; without this, cards fall back to initials
npm run dev
```

Requires **Node 22.6 or newer**. `scripts/import-save.ts` runs as TypeScript directly via
Node's native type stripping; on older versions it fails rather than degrading.

## Importing your save

```bash
npm run import-save              # newest world in the default save folder
npm run import-save -- --list    # show worlds without importing
npm run import-save -- --world <id>
npm run import-save -- --save-dir "D:\path\to\<steamid>\<worldid>"
```

This writes `public/roster.json`, which the app loads on startup. Without it the app shows a
"no roster imported yet" screen rather than an error — a fresh clone is expected to have no
roster.

**Your save is never modified.** The importer copies the files it needs to a temp folder
before parsing, so a mid-write file from a running game cannot be read halfway, and nothing
is ever written back. Close Palworld first anyway.

`public/roster.json` is gitignored. It contains your Steam ID and world ID, and it is
regenerated every time you play, so it does not belong in version control.

## Data

| File | Contents |
|---|---|
| `src/data/pals.json` | 288 pals — name, power, dex number, types, work suitabilities |
| `src/data/combos.json` | 41,617 parent pairs — an exhaustive matrix, not special cases |
| `src/data/meta.json` | 24 unbreedable species, 1 gender-dependent pairing |
| `src/data/passives.json` | 104 passive skills — names, effects, tiers, species locks |

`combos.json` covers every unordered pair of the 288 species (288 × 289 / 2 = 41,616, plus
one extra entry), so every breedable pal has a complete recipe and the breeding features need
no external lookups at runtime.

[docs/data-gaps.md](docs/data-gaps.md) tracks what is sourced and what is still missing —
notably base stats, mount speeds, element matchups, and the passive inheritance
probabilities. The passive planner deliberately does **not** quote success odds, because
those rates are not sourced; it answers "is this chain possible?" and ranks steps by how
diluted the parent pool is.

## Layout

```
src/save/      save-file parsing: binary reader, GVAS, container decode, roster assembly
src/lib/       breeding engine, passive planner, passive categorisation
src/routes/    the three tabs
src/data/      extracted game data (JSON)
scripts/       one-off extraction and import pipelines
legacy/        the original single-file HTML tool this was built from
```

```bash
npm test        # 53 tests
npm run build   # tsc -b && vite build
```

## Credits

Pal data is extracted from the legacy single-file index in `legacy/`, cross-checked against
[palworld.wiki.gg](https://palworld.wiki.gg) and op.gg for passive skill ids. Portraits are
mirrored from a third-party host by `npm run fetch-images` and are not redistributed here.

## License

[MIT](LICENSE).

The license covers the code in this repository. It does not cover Palworld game data or
artwork, which belong to Pocketpair, Inc. — the portraits are fetched at build time rather
than redistributed here, and the extracted data is included for interoperability.
