import { useEffect, useRef, useState } from 'react';

import { SAVE_PATH_HINT, XBOX_SAVE_PATH_HINT } from '../../save/pick.ts';

/**
 * "Upload save": what to do before choosing the save folder, and where it is.
 * A native <dialog>, so the browser traps focus inside it, closes it on Escape and
 * hands focus back to the button that opened it.
 *
 * Choosing a folder leaves the dialog open: if the picker is cancelled the player is
 * still looking at the steps. Once a folder is picked the import screen replaces
 * the whole page, and this goes with it.
 */
export function UploadDialog({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<'steam' | 'xbox' | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      heading.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const copyPath = async (which: 'steam' | 'xbox') => {
    try {
      await navigator.clipboard.writeText(which === 'steam' ? SAVE_PATH_HINT : XBOX_SAVE_PATH_HINT);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // No clipboard (an insecure page, or refused): select the path so Ctrl+C works.
      const el = document.getElementById(which === 'steam' ? 'save-path' : 'xbox-save-path');
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="imp-dialog"
      aria-labelledby="upload-title"
      onClose={onClose}
      // A click on the dimmed area is a click on the dialog element itself, not on what is inside it.
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="imp-dialog-body">
        <h2 id="upload-title" ref={heading} tabIndex={-1}>
          Upload your save
        </h2>
        <ol className="imp-steps">
          <li>
            <h3>Close Palworld</h3>
            <p>The game rewrites the save while it runs.</p>
          </li>
          <li>
            <h3>Choose your save folder</h3>
            <p>Steam keeps it here. Paste this into the folder picker's address bar:</p>
            <div className="imp-path">
              <code id="save-path">{SAVE_PATH_HINT}</code>
              <button type="button" className="sc-btn ghost imp-small" onClick={() => copyPath('steam')}>
                {copied === 'steam' ? 'Copied' : 'Copy'}
                <span className="sr-only"> the Steam path</span>
              </button>
            </div>
            <p className="imp-note">
              Choose SaveGames itself; every world inside is found for you. Your browser will ask to confirm, and may call it an
              upload: the files stay on this computer and are only read, never changed.
            </p>
            <p>
              <strong className="imp-beta">Beta</strong> Playing on the Xbox app or PC Game Pass? Close the Xbox app too, and choose
              this folder instead:
            </p>
            <div className="imp-path">
              <code id="xbox-save-path">{XBOX_SAVE_PATH_HINT}</code>
              <button type="button" className="sc-btn ghost imp-small" onClick={() => copyPath('xbox')}>
                {copied === 'xbox' ? 'Copied' : 'Copy'}
                <span className="sr-only"> the Xbox path</span>
              </button>
            </div>
            <p className="imp-note">Xbox saves are new here and not yet tried on every setup. Steam saves are the tested path.</p>
            <span className="sr-only" aria-live="polite">
              {copied ? 'Path copied' : ''}
            </span>
          </li>
        </ol>
        <div className="imp-actions">
          <button type="button" className="sc-btn" onClick={onChoose}>
            Choose save folder
          </button>
          <button type="button" className="sc-btn ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
