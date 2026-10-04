# UX brief — 2026-10-01

A message-first pass over each screen: what it is for, who reads it, what that implies for the
design, a brief to paste into an AI UI tool, and a review of what is on screen today. The review
used screenshots of the real 1,990-pal roster at 1440×900 (dark and light) and 390×844.

## Who uses this

| | The player (Sasank) | The resume viewer |
|---|---|---|
| Knows | Palworld well: passives, IVs, ranks, breeding pairs | Probably nothing about Palworld |
| Lands on | Their own save, right after closing the game | The demo save, from a link |
| Device | Desktop, wide screen | Desktop or a phone, often a phone |
| Time | Minutes, with a goal ("what do I breed next?") | 30–60 seconds |
| Needs | Answers fast across ~2,000 pals | To see what this is and that it is hard to build |

Both matter. The deployed copy will be seen far more by the second group, and every screen
currently assumes the first.

**App north star:** *Open it after a session and know, within seconds, what your box can do and
what to breed next.*

---

## 1. Pal Box

**North star:** *Everything you own is here, and the best of it is easy to spot.*

- **Purpose:** help explore (browse, find, compare).
- **Most important thing:** the strong pals: high IVs, good passives, rarity.
- **Principles:** card grid with progressive disclosure (detail on click), strong scan targets
  (portrait, frame colour, level), filters that stay out of the way until needed.

**AI brief**
> A searchable grid of a player's ~2,000 Palworld pals, for a player who knows the game and wants
> to find their strongest pals quickly. Feel: a collectible card binder, satisfying and dense
> without being noisy. Components: trading cards (rarity frame, name, level, portrait, element,
> IV bars, passives), a search box, location/passive/sort filters, a size preset. Constraints:
> light and dark themes, virtualised, usable at 390px.

**Review**

| What works | Friction |
|---|---|
| Portraits and rarity frames carry the hierarchy; the grid reads as a collection at once. | Nine controls of equal weight sit above the grid. On a phone they push the first card to ~470px down, so the screen opens on filters, not pals. |
| Nicknamed pals first matches how players mark favourites. | Long names truncate on Default with a pill (“Tetroise Pri…”). |
| Light theme holds up; frames keep their colour. | Passives are hover-only. On touch they are one tap away rather than scannable. That is the agreed design, but it costs more on mobile. |
| | The demo note is grey text with a CLI command, which tells a viewer nothing about what they're looking at. |

**Suggestions:** collapse the filters behind a single “Filters” button below ~700px; give the demo
save a one-line intro (“A real Palworld save, read straight from the game's binary format”);
wrap long names to two lines rather than truncating.

---

## 2. Pal detail

**North star:** *Everything about this one pal, with its strengths obvious.*

- **Purpose:** reassure and inform (is this pal worth keeping or breeding?).
- **Most important thing:** IV grades and passives.
- **Principles:** clear sections, consistent typography, colour used only for meaning (rank, element).

**Review**

| What works | Friction |
|---|---|
| S grades and IV bars answer “is this good?” instantly. | The portrait box is empty while the 3D model downloads, because `<model-viewer>` has no `poster` ([PalModel.tsx:134](../src/design/PalModel.tsx#L134)). The biggest element on the page starts blank. |
| Passive cards coloured by rank, with plain-language effects. | The frame is pink here but blue on the same pal's card. The handoff leaves this open; matching the card keeps the frame meaning “rarity” everywhere. |
| | No previous/next, and Back is the only way out (the handoff already lists this). |

**Suggestions:** set the chibi still as `poster`; match the frame to the card's rarity colour.

---

## 3. Breeding gaps

**North star:** *Here's what you can breed right now that you don't have yet.*

- **Purpose:** guide toward the next action.
- **Most important thing:** the count and list of species one step away.
- **Principles:** one dominant number, clear next step, secondary stats demoted.

**AI brief**
> A breeding progress screen for a Palworld player. Lead with how many new species they can breed
> right now, then list each with its parent pair. Feel: progress and momentum, like a checklist
> with achievable items. Components: a headline stat, secondary stats, step filters, recipe rows
> with an expandable multi-step route. Constraints: light and dark, 390px.

**Review**

| What works | Friction |
|---|---|
| Rows are clear: portrait, name, types, then the parent pair. | Six tiles have equal weight, so “28 one step away”, the actionable number, competes with “25 unbreedable”, a fact about the game rather than the player. |
| Grouping by steps is the right primary structure. | “0 Unreachable” is still drawn in alarm red. |
| | It's a dead end: no link from a target to plan its passives, or from a parent to that pal in your box. |

**Suggestions:** one headline (“28 new species you can breed now”) with the rest smaller; grey
out zero-value tiles; add “Plan passives →” on each row that opens the planner with the target set.

---

## 4. Passive planner

**North star:** *Pick a pal and the passives you want, and get the exact chain to breed.*

- **Purpose:** guide step by step to a result.
- **Most important thing:** the plan, and which pals to pull from where.
- **Principles:** numbered steps (already there), one clear call to action, results that read as
  instructions.

**AI brief**
> A three-step breeding planner for Palworld: choose a target species, choose up to 4 passives
> (grouped by rank, showing how many of the player's pals carry each), then get a numbered
> breeding chain naming the exact pals to use and where they're stored. Feel: a confident guide
> for a long, random process; honest about odds. Components: species combobox, preset pills, a
> passive chip picker, a primary solve button, step cards. Constraints: light and dark, 390px,
> keyboard use.

**Review**

| What works | Friction |
|---|---|
| 1 · 2 · 3 numbering and the empty state (“Pick a target species to start”) guide well. | The picker opens on Rank 5, three passives nobody owns, drawn dark and disabled. The first thing you see is what you can't pick. |
| Carrier counts on chips (Swift 96, Lucky 23) are useful when choosing. | A pal's storage location (Base, Palbox, Dimension) is a tiny caption under the portrait, though “go and get this pal” is the first real-world action. |
| The scarce-carrier warning is good. | “want 1 of 2 in pool” and “1 extra passive(s) in the pools” are jargon to anyone but you. |
| | On a phone the picker is a scroll area inside the scrolling page. |

**Suggestions:** list owned passives first and fold unowned ones into a “Not in your box (n)”
row; make location a visible badge on each parent card; rephrase pool size as odds (“1 in 2
chance per egg” or similar, if the maths supports it).

---

## Across the app

- **No URLs.** Tabs and the detail page aren't addressable, so a resume link can't point at the
  planner with a good example loaded. Of everything on this list, this does most for the
  resume viewer.
- **Phone nav:** at 390px the tabs wrap and the theme toggle is pushed out of view.
- **Header jargon:** “world 7AC31612” means nothing to a viewer; “Demo save · 1,990 pals” is enough.
- **First run:** there's no screen that says what the app is. A short intro on the demo,
  dismissible and remembered, would cover it.

## Suggested order

1. `poster` on the 3D viewer (small, removes a blank first impression).
2. Gaps headline tile and a “Plan passives →” link.
3. Owned-first passive picker.
4. URLs for tabs and detail, plus a demo intro line.
5. Mobile: collapsible filters, nav fix.
