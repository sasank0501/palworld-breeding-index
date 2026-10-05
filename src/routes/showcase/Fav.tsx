import '../../design/userdata.css';

/**
 * The favourite star, on pal cards and the pal sheet. A real toggle button
 * (aria-pressed), 44 px to tap. Just the star: outline when off, solid in the
 * theme's accent when on (userdata.css). Gold was the first idea, but gold on a
 * white card is too faint (1.4:1) to show the state; WCAG asks 3:1.
 */
export function FavStar({
  on,
  name,
  onToggle,
  className = '',
  style,
}: {
  on: boolean;
  name: string;
  onToggle: () => void;
  className?: string;
  /** On a card: the card's stagger, so the star arrives with it. */
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={`sc-fav${on ? ' on' : ''} ${className}`}
      style={style}
      aria-pressed={on}
      aria-label={`Favourite ${name}`}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
