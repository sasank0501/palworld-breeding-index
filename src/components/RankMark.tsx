import type { Rank } from '../lib/passiveCategories.ts';

/**
 * The chevron stack from the in-game passive tag, which is also what paldb puts
 * on the right of every plate: one chevron per rank up to three, a "+" for rank
 * 4 and two for the rank-5 World Tree implants, and chevrons pointing down for
 * debuffs.
 *
 * The rank is the same signal as the chip colour, deliberately — in the game the
 * arrows are what you actually read at a glance, and colour alone would leave
 * rank 4 and 5 (both mint on paldb) indistinguishable, on top of failing anyone
 * who cannot separate the gold from the mint.
 */
export function RankMark({ rank }: { rank: Rank | null }) {
  if (rank === null) return null; // unverified rank — no claim

  const down = rank < 0;
  const count = Math.min(3, Math.abs(rank));
  const pluses = rank === 5 ? 2 : rank === 4 ? 1 : 0;

  // Stacked bottom-up so a shorter stack sits where the game puts it.
  const rows = Array.from({ length: count }, (_, i) => (down ? 3.2 + i * 3.3 : 10.4 - i * 3.3));
  // Widened per "+" so the marks never squash; CSS pins the height and lets the
  // width follow, which keeps rank 5 wider than rank 4 rather than smaller.
  const width = 14 + pluses * 6;

  return (
    <svg
      className="rank-mark"
      viewBox={`0 0 ${width} 14`}
      width={width}
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {rows.map((y) => (
        <path key={y} d={down ? `M2 ${y} L7 ${y + 3} L12 ${y}` : `M2 ${y} L7 ${y - 3} L12 ${y}`} />
      ))}
      {Array.from({ length: pluses }, (_, i) => 16.5 + i * 6).map((x) => (
        <g key={x}>
          <path d={`M${x} 5 L${x} 9`} />
          <path d={`M${x - 2} 7 L${x + 2} 7`} />
        </g>
      ))}
    </svg>
  );
}
