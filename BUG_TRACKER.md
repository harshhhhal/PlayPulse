# PlayPulse bug tracker

Status key: **Fixed + unit-tested** = regression test in `tests/utils.test.js`. **Fixed (code-reviewed, not integration-tested)** = change made and syntax-checked, but it touches live Firebase/YouTube behaviour that could not be exercised in the sandbox. **Open** = documented, not fixed.

## Confirmed defects (verified in source)

| ID | Sev | File / function | Reproduction | Root cause | Fix | Status |
|---|---|---|---|---|---|---|
| BUG-001 | High | `js/player.js` `markCurrentCompleted` | Finish a video, rewatch it to the end | No "already completed" guard; XP, combo and daily log re-awarded | Early return when the video doc is already `completed` | Fixed (code-reviewed, not integration-tested) |
| BUG-002 | High | `js/playlist.js`, `js/dashboard.js` renderers | Import a playlist whose title contains `"` / `\` / HTML | Raw titles interpolated into `innerHTML`; `DOMPurify` called with `ADD_ATTR:['onclick']`, which re-allows inline handlers | Escape all interpolations, remove inline handlers and the whitelist, delegate events via `data-action` | Fixed; `escapeHtml` unit-tested; rendering path not integration-tested |
| BUG-002b | High | `js/admin.js` table/detail renderers | A user writes `displayName: "<img src=x onerror=...>"` to their own `users/{uid}` doc; admin opens the list | Firestore strings in `innerHTML` without escaping; numeric fields rendered unchecked; `photoURL` in an attribute | `esc()` on all text, `Number()` on numerics, `safeHttpUrl()` for URLs, inline `onerror`/`onclick` removed | Fixed (code-reviewed) |
| BUG-002c | High | `js/app.js` `renderNotifications`, `js/constants.js`/`ui.js` `showToast` | Display name with markup → welcome notification text; any error message with markup | `innerHTML` with text | DOM construction with `textContent` | Fixed (code-reviewed; DOMPurify stripped most but toast/notification text paths were still unescaped) |
| BUG-003 | Med | `js/admin.js` CSV export | User named `=HYPERLINK(...)`, export, open in Excel | No formula neutralisation; commas stripped instead of quoted | `csvCell()` | Fixed + unit-tested |
| BUG-004 | High | 13 sites (`firestore.js`, `gamification.js`, `analytics.js`, `app.js`, `admin.js`, `playlist.js`) | Study between 00:00 and 05:30 IST | `toISOString().slice(0,10)` is a UTC date | `PPUtils.localDateStr/daysAgoStr` | Fixed + unit-tested (TZ=Asia/Kolkata) |
| BUG-005 | High | `js/firestore.js` `deletePlaylist`, `playlist.js` `bulkMarkComplete` | Delete a playlist with >500 videos | Single batch (limit 500); bulk mark did N sequential writes | Chunked batches; playlist doc deleted last so retry is safe | Fixed (chunking unit-tested; Firestore calls not integration-tested) |
| BUG-006 | Med | `js/youtube.js` `extractPlaylistId` | Paste `evil.com/?list=...` or a bare non-ID string | Loose regex; raw input used as ID fallback | Strict host + ID validation | Fixed + unit-tested |
| BUG-007 | Med | `playlist.js` add, `firestore.js` `addVideos` | Add same playlist twice; playlist with a repeated video | No duplicate check; repeated `videoId` overwrote one doc while `totalVideos` counted both | Duplicate detection with actionable message; `dedupeVideos` | Fixed + unit-tested |
| BUG-008 | Med | `js/pomodoro.js` | Background the tab during a session | Tick counting with throttled `setInterval` | Absolute end timestamp, interval cleared before restart, pause re-syncs | Fixed (math unit-tested; UI not exercised) |
| BUG-009 | Med | `about/help/privacy/terms.html` | Open any of them | Load missing `js/firebase-init.js`; `auth` undefined | Load `config.js`, `utils.js`, `constants.js` | Fixed; static pages load with no local 404 |
| BUG-010 | Low | `config.js` + `constants.js` | Open app, see console | Same top-level `const`s declared twice (SyntaxError for second script) | Removed duplicates from `config.js` | Fixed |
| BUG-011 | Med | `js/gamification.js` | New user, `users/{uid}` read returns nothing | `getUserData()` can be null; properties read directly | `|| {}` | Fixed; reproduced with stubbed empty DB, error gone |
| BUG-012 | Med | `player.js` study-time logging | Two tabs/timers saving together | Read-modify-write on `dailyLogs` | `FieldValue.increment` via `incrementTodayLog` | Fixed (code-reviewed) |
| BUG-013 | Low | `js/app.js` nav click | Keyboard-navigate sidebar | `activeElement.blur()` dropped focus | Removed; `aria-current` added | Fixed; checked in layout harness |

## Security findings (configuration, not code)

| ID | Sev | Finding | Action |
|---|---|---|---|
| SEC-001 | High | No Firestore rules in repo; README referenced a non-existent `firebase.json` | `firestore.rules` **template** supplied. Not deployed. Replace `ADMIN_EMAIL_HERE`, test in Rules Playground, deploy yourself. |
| SEC-002 | High | Admin access = hardcoded email compared in client JS | Rules template enforces verified-email admin server-side. Hiding the UI is not the control. |
| SEC-003 | Med | YouTube API key and EmailJS keys were committed in the original client code | Removed from this ZIP (placeholders). Rotate the originals if the old repo was public; restrict new keys by referrer. Client keys cannot be fully secret. |
| SEC-004 | Med | XP/streak/level are client-written; a user can edit their own totals | Open. Needs Cloud Functions or stricter rules to fix. |
| SEC-005 | Low | No CSP (inline GTM/theme scripts) | Open. Basic headers added in `vercel.json`. COOP deliberately not set (breaks Google popup sign-in). |

## Open / potential issues (not fixed)

| ID | Sev | Note |
|---|---|---|
| OPEN-001 | Med | `getResumeVideos` reads every video of every playlist (N+1 reads); needs a bounded query or denormalised "last watched" field. |
| OPEN-002 | Med | Heatmap runs newest-to-oldest (right-to-left reading) and day tooltips are hover-only (not touch/keyboard accessible). |
| OPEN-003 | Low | Weekly chart y-axis auto-scales to 0.6–1.0 when there is no data; should start at 0. |
| OPEN-004 | Med | Modals do not trap focus / restore focus (not audited per-dialog). |
| OPEN-005 | Low | Opening a video writes `watchedSeconds +1` to mark it "in progress". Exact resume position is not stored; YouTube IFrame API events do not make that reliable. |
| OPEN-006 | Low | Sync is additive only: videos removed from YouTube remain locally (progress kept by design). |
| OPEN-007 | Env | Live Firebase/YouTube behaviour (auth, rules, quota errors, offline reconnect) unverified. |

## Added during final pass
| ID | Sev | Finding | Status |
|---|---|---|---|
| BUG-014 | Low | `app.html` referenced missing `assets/avatar-default.png` (broken image until JS replaced it) | Fixed: inline SVG default avatar |
