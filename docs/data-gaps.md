# Data sourcing checklist

What the planned features need, what we already have, and what has to be sourced.
Audited against the repo on 2026-08-19 and re-audited 2026-08-24 against two external
sources — a saved paldb.cc dex page (site v1.0.3) and the palworld.wiki.gg Cargo
database. Every "have" below was verified by counting the actual files, not assumed.

## What we already have (verified)

| Dataset | Contents | Status |
|---|---|---|
| `src/data/pals.json` | 289 pals: id, name, power, num, variant, types[], img, work[{job,level}] | complete; 288 have artwork |
| `src/data/combos.json` | 41,617 parent pairs across all 288 breedable-matrix children | **exhaustive** — see note |
| `src/data/meta.json` | 25 unbreedable, 1 gender-dependent pairing | complete |
| `src/data/passives.json` | 108 ids — all named, all tiered, 22 with lock info | complete bar one id, see Tier 3 |
| `public/roster.json` | 1,361 pals; 218 of 289 species owned | live, re-run `npm run import-save` |

**combos.json is a complete matrix, not a table of special cases.** The 288 pals in the
rank ladder give 288×289/2 = 41,616 unordered pairs; the file holds 41,617, and every one
of the 264 breedable pals has a recipe. This is the single most important finding for
sequencing: **the breeding features need no new data at all.**

