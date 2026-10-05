import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { scheduleBackupFile } from './backup.ts';
import type { WorldData } from './schema.ts';
import { WorldStore, type SaveStatus } from './store.ts';

/**
 * The player's data for one world, for React: the current document, its save
 * status, and `edit` taking a function from edit.ts:
 *
 *   const { data, edit } = useWorldData(roster.world);
 *   edit((d) => toggleFavourite(d, pal.instanceId));
 *
 * `data` is null until the stored copy has loaded (a few milliseconds).
 */
export function useWorldData(world: string): {
  data: WorldData | null;
  status: SaveStatus;
  edit: (change: (d: WorldData) => WorldData) => void;
} {
  const [store, setStore] = useState<WorldStore | null>(null);

  useEffect(() => {
    let live = true;
    let opened: WorldStore | null = null;
    void WorldStore.open(world).then((s) => {
      if (!live) return void s.close();
      s.onSaved = () => scheduleBackupFile();
      opened = s;
      setStore(s);
    });
    return () => {
      live = false;
      void opened?.close();
      setStore(null);
    };
  }, [world]);

  const subscribe = useCallback((fn: () => void) => store?.subscribe(fn) ?? (() => {}), [store]);
  const data = useSyncExternalStore(subscribe, () => store?.data ?? null);
  const status = useSyncExternalStore(subscribe, () => store?.status ?? 'saved');
  const edit = useCallback((change: (d: WorldData) => WorldData) => store?.update(change), [store]);
  return { data, status, edit };
}
