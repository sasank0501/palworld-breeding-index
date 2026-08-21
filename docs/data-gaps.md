# Data sourcing checklist

What the planned features need, what we already have, and what has to be sourced.
Audited against the repo on 2026-08-19 — every "have" below was verified by counting
the actual files, not assumed.

## What we already have (verified)

| Dataset | Contents | Status |
|---|---|---|
| `src/data/pals.json` | 288 pals: id, name, power, num, variant, types[], img, work[{job,level}] | complete, all 288 have artwork |
| `src/data/combos.json` | 41,617 parent pairs across all 288 children | **exhaustive** — see note |
| `src/data/meta.json` | 24 unbreedable, 1 gender-dependent pairing | complete |
| `src/data/passives.json` | 104 ids — 89 named, 15 unverified, 22 with lock info | partial |
| `public/roster.json` | 1,361 pals; 218 of 288 species owned | live, re-run `npm run import-save` |

**combos.json is a complete matrix, not a table of special cases.** 288 pals as parents
gives 288×289/2 = 41,616 unordered pairs; the file holds 41,617, and every one of the
264 breedable pals has a recipe. This is the single most important finding for
sequencing: **the breeding features need no new data at all.**

---

## Tier 1 — Gap analysis (#2) and rooted breeding tree (#1)

- [x] Parent-pair → child matrix — `combos.json`, exhaustive
- [x] Unbreedable list — `meta.json`
- [x] Gender-dependent pairings — `meta.json` (only Katress/Wixen)
- [x] Owned species — `roster.json`, 218 of 288
- [ ] **Work suitability code → display name** (12 codes, no lookup exists yet)
      `Cool, Elc, Frm, Gth, Hnd, Kdl, Lmb, Med, Min, Plt, Trn, Wtr`
      Low risk, no external source needed — these are the 12 canonical suitabilities.
      *Acceptance:* every code in `pals.json` resolves; no code renders as an abbreviation.

**Nothing blocks these features.** Start here.

---

## Tier 2 — "Recommended" tags (best worker / fastest mount / strongest)

This is the tier that actually needs sourcing. `power` (range 20–3080) is a single
opaque number, not a stat line — it cannot answer "strongest" credibly.

- [ ] **Base stats per pal** — `HP`, `Attack` (melee + shot), `Defense`
      *Blocks:* "powerful pals", any damage math, IV-to-actual-stat conversion.
      *Acceptance:* all 288 pals have three integers; spot-check 5 against the in-game
      Paldeck stat bars.
- [ ] **Rideability + mount class** — is it rideable, and ground / air / water
      *Blocks:* "fastest land mount", "fastest air mount".
      *Acceptance:* every pal flagged; cross-check against the saddle tech tree.
- [ ] **Mount speeds** — `RideSprintSpeed` (and walk/run for completeness)
      *Blocks:* the actual ranking. Without this the mount tags are guesses.
      *Acceptance:* Nitewing/Jetragon rank at the top for air; ordering is strictly by number.
- [ ] **Partner skill** — id, description, and required held item
      *Blocks:* meaningful "best pal for X" beyond raw work level.
- [ ] **Element matchup table** — 9×9 effectiveness (types[] exists, matchups do not)
      *Blocks:* "best pal against X", damage estimates.
      *Acceptance:* 9 elements, each with strong/weak lists; verify fire→grass is strong.
- [ ] **Work suitability max rank per pal** — already have levels; confirm the cap is 5
      and that condenser/passive rank-ups are additive.

---

## Tier 3 — Passive transfer planner (#3)

- [ ] **Passive inheritance mechanics** — *the blocker for this whole feature*
      Needed: how many passives a child draws from the combined parent pool, the
      probability of each count, and the chance of rolling entirely new passives.
      *Why it matters:* inheritance is probabilistic. Without real numbers the planner
      can only lie. It must output `P(success)` and expected egg count, never "this
      chain carries the passive over".
      *Acceptance:* probabilities sum to 1; a 4-passive target from two 4-passive
      parents yields a sane, non-zero expectation. Cross-check against at least two
      independent sources — these rates have changed across patches.
