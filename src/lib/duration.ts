/** A length of time for people: "42 s", "3 min 05 s", "1 h 02 min". */
export function formatDuration(totalSeconds: number): string {
  const t = Math.max(0, Math.round(totalSeconds));
  if (t < 60) return `${t} s`;
  const s = String(t % 60).padStart(2, '0');
  const m = Math.floor(t / 60);
  if (m < 60) return `${m} min ${s} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
