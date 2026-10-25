# Changelog

## 1.1.0

### Fixed
Double XP on rewatch; UTC day boundaries (streaks/goals/logs); >500-video delete failure; duplicate playlists and repeated videos; loose playlist URL parsing; Pomodoro drift and stacked intervals; null user-doc crash; broken scripts on about/help/privacy/terms; duplicate constant declarations. See `BUG_TRACKER.md`.

### Security
Removed inline `onclick` handlers and the DOMPurify `onclick` whitelist; escaped user/YouTube text everywhere it reaches `innerHTML` (including admin); CSV formula-injection defence; safe toasts and notifications; `vercel.json` security headers; `firestore.rules` template (not deployed).

### UI / accessibility
New `css/design-system.css` (type/space/z-index/motion tokens, focus-visible rings, 44px touch targets on coarse pointers, reduced motion, forced-colours, safe-area). Mobile bottom navigation, skip link, `h1` page title, `aria-current`, labelled pagination and dismiss buttons. Removed blanket `overflow-x:hidden` on `body`.

### Performance
Atomic `increment` writes; batched bulk updates.

### Tests
`tests/utils.test.js` (19 unit tests), browser layout checks in `tests/browser/`.

### Breaking changes
None to Firestore schema or collection names. `config.js` no longer defines gamification constants (they live in `constants.js`, which every page now loads).

### Not included
A full page-by-page visual redesign (landing, dashboard, workspace). The design-system layer sits on top of the existing component CSS.