- [x] **The 15 unverified passive ids** — all resolved via **op.gg**, which keys its
      passive database by internal id in the URL (`/palworld/skills/passive/<id>`).
      No wiki publishes those ids; op.gg does. All 94 passives in the save now
      carry a name and effect text.
- [x] **Three shipped mappings were wrong** — found while verifying the above.
      `_1`/`_2` is inverted for three families, where `_1` is the *stronger* effect:
      `Stamina_Up_1` = Infinite Stamina (+50%), not Fit as a Fiddle;
      `CoolTimeReduction_Up_1` = Serenity (−30%), not Impatient;
      `SalePrice_Up_1` = Noble (+5%), not Fine Furs.
      Every other ladder is ascending and was re-confirmed against op.gg.
- [ ] **One tier scale** — 91 ids carry the wiki's `diamond`/3/2/1 tier; the 13
      op.gg-only ids are named but `tier: null` and render as dashed grey chips.
      op.gg uses a +5..−3 rank scale that doesn't map onto the wiki's, and two bulk
      reads of its index returned *contradictory* ranks for the same ids — so names
      (which agreed) were taken and ranks were not. Single-item op.gg pages were
      reliable, so the remaining fix is ~13 individual lookups, or the pak extract.
      *Acceptance:* every id tiered on one scale; no dashed chips left.
- [x] Passive tiers/effects for the 89 known ids — `passives.json`
- [x] Species-locked passives — 22 entries carry `lock` (Legend, Siren of the Void, …)

---

## Tier 4 — Completeness and polish

- [ ] **Pal portraits** — `public/pals/` is empty; cards fall back to initials
      Fix: `npm run fetch-images` (288 files from a third-party host, gentle concurrency)
- [ ] **2 missing species** — `YakushimaBoss001_Small`, `YakushimaMonster001`
      Post-dates the v1.0 dex snapshot; 8 pals in your save show as raw ids.
      The other 12 unmapped ids are captured humans and are correctly excluded.
- [ ] **Element icons** for the 9 types

---

## Recommended source: extract from the game files

`D:\SteamLibrary\steamapps\common\Palworld\Pal\Content\Paks\Pal-Windows.pak` (38.6 GB)
is on disk and **closes almost every Tier 2 and Tier 3 gap at once**, at the exact
version you are playing — which matters, because the wikis are already behind your save.

Targets inside the pak:

| Path | Gives us |
|---|---|
| `Pal/Content/Pal/DataTable/Character/DT_PalMonsterParameter` | base stats, work suitabilities, ride speeds, mount class, element types |
| `Pal/Content/Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main` | **internal passive ids** — the exact thing no wiki publishes |
| `Pal/Content/L10N/en/Pal/DataTable/Text/*` | display names and descriptions for both |

Tooling: FModel (GUI) or CUE4Parse / repak (scriptable). UE 5.1, no AES key required.
A scripted extraction is preferable to FModel — it becomes a repeatable
`scripts/extract-game-data.mjs` that can be re-run after each patch, matching the
existing `extract-data.mjs` convention.

**Caveat before committing to this:** the pak is 38.6 GB and DataTable extraction on
Palworld specifically is unproven in this repo. Worth a timeboxed spike — extract one
table and confirm the rows parse — before planning around it. Wikis remain the fallback
for Tier 2; only the internal passive ids genuinely require the game files.

---

## Suggested order

1. Work suitability names (Tier 1) — unblocks nothing else, but trivial and visible
2. **Build gap analysis (#2)** — needs no sourcing at all
3. Timeboxed pak-extraction spike — if it works, Tier 2 + Tier 3 ids fall out together
4. Passive inheritance mechanics — the one item that cannot come from the pak alone
5. Passive planner (#3)
