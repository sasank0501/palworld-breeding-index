import { useEffect, useRef } from 'react';

import { openOverlay } from './route.ts';

/**
 * While `open`, the browser's Back closes this overlay instead of leaving the page (src/lib/route.ts).
 * `close` is what the overlay's own Close does; it is read fresh, so it may change between renders.
 */
export function useOverlayBack(open: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    return openOverlay(() => latest.current());
  }, [open]);
}
