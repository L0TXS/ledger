# Ledger

Private, offline notes on the people you meet. It works like a personal CRM: profiles, custom 0 to 100 ratings, an interaction log, and an analysis for each person, all encrypted on your own device.

Ledger is an installable web app (PWA). It runs from GitHub Pages, installs to an Android home screen from Chrome, and works fully offline after the first load. The same build also runs on a desktop browser.

**This repository holds the code only.** Your notes never leave your device unless you export a backup, and backups are encrypted with your password.

## Features

- **Profiles:** name, nickname, status, where and when you met, context, contact, appearance, distinguishing features, personality, interests, background, likes, dislikes, talking points, follow-up date, notes, and an optional photo.
- **Ratings:** 0 to 100 sliders on variables you define. Each variable has a category, a weight (×1 to ×5), and anchor text for low, middle, and high scores so ratings stay consistent. Every change is kept in a history.
- **Interaction log:** date, type, place, what happened, a "how it went" score, and next steps.
- **Analysis:** weighted overall and category scores, strongest and weakest variables, changes over time, contact frequency, rule-based reads, and conversation prompts built from the profile.
- **List:** search across every field; filter by status or "Follow-up due"; sort by score, name, last contact, follow-up, or recently updated; archive instead of deleting.

## Privacy and security

| | |
|---|---|
| Encryption at rest | All notes and photos are AES-256-GCM encrypted in IndexedDB. |
| PIN | Optional, 4 to 8 digits. When set, the data key is wrapped with a PBKDF2-derived key (400,000 iterations), so the data can't be decrypted without the PIN. Repeated wrong attempts trigger an escalating lockout. |
| Device key | A non-extractable Web Crypto key held by the browser wraps everything, so a copy of the storage alone is useless. |
| Auto-lock | Locks when you leave the app: immediately, or after 30 seconds, 1 minute, 5 minutes, or 15 minutes. A privacy cover hides the screen in the app switcher. |
| Backups | A password-encrypted `.ledger` file (PBKDF2, 600,000 iterations, then AES-256-GCM). On Android, "Back up now" opens the share sheet, so the file can go straight to Proton Drive or Google Drive. |
| No network | The app makes no network requests apart from loading its own files. The Content Security Policy blocks everything else. |

A web app can't block screenshots the way a native app can. A forgotten PIN can't be reset: erase the app and restore from a backup.

## Install on Android

1. Open the GitHub Pages address in **Chrome**.
2. Tap **⋮ > Add to Home screen > Install**.
3. Open Ledger from the home screen, set a PIN, and start adding entries.
4. Make a backup under **Settings** once you've added a few entries, and keep making them regularly. Clearing Chrome's site data deletes everything on the device.

## Publishing on GitHub Pages

1. Create a new repository (for example `ledger`) and upload the contents of this folder to the root of the `main` branch.
2. Go to **Settings > Pages**, set **Source** to "Deploy from a branch", and choose `main` and `/ (root)`.
3. After a minute, the app is live at `https://<username>.github.io/<repo>/`.

## Releasing an update

1. Make your changes.
2. Bump the version in **both** `js/version.js` (`APP_VERSION`) and `sw.js` (`VERSION`). If you skip this, phones keep running the cached old version.
3. If you added a new file, add it to the `ASSETS` list in `sw.js`.
4. Add an entry to `CHANGELOG.md`, then commit and push.
5. The next time the app opens, it shows "A new version of Ledger is ready" with an **Update** button.

Versions stay at 0.x during development; 1.0 is reserved for the first finished release.

## Running locally

Any static file server works. For example:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly as a file won't work, because browsers block the crypto and storage APIs on `file://` pages.

## Project layout

```
index.html              page shell and Content Security Policy
manifest.webmanifest    install name, icons, colours
sw.js                   offline cache and update flow
css/app.css             all styles, light and dark themes
icons/                  app icons (plain notebook)
js/app.js               screens, routing, lock, backup UI
js/vault.js             keys, PIN, encrypted save and load, photos, backup format
js/crypto.js            Web Crypto helpers (AES-GCM, PBKDF2)
js/db.js                IndexedDB wrapper
js/defaults.js          statuses, interaction types, default variables, data shape
js/analysis.js          scoring, trends, insights, prompts
js/util.js              escaping, dates, formatting
js/version.js           app version
```

## Default rating variables

You can edit, reweight, reorder, switch off, or delete these under the ★ screen, and add your own.

| Category | Variables |
|---|---|
| Rapport | Conversation flow, Shared humour, Receptiveness ×2, Reciprocity ×2, Trust and openness |
| Compatibility | Values alignment ×2, Lifestyle fit, Mutual interests, Ambition and drive, Intellect and curiosity, Emotional maturity |
| Attraction | Physical attraction, Style and presentation, Presence, Chemistry ×2 |
| Practical | Availability, Logistics, Social overlap |

Some analysis rules depend on the category names Rapport, Compatibility, and Attraction. Renaming a category switches off the rules that use it. Renaming a variable is safe, because the rules match variables by their internal ids.

## Roadmap

- Fingerprint unlock (WebAuthn passkey)
- Merge on restore, instead of replacing everything
- Charts of rating history
- Tags and custom profile fields
- Optional Android build from the same code (TWA or Capacitor) for screenshot blocking and a Play Store listing
