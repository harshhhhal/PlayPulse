# PlayPulse

Turn a YouTube playlist into a trackable course: progress, notes, focus timer, goals, streaks, XP and analytics.

Stack: static HTML + CSS + vanilla JavaScript, Firebase Authentication (Google sign-in) and Cloud Firestore, YouTube Data API v3 and IFrame API, Chart.js, DOMPurify. Hosted on Vercel (`vercel.json`). There is no build step.

## Prerequisites
- A Firebase project with **Authentication → Google** enabled and a **Firestore** database.
- A YouTube Data API v3 key.
- Node 18+ (tests only) and Python 3 (local server / browser checks). No npm dependencies.

## Configure
1. `js/config.js` contains the Firebase web config and the YouTube API key. This ZIP ships with `YOUR_...` placeholders. **Replace every placeholder** (Firebase config + YouTube key) before running; EmailJS placeholders can stay (welcome email is then skipped). A Firebase web config is public by design; it is protected by Auth + Firestore rules, not secrecy.
2. YouTube key: in Google Cloud Console restrict it by HTTP referrer (your domain and `localhost`) and to the YouTube Data API v3 only. Anything shipped to the browser can be copied.
3. EmailJS (welcome email, optional): IDs are in `js/email.js`. Leave as is, replace, or remove the call in `js/auth.js`.
4. Admin console (`admin.html`): the admin e-mail is set in `js/admin.js` (`ADMIN_EMAIL`). Use the same e-mail in `firestore.rules`.
5. **Firestore rules:** `firestore.rules` is a *template*. Replace `ADMIN_EMAIL_HERE`, test it in the Firebase Rules Playground/emulator, then `firebase deploy --only firestore:rules`. Without rules, client-side checks (including the admin check) are not a security boundary.
6. Firebase Console → Authentication → Settings → **Authorized domains**: add your deployment domain.

There is no `.env` file: the app is static and reads no environment variables.

## Run locally
```bash
python3 -m http.server 8000      # or: npm run serve
# open http://localhost:8000
```
Google sign-in requires `localhost` to be an authorized domain (it is by default).

## Test
```bash
npm test                 # 19 unit tests (dates, URLs, sync, streaks, timer maths, escaping)
npm run check            # syntax-check every JS file
npm run test:browser     # needs: pip install playwright && playwright install chromium
```
Browser checks: `responsive_check.py` loads the static pages at 9 widths; `app_shell_check.py` loads `app.html` with a **stubbed Firebase** to check layout/navigation only (see `TEST_REPORT.md`). `app_shell_check.py` serves DOMPurify/Chart.js from `PP_VENDOR` (default `/tmp/vendor/node_modules`; `npm i dompurify chart.js` there) because it blocks external CDNs.

## Deploy (Vercel)
Import the repo as a static project (no build command, output = root). `vercel.json` enables clean URLs and security headers.

## Layout
```
index.html app.html admin.html about.html help.html privacy.html terms.html
css/   style.css (base) · design-system.css (tokens/a11y) · app.css · landing.css · admin.css
js/    config.js · utils.js (pure, tested) · constants.js · auth.js · firestore.js · youtube.js
       player.js · playlist.js · dashboard.js · notes.js · pomodoro.js · gamification.js
       analytics.js · ui.js · app.js · admin.js · email.js
tests/ utils.test.js · browser/
firestore.rules (template)
```

## Behaviour notes
- Days follow the learner's local calendar (not UTC).
- A video is completed only when playback ends or the learner marks it; opening it does not complete it. Completion XP is awarded once per video.
- Sync adds new videos only; progress and notes are never rewritten. Videos removed from YouTube stay.
- Resume restores the last video, not an exact second (the IFrame API does not make exact resume reliable).

## Troubleshooting
- *Sign-in popup fails:* add the domain to Firebase authorized domains.
- *"Missing or insufficient permissions":* deploy/adjust Firestore rules.
- *"quota exceeded" on import:* YouTube daily quota; try tomorrow or use another key.
- *Playlist not found:* it is private/deleted, or the link is not a playlist link.

See `BUG_TRACKER.md` for known issues and `CHANGELOG.md` for changes.
