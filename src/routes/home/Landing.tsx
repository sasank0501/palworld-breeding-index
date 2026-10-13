import { useEffect, useState } from 'react';

import { SKINS, type Skin } from '../showcase/skins.ts';
import { PalEgg } from '../showcase/parts.tsx';
import { Tour } from './Tour.tsx';
import { UploadDialog } from './UploadDialog.tsx';
import '../../design/home.css';

/**
 * The first screen of the public site, for a visitor with no save in this browser:
 * what PalDoc is and two ways in, then a scroll-driven tour of its five pages
 * (Tour.tsx), then the two again. "Upload save" opens the steps for choosing a save
 * folder (UploadDialog.tsx; the import itself is Import.tsx's). "Browse the Paldex" opens
 * the app with no save: every species as a silhouette, to plan breeding by hand.
 *
 * A phone has no Palworld save on it (the game's saves live on the PC or console it is
 * played on), so there "Browse the Paldex" is the way in and uploading is replaced by
 * a pointer to the computer.
 */
const PHONE = '(max-width: 640px) and (pointer: coarse)';

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const m = matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export function Landing({ skin, onSkin, onChoose, onBrowse }: { skin: Skin; onSkin: (s: Skin) => void; onChoose: () => void; onBrowse: () => void }) {
  const [asking, setAsking] = useState(false);
  const open = () => setAsking(true);
  const dark = skin === 'obsidian' || skin === 'feybreak';
  const phone = usePhone();

  const actions = phone ? (
    <>
      <button type="button" className="sc-btn home-big" onClick={onBrowse}>
        Browse the Paldex
      </button>
      <p className="home-promise">Palworld saves live on the computer you play on. To read your own, open PalDoc there.</p>
    </>
  ) : (
    <div className="home-actions">
      <button type="button" className="sc-btn home-big" onClick={open}>
        <UploadIcon />
        Upload save
      </button>
      <button type="button" className="sc-btn ghost home-big" onClick={onBrowse}>
        Browse the Paldex
      </button>
    </div>
  );

  return (
    <div className="sc-shell home" data-skin={skin}>
      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <header className="home-bar">
            <span className="home-brand">
              <PalEgg size={36} />
              PalDoc
            </span>
            <ThemePicker skin={skin} onSkin={onSkin} />
          </header>
          <div className="home-hero-body">
            <p className="home-mono">For Palworld 1.0 · Steam, Xbox in beta</p>
            <h1 id="home-title">
              Your Pal Box, and what to <em>breed</em> next
            </h1>
            <p className="home-lede">
              Upload your Palworld save and PalDoc shows every pal you own, what you can breed today, and the parents that get you
              the passives you want.
            </p>
            {actions}
            <p className="home-promise">Free, no account. Your save is read in your browser and never leaves your computer.</p>
          </div>
          <p className="home-mono home-cue" aria-hidden="true">
            Scroll for the tour ↓
          </p>
        </section>

        <Tour dark={dark} />

        <section className="home-closing" aria-labelledby="home-closing-title">
          <h2 id="home-closing-title">
            Now try it with <em>your</em> pals
          </h2>
          <p className="home-lede">
            {phone
              ? 'Look through every species and the pairs that breed them, right here.'
              : 'Close Palworld, choose your save folder, pick a world. It takes about a minute. No save to hand? Browse every species and plan by hand.'}
          </p>
          {actions}
          <p className="home-promise">
            Pals show as silhouettes on this page. Add your own copy of Palworld inside the app and they appear in full colour and 3D.
          </p>
        </section>
      </main>

      <footer className="home-foot">
        Unofficial fan project. Palworld and its characters, names and artwork are © Pocketpair, Inc.; not affiliated with or endorsed
        by Pocketpair. Typefaces are served from this site under the{' '}
        <a href={`${import.meta.env.BASE_URL}font-licenses.txt`}>SIL Open Font License</a>. Found a problem?{' '}
        <a href="https://github.com/sasank0501/palworld-breeding-index/issues">Report it on GitHub</a>.
      </footer>

      <UploadDialog open={asking} onClose={() => setAsking(false)} onChoose={onChoose} />
    </div>
  );
}

/**
 * The four themes, on the first screen: until one is picked the page follows the system's light or
 * dark setting, and a pick sticks (the same stored choice as the settings panel inside the app).
 * Radios in a group, so the arrow keys move between them; names show beside the swatches on wide
 * screens and are spoken always.
 */
function ThemePicker({ skin, onSkin }: { skin: Skin; onSkin: (s: Skin) => void }) {
  return (
    <fieldset className="home-themes">
      <legend className="sr-only">Theme</legend>
      {SKINS.map((s) => (
        <label key={s.id} className={skin === s.id ? 'on' : ''} title={s.blurb}>
          <input type="radio" name="home-theme" value={s.id} checked={skin === s.id} onChange={() => onSkin(s.id)} />
          <span className="sw" aria-hidden="true" style={{ '--a': s.swatch[0], '--b': s.swatch[1], '--c': s.swatch[2] } as React.CSSProperties} />
          <span className="nm">{s.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