Astralym (#204) is the 289th species and sits outside that matrix — it has no recipe and
is listed in `meta.json`'s `unbreedable`, so nothing indexes into `combos.json` for it.
Every `combos[id]` lookup in `src/lib/` is already guarded against a missing key.

**Elements and work levels are externally confirmed.** All 288 matrix pals were diffed
against the paldb.cc dex by internal codename: zero element mismatches, zero work-level
mismatches. Work levels legitimately run 1–8 — the cap was raised by a patch, and
`src/data/work.ts` records 8.

---

## Tier 1 — Gap analysis (#2) and rooted breeding tree (#1)

- [x] Parent-pair → child matrix — `combos.json`, exhaustive
- [x] Unbreedable list — `meta.json`
- [x] Gender-dependent pairings — `meta.json` (only Katress/Wixen)
- [x] Owned species — `roster.json`, 218 of 289
- [x] **Work suitability code → display name** — `src/data/work.ts`, all 12 codes
      (`Cool, Elc, Frm, Gth, Hnd, Kdl, Lmb, Med, Min, Plt, Trn, Wtr`), asserted by
      `work.test.ts` so a dex refresh introducing a new code fails loudly.

**Nothing blocks these features.** Start here.

---

## Tier 2 — "Recommended" tags (best worker / fastest mount / strongest)

This is the tier that actually needs sourcing. `power` (range 10–3080) is a single
opaque number, not a stat line — it cannot answer "strongest" credibly.

**Most of this tier is one HTTP call away.** palworld.wiki.gg runs the Cargo extension
and exposes its tables publicly, no key and no pak extraction required:

```
https://palworld.wiki.gg/api.php?action=cargofields&table=PalStat        # schema
https://palworld.wiki.gg/index.php?title=Special:CargoExport&format=json&limit=500
    &tables=PalStat&fields=palName,palVariant,baseHp,baseAttack,baseDefense,rideSprintSpeed
```

`PalStat` alone carries `baseHp`, `baseAttack`, `baseDefense`, `baseWorkSpeed`, `stamina`,
`walkSpeed`, `runSpeed`, `rideSprintSpeed`, `transportSpeed`, `swimSpeed`, `captureRate`
and the trust/rank scaling factors. Sibling tables cover the rest: `PalPartnerSkill`,
`PalPartnerSkillScale`, `PalElement`, `PalBreeding`, `PalPassiveSkill`, `PalStat`,
`DropDefeat`, `DropInteract`. `Special:CargoTables` lists all 33. This supersedes the pak
extraction proposed at the bottom of this file for everything except internal ids.

- [ ] **Base stats per pal** — `HP`, `Attack` (melee + shot), `Defense`
      *Source:* `PalStat` (above). Keyed by `palName` + `palVariant`, which needs a join
      against our `num`/`variant` — the wiki has no dex-id column.
      *Acceptance:* all 289 pals have three integers; spot-check 5 against the in-game
      Paldeck stat bars.
- [ ] **Rideability + mount class** — is it rideable, and ground / air / water
      *Blocks:* "fastest land mount", "fastest air mount".
      *Acceptance:* every pal flagged; cross-check against the saddle tech tree.
- [ ] **Mount speeds** — `RideSprintSpeed` (and walk/run for completeness)
      *Source:* `PalStat.rideSprintSpeed` / `walkSpeed` / `runSpeed`.
      *Blocks:* the actual ranking. Without this the mount tags are guesses.
      *Acceptance:* Nitewing/Jetragon rank at the top for air; ordering is strictly by number.
- [ ] **Partner skill** — id, description, and required held item
      *Source:* `PalPartnerSkill` + `PalPartnerSkillScale`.
      *Blocks:* meaningful "best pal for X" beyond raw work level.
- [ ] **Element matchup table** — 9×9 effectiveness (types[] exists, matchups do not)
      *Blocks:* "best pal against X", damage estimates.
      *Acceptance:* 9 elements, each with strong/weak lists; verify fire→grass is strong.
- [x] **Work suitability max rank per pal** — the cap is **8**, not 5: `Handiwork`,
      `Gathering`, `Mining`, `Planting`, `Lumbering`, `Medicine Production`, `Watering`,
      `Kindling`, `Generating Electricity` and `Cooling` all reach 8 somewhere in the dex;
      `Transporting` peaks at 7 and `Farming` at 4. Every level confirmed against paldb.
      `MAX_WORK_LEVEL` in `src/data/work.ts` holds 8 and `work.test.ts` pins it to the
      dex maximum. Whether condenser/passive rank-ups are additive on top is still open.

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
- [x] **One tier scale** — done; all 108 ids are tiered and no dashed chip remains.
      The 13 `tier: null` ids were filled from paldb.cc's rank badges. paldb's scale is
      *identical* to the wiki's: across the 88 entries where both sources have a value
      they agree 1:1 (`1→1, 2→2, 3→3, diamond→4`, negatives unchanged), with exactly one
      disagreement — Runner, which the file had at 2 and both sources put at 3. The
      earlier note about op.gg's "+5..−3 scale that doesn't map" was the wrong read;
      op.gg's *index* was simply unreliable, its ranks were not a different scale.
      `passives.test.ts` now fails on any untiered id.
      Two corrections fell out of the same pass: **Runner** 2 → 3 and **Eternal Flame**
      `diamond` → 3.
- [x] **Four passives were missing entirely** — added with ids confirmed from paldb's
      implant-item names (`PalPassiveSkillChange_<id>`): `MutationPal_Mutant`
      (Idiosyncratic), `WorldTree_CraftSpeed` (Demon's Hand), `WorldTree_MoveSpeed`
      (Dimensional Leap), `WorldTree_ATK_DEF` (God of Destruction). The three World Tree
      passives sit at paldb rank 5, a step above `diamond`; they are stored as `diamond`
      because the app's tier scale has no rank-5 bucket and `tierClass` would render a
      numeric 5 as tier-3 anyway.
- [x] **Three name/effect errors** — `CraftSpeed_up3` was "Remarkable Craft**m**anship";
      `Nocturnal` is named **Insomnia** in 1.0; `MutationPal_Immortal` (Immortality) had
      Vampiric's effect text pasted into it and is really life-steal + regen +100% +
      attack +15%.
- [ ] **Savior has no published internal id** — the only passive still absent. It is a
      Hartalis raid-boss exclusive (same family as Invader/Xenolord, Siren of the
      Void/Bellanoir Libero, Eternal Flame/Blazamut Ryu), rank 4, "+30% Neutral and +30%
      Grass attack damage". Raid passives have no implant item, which is exactly where
      paldb leaks the id, so it cannot be scraped the way the other four were. It will
      render as a raw id for anyone who owns one. The pak extract below is the fix.
- [x] **The 15 unverified passive ids** — all resolved via **op.gg**, which keys its
      passive database by internal id in the URL (`/palworld/skills/passive/<id>`).
      No wiki publishes those ids; op.gg does. All 94 passives in the save now
      carry a name and effect text. Every one of those ids was later re-confirmed
      against paldb independently — 23 of 23 checkable ids agreed exactly.
- [x] **Three shipped mappings were wrong** — found while verifying the above.
      `_1`/`_2` is inverted for three families, where `_1` is the *stronger* effect:
      `Stamina_Up_1` = Infinite Stamina (+50%), not Fit as a Fiddle;
      `CoolTimeReduction_Up_1` = Serenity (−30%), not Impatient;
      `SalePrice_Up_1` = Noble (+5%), not Fine Furs.
      Every other ladder is ascending and was re-confirmed against op.gg.
- [x] Passive tiers/effects — `passives.json`, all 108 ids
- [x] Species-locked passives — 22 entries carry `lock` (Legend, Siren of the Void, …)

---

## Tier 4 — Completeness and polish

- [x] **Pal portraits** — fetched; 288 files in `public/pals/`, one per matrix pal.
      Astralym is the exception: its `remoteImg` points at a v1.0.0 snapshot that
      predates the species, so `npm run fetch-images` cannot pull it and its card falls
      back to initials.
- [x] **Astralym (#204)** — was missing from `pals.json`; added. paldb gives it no
      elements and no work suitabilities, so it carries `types: []` and `work: []`.
      `Gaps.tsx` maps over `types`, so an empty list simply renders nothing.
- [x] **The 2 unmapped save ids are not missing pals** — `YakushimaMonster001` is
      **Green Slime** and `YakushimaBoss001_Small` is **Demon Eye**, two of eleven
      Terraria-collab creatures (six Slimes, Enchanted Sword, Cave Bat, Illuminant Bat,
      Eye of Cthulhu, Demon Eye). paldb lists them with no dex number — they are outside
      the Paldeck by design, not a gap. Excluding them is correct; the importer reporting
      them as unmapped is the only rough edge.
      The other 20 unmapped ids in the save are captured humans and NPC merchants.
- [ ] **Element icons** for the 9 types

---

## Two quirks of the `power` field

Nothing reads `power` today — it is declared in `src/types.ts` and never used — but it is
a breeding-rank proxy, descending (Chikipi 3080 is the weakest, Panthalus 20 the
strongest), and anything that starts treating it as a dense rank will break on these:

- **The ladder has 20 empty slots.** Consecutive values step by 10 everywhere except four
  gaps of 60 — before Sweepa, Fenglope Lux, Sibelyx Primo and Eidrolon. 3080 down to 20
  in steps of 10 would be 307 slots; 287 distinct values are used. The missing 20 are
  presumably humans or non-dex entries in whatever table the legacy tool derived this
  from. It is *not* 20 missing pals — the dex is complete and externally verified.
- **One value is shared.** Gumoss and Gumoss (Special) are both 2950, the only tie.

Astralym was assigned `power: 10`, continuing the ladder below Panthalus. That number is
invented, not sourced — it has no real breeding rank because it cannot be bred.

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

**This is now the fallback, not the first move.** The wiki's Cargo API (see Tier 2)
covers base stats, mount speeds, partner skills, elements and drops with a single HTTP
call and no 38.6 GB extraction. The pak is only genuinely required for **internal ids** —
concretely, Savior's — since no site publishes an id for a passive that has no implant
item. Worth a timeboxed spike for that one table if Savior matters; otherwise skip it.
DataTable extraction on Palworld is still unproven in this repo.

---

## Suggested order

1. ~~Work suitability names~~ — done
2. **Build gap analysis (#2)** — needs no sourcing at all
3. Pull `PalStat` + `PalPartnerSkill` from the wiki's Cargo API — closes most of Tier 2
   in one scripted pass, and belongs in a repeatable `scripts/fetch-wiki-data.mjs`
   alongside the existing `extract-data.mjs`
4. Passive inheritance mechanics — the one item no dump provides
5. Passive planner (#3)
