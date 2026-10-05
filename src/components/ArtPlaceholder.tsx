/**
 * What stands in for a pal before any game art is in this browser: the Paldex
 * egg, tinted by the pal's element. Our own drawing, so the public site shows it
 * without hosting anything of Pocketpair's. It is only ever a loading state: the
 * 3D is required (docs/WEBSITE-PLAN.md), and the app asks for the art until it
 * has it. Decorative, so hidden from screen readers; the name beside it speaks.
 */
export function ArtPlaceholder({ element }: { element?: string }) {
  return (
    <span className={`art-egg${element ? ` e-${element}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <path className="egg-shell" d="M20 3C12 3 6.500 15 6.500 24.500 6.500 32 12.500 37 20 37s13.500-5 13.500-12.500C33.500 15 28 3 20 3z" />
        <path className="egg-band" d="M7.200 21.500l4.300 3.200 4.300-3.400 4.200 3.400 4.300-3.400 4.300 3.400 4.200-3.200" />
        <circle className="egg-spot" cx="15" cy="12.500" r="2.300" />
        <circle className="egg-spot" cx="24.500" cy="9.500" r="1.600" />
        <circle className="egg-spot" cx="25" cy="31" r="2.100" />
        <circle className="egg-spot" cx="14" cy="30.500" r="1.400" />
      </svg>
    </span>
  );
}
