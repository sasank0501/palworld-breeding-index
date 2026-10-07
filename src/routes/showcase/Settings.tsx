import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  applyRestore,
  canSyncFile,
  chooseBackupFile,
  downloadBackup,
  fileSyncState,
  previewRestore,
  reconnectBackupFile,
  stopBackupFile,
  type FileSyncState,
  type RestorePreview,
} from '../../userdata/backup.ts';
import { ArtSettings } from './Art.tsx';
import { SKINS, type Skin } from './skins.ts';
import '../../design/settings.css';

const LAST_BACKUP = 'palworld-last-backup';

const lastBackup = (): string | null => {
  try {
    return localStorage.getItem(LAST_BACKUP);
  } catch {
    return null;
  }
};

const ago = (iso: string | null): string => {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/**
 * The gear in the top bar: themes, the player's data (backup, restore, a backup
 * file kept up to date) and switching saves. A disclosure, not an ARIA menu: a
 * button that shows a panel of ordinary controls, so radios, buttons and the file
 * picker behave as they always do for keyboard and screen-reader users. Esc or a
 * click outside closes it; closing returns focus to the gear.
 *
 * Outside the panel sits a layer (the scrim) that catches the closing tap, so the tap
 * never reaches the page underneath, and touch scrolling stops at it instead of moving
 * the page. It is placed in .sc-shell, below the nav that holds the panel.
 */
export function Settings({
  skin,
  onSkin,
  onOpenSave,
  spotlightHidden = 0,
  onSeeHidden,
}: {
  skin: Skin;
  onSkin: (s: Skin) => void;
  onOpenSave?: () => void;
  /** How many pals are hidden from the Paldex spotlight; the list is its own page. */
  spotlightHidden?: number;
  onSeeHidden?: () => void;
}) {
  // 'closing' keeps the panel up for its exit animation.
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const open = state !== 'closed';
  const closeTimer = useRef(0);
  const [shell, setShell] = useState<Element | null>(null);
  const [message, setMessage] = useState('');
  const [sync, setSync] = useState<FileSyncState>('off');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [last, setLast] = useState(lastBackup);
  const gear = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const panelId = useId();
  const themesId = useId();

  useEffect(() => {
    if (open && canSyncFile()) void fileSyncState().then(setSync);
  }, [open]);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setShell(gear.current?.closest('.sc-shell') ?? null);
    setState('open');
  };
  const close = (refocus = true) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setState('closing');
    closeTimer.current = window.setTimeout(() => setState('closed'), reduced ? 100 : 160);
    if (refocus) gear.current?.focus();
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // While the panel is up the page behind it can't scroll. The scrim alone wasn't
  // enough on iOS: a swipe that starts on the panel, when the panel has nothing to
  // scroll, is handed on to the page ("scroll chaining"). Locking the page's own
  // overflow stops it whatever the swipe started on.
  useEffect(() => {
    if (!shell) return;
    shell.toggleAttribute('data-panel-open', open);
    return () => shell.removeAttribute('data-panel-open');
  }, [shell, open]);

  // Esc closes the panel (not while the restore dialog is up); taps outside land on the scrim.
  useEffect(() => {
    if (state !== 'open') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog.current?.open) {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [state]);

  useEffect(() => {
    if (preview) dialog.current?.showModal();
  }, [preview]);

  const backup = async () => {
    await downloadBackup();
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP, now);
    } catch {
      /* the backup itself still downloaded */
    }
    setLast(now);
    setMessage('Backup downloaded.');
  };

  const pickRestore = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    try {
      setPreview(await previewRestore(file));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async (mode: 'merge' | 'replace') => {
    if (!preview) return;
    await applyRestore(preview.backup, mode);
    const s = preview.backup.prefs?.skin;
    if (mode === 'replace' && s && SKINS.some((k) => k.id === s)) onSkin(s as Skin);
    dialog.current?.close();
    setPreview(null);
    setMessage(mode === 'merge' ? 'Backup merged. Newer changes on either side were kept.' : 'Backup restored.');
  };

  const toggleSync = async () => {
    if (sync === 'on') {
      await stopBackupFile();
      setSync('off');
      setMessage('Stopped updating the backup file. The file itself is kept.');
    } else if (sync === 'needs-permission') {
      setSync(await reconnectBackupFile());
    } else if (await chooseBackupFile()) {
      setSync('on');
      setMessage('The backup file is now updated after every change.');
    }
  };

  return (
    <div className="sc-settings">
      <button
        ref={gear}
        type="button"
        className={`sc-gear${open ? ' on' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Settings and your data"
        onClick={() => (state === 'open' ? close() : show())}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      {open &&
        shell &&
        createPortal(
          <div
            className="sc-setscrim"
            data-state={state}
            aria-hidden="true"
            // The click, not pointerdown: the click is the event the page would
            // otherwise receive, so the scrim must be the one that takes it.
            onClick={() => {
              if (state === 'open') close(false);
            }}
          />,
          shell,
        )}
      <div ref={panel} id={panelId} className="sc-setpanel" data-state={state} hidden={!open}>
        <fieldset className="sc-themes">
          <legend id={themesId}>Themes</legend>
          {SKINS.map((s) => (
            <label key={s.id} className={skin === s.id ? 'on' : ''} title={s.blurb}>
              <input type="radio" name="sc-theme" value={s.id} checked={skin === s.id} onChange={() => onSkin(s.id)} />
              <span
                className="sw"
                aria-hidden="true"
                style={{ '--a': s.swatch[0], '--b': s.swatch[1], '--c': s.swatch[2] } as React.CSSProperties}
              />
              {s.name}
            </label>
          ))}
        </fieldset>

        <ArtSettings />

        <h2>Spotlight</h2>
        <p className="sc-sethint">
          {spotlightHidden === 0
            ? 'Every pal can appear in the Paldex spotlight. “Hide” there takes a pal out of it.'
            : `${spotlightHidden} ${spotlightHidden === 1 ? 'pal' : 'pals'} hidden from the spotlight.`}
        </p>
        {spotlightHidden > 0 && onSeeHidden && (
          <button
            type="button"
            className="sc-setitem"
            onClick={() => {
              close(false);
              onSeeHidden();
            }}
          >
            See hidden pals <span>{spotlightHidden}</span>
          </button>
        )}

        <h2>Your data</h2>
        <p className="sc-sethint">Favourites, notes and saved plans live in this browser. Back them up to keep them safe.</p>
        <button type="button" className="sc-setitem" onClick={backup}>
          Download a backup <span>last: {ago(last)}</span>
        </button>
        <button type="button" className="sc-setitem" onClick={() => fileInput.current?.click()}>
          Restore from a backup…
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => void pickRestore(e.target.files?.[0])} />
        {canSyncFile() && (
          <button type="button" className="sc-setitem" aria-pressed={sync === 'on'} onClick={() => void toggleSync()}>
            Keep a backup file updated
            <span>{sync === 'on' ? 'On' : sync === 'needs-permission' ? 'Reconnect' : 'Off'}</span>
          </button>
        )}

        {onOpenSave && (
          <>
            <h2>Save</h2>
            <button
              type="button"
              className="sc-setitem"
              onClick={() => {
                close(false);
                onOpenSave();
              }}
            >
              Open a different save
            </button>
          </>
        )}
        <p className="sc-setmsg" aria-live="polite">
          {message}
        </p>
      </div>

      <dialog ref={dialog} className="sc-dialog" aria-labelledby="restore-title" onClose={() => setPreview(null)}>
        {preview && (
          <>
            <h2 id="restore-title">Restore this backup?</h2>
            <p>Made {new Date(preview.exportedAt).toLocaleString()}.</p>
            <ul>
              {preview.lines.length ? preview.lines.map((l) => <li key={l}>{l}</li>) : <li>No worlds in it.</li>}
            </ul>
            <p className="sc-sethint">
              <b>Merge</b> keeps whichever is newer, item by item. <b>Replace</b> makes these worlds exactly as in the backup.
            </p>
            <div className="sc-dialog-actions">
              <button type="button" className="sc-btn" onClick={() => void restore('merge')}>
                Merge
              </button>
              <button type="button" className="sc-btn ghost" onClick={() => void restore('replace')}>
                Replace
              </button>
              <button type="button" className="sc-btn ghost" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
