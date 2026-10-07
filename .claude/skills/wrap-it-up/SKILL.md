---
name: wrap-it-up
description: End-of-day routine for this repo when the user says "wrap it up" (or /wrap-it-up) — verify, scan the pending changes for game art and personal data, rewrite docs/HANDOFF.md, commit in logical groups, and push the current branch. Never opens a PR or merges to main.
---

# Wrap it up

The user's end-of-day routine. Saying "wrap it up" is standing permission to commit and to
**push the current branch** (given 2026-10-05, after a month of work sat unpushed on one machine).
It is not permission to open a PR, merge into `main`, deploy, or force-push: ask for those.

Work through the steps in order and stop to ask if any check fails.

## 1. See what is pending

```
git status --short
git diff --stat
git log origin/<branch>..HEAD --oneline    # commits not yet pushed
```

Look at **every** changed file, not only the ones you remember editing. A file you didn't touch
(an editor's line-ending change, a generated file) is not committed blindly: diff it, and if it's
noise, leave it out and say so in the handoff.

## 2. Verify

```
npx tsc -b
npx vitest run
npm run build            # must print "no game art"
```

If UI changed this session, also run `npm run audit-a11y` (needs `npm run dev`) and report its
axe count and small-text list. Don't commit a failing state as if it were finished: say what fails.

## 3. Scan for game art and personal data

The public repo ships **no** Pocketpair files and no personal data. Check the files about to be
committed (`git status`) and the diff itself:

- Art and game files: `public/pal-models*`, `public/pal-portraits`, `public/pals`,
  `public/work-icons`, `public/element-icons`, `art-pack/`, any `.png .webp .jpg .glb .gltf .psa
  .psk .uasset .pak .sav .ktx2`. Scripts *named* after them (`build-pal-models.mjs`) are fine.
- Personal data: `public/roster.json` (the user's real save), Steam ids (`7656119…`), world ids
  and names, the user's email, absolute machine paths (`C:/Users/…`, `AppData`).
- `public/demo-roster.json` is the intended, anonymised demo (world "demo", ids "demo-N").

```
git status --short | grep -i -E "\.(png|webp|jpg|glb|gltf|psa|psk|uasset|pak|sav|ktx2)$|roster\.json|art-pack|public/(pal-models|pal-portraits|pals|work-icons|element-icons)"
git diff | grep -i -E "7656119[0-9]+|@gmail|C:/Users|AppData"
```

Anything found: stop and ask. Do not "fix" it by deleting the user's files.

## 4. Rewrite docs/HANDOFF.md

Rewrite it for the next session (not append): title with today's date; one-paragraph state (branch,
what passes, what's live); phase table; **Pick up here** (open questions for the user first, then
the next task); what was built today, condensed; local tools/checks; decisions; how things work.
Keep anything still true from the old version; drop what's finished and no longer useful.

## 5. Commit

Group commits by topic (a fix, a feature, a dependency pin, the handoff), using `git add <paths>`,
never `git add -A`. Messages follow the repo's style (`git log --oneline`): an imperative summary
line, then a short body saying what and why. End every message with the attribution line the
session gives for commits.

## 6. Push

```
git push                       # or: git push -u origin <branch> on the branch's first push
```

Then confirm `git status` is clean apart from anything deliberately left out, and that
`git log origin/<branch>..HEAD` is empty.

## 7. Report

Tell the user: the commits (one line each), the push result, what was left out and why, the
verification results, and the top of "Pick up here".
