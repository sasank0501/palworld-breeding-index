/**
 * Choose the game's file for the extractor (Phase 6, step 4). One file,
 * Pal-Windows.pak, through the classic file input (src/extract/pickPak.ts says
 * why), with Steam's default path to paste and a route for every other install.
 * The file is checked (its last 512 bytes) before anything else happens, so a
 * wrong pick gets a plain reason at once.
 */
import { useState } from 'react';

import { checkPak, PAK_NAME, PAK_PATH_HINT, pickPak, type PakCheck } from '../extract/pickPak.ts';
import '../design/extract.css';

export default function GameFilePicker({ onPak, disabled = false }: { onPak: (pak: File, check: Extract<PakCheck, { ok: true }>) => void; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(PAK_PATH_HINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (some browsers, some frames): select the text so Ctrl+C works.
      const el = document.getElementById('pak-path');
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  };

  const choose = async () => {
    const pak = await pickPak();
    if (!pak) return;
    setProblem(null);
    setChecking(true);
    const check = await checkPak(pak);
    setChecking(false);
    if (check.ok) onPak(pak, check);
    else setProblem(check.problem);
  };

  return (
    <div className="gfp">
      <p>
        PalDoc makes the 3D pals from your own copy of Palworld. Choose the game’s file, <b>{PAK_NAME}</b>. It’s read here in
        your browser, and only the parts with pal art: nothing is uploaded or changed.
      </p>
      <p>If Steam installed Palworld in its usual place, paste this into the file dialog’s “File name” box:</p>
      <div className="gfp-path">
        <code id="pak-path">{PAK_PATH_HINT}</code>
        <button type="button" className="sc-btn ghost gfp-small" onClick={copyPath}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Path copied' : ''}
      </span>
      <p className="gfp-note">
        Installed somewhere else? In Steam, right-click Palworld, then Manage, then Browse local files, and open Pal › Content ›
        Paks.
      </p>
      <div>
        <button type="button" className="sc-btn" onClick={choose} disabled={disabled || checking}>
          {checking ? 'Checking the file…' : `Choose ${PAK_NAME}…`}
        </button>
      </div>
      {problem && (
        <p className="gfp-problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
