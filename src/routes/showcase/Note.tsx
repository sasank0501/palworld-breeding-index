import { useEffect, useId, useRef, useState } from 'react';

import { setNote } from '../../userdata/edit.ts';
import type { Ctx } from './ctx.ts';
import '../../design/userdata.css';

const MAX = 10_000; // the user-data format refuses longer notes

/**
 * A pal's note, on its sheet: "+ Add note" when there is none, the note with an
 * "Edit note" button when there is. Editing: Save (or Ctrl+Enter), Cancel (or
 * Esc). Saving an empty note deletes it. Focus moves into the box when editing
 * starts and back to the button that started it when editing ends.
 */
export function PalNote({ instanceId, name, label, user }: { instanceId: string; name: string; label: string; user: Ctx['user'] }) {
  const text = user.data?.notes[instanceId]?.text ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [said, setSaid] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const id = useId();

  // Stepping to another pal ends any edit in progress.
  useEffect(() => {
    setEditing(false);
    setSaid('');
  }, [instanceId]);

  useEffect(() => {
    if (editing) box.current?.focus();
  }, [editing]);

  const start = () => {
    setDraft(text);
    setSaid('');
    setEditing(true);
  };
  const finish = (save: boolean) => {
    if (save) {
      user.edit((d) => setNote(d, instanceId, draft.trim(), undefined, label));
      setSaid(draft.trim() ? 'Note saved.' : 'Note deleted.');
    }
    setEditing(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  if (!user.data) return null;

  return (
    <section className="sc-note" aria-labelledby={`${id}-h`}>
      {editing ? (
        <>
          <label id={`${id}-h`} htmlFor={`${id}-box`} className="sc-note-h">
            Note on {name}
          </label>
          <textarea
            ref={box}
            id={`${id}-box`}
            rows={4}
            maxLength={MAX}
            value={draft}
            placeholder="What it's for, who to breed it with…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation(); // don't also leave the pal sheet
                finish(false);
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finish(true);
              }
            }}
          />
          <div className="sc-note-actions">
            <button type="button" className="sc-btn" onClick={() => finish(true)}>
              Save note
            </button>
            <button type="button" className="sc-btn ghost" onClick={() => finish(false)}>
              Cancel
            </button>
            <span className="sc-note-hint">Ctrl+Enter saves · Esc cancels</span>
          </div>
        </>
      ) : text ? (
        <>
          <h2 id={`${id}-h`} className="sc-note-h">
            Note
          </h2>
          <p className="sc-note-text">{text}</p>
          <button ref={opener} type="button" className="sc-btn ghost sc-note-edit" onClick={start}>
            Edit note
          </button>
        </>
      ) : (
        <>
          <h2 id={`${id}-h`} className="sr-only">
            Note
          </h2>
          <button ref={opener} type="button" className="sc-btn ghost" onClick={start}>
            + Add note
          </button>
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  );
}
