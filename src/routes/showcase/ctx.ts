import { useMemo } from 'react';

import { ivTotal } from '../../components/PalCards.tsx';
import { solveReach, summariseOwned, type Combos, type OwnedSpecies, type Reach } from '../../lib/breeding.ts';
import type { Roster, RosterPal } from '../../types.ts';
import { useWorldData } from '../../userdata/useWorldData.ts';
import { DEX, META, useCombos } from './shared.tsx';

const ALL_IDS = Object.keys(DEX);

/** What every Showcase section needs, worked out once. */
export interface Ctx {
  roster: Roster;
  /** palId -> your pals of that species, best potential first. */
  byPal: Map<string, RosterPal[]>;
  owned: OwnedSpecies[];
  /** palId -> which sexes you own of it, for pairing checks. */
  have: Map<string, OwnedSpecies>;
  /** Null until combos.json (~700 KB, loaded lazily) has arrived. */
  combos: Combos | null;
  reach: Reach | null;
  /** The player's favourites, notes and plans for this world (null while loading). */
  user: ReturnType<typeof useWorldData>;
}

export function useCtx(roster: Roster): Ctx {
  const combos = useCombos();

  const byPal = useMemo(() => {
    const m = new Map<string, RosterPal[]>();
    for (const p of roster.pals) {
      if (!p.palId) continue;
      const list = m.get(p.palId);
      if (list) list.push(p);
      else m.set(p.palId, [p]);
    }
    for (const list of m.values()) list.sort((a, b) => ivTotal(b) - ivTotal(a) || b.level - a.level);
    return m;
  }, [roster]);

  const owned = useMemo(() => summariseOwned(roster.pals), [roster]);
  const have = useMemo(() => new Map(owned.map((o) => [o.palId, o])), [owned]);

  const reach = useMemo(
    () => (combos ? solveReach({ owned, combos, allIds: ALL_IDS, unbreedable: META.unbreedable }) : null),
    [combos, owned],
  );

  const user = useWorldData(roster.world);

  return { roster, byPal, owned, have, combos, reach, user };
}

export type Status = 'owned' | 'ready' | 'far' | 'lost' | 'unknown';

/** Where a species stands for this roster. `unknown` until the breeding matrix loads. */
export function statusOf(ctx: Ctx, id: string): { status: Status; depth: number } {
  if (ctx.byPal.has(id)) return { status: 'owned', depth: 0 };
  if (!ctx.reach) return { status: 'unknown', depth: -1 };
  const depth = ctx.reach.depth.get(id);
  if (depth === undefined) return { status: 'lost', depth: -1 };
  return { status: depth === 1 ? 'ready' : 'far', depth };
}
