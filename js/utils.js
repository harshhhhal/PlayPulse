/* ============================================
   PlayPulse — Pure utilities (browser + Node)
   No DOM or Firebase access here so everything is unit-testable.
   ============================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PPUtils = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 86400000;
  const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,64}$/;

  /** Local-calendar date as YYYY-MM-DD (NOT UTC, so day boundaries follow the learner's clock). */
  function localDateStr(date) {
    const d = date instanceof Date ? date : new Date(date === undefined ? Date.now() : date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Date string `n` calendar days before `from` (DST-safe: uses calendar arithmetic). */
  function daysAgoStr(n, from) {
    const d = from instanceof Date ? new Date(from.getTime()) : new Date(from === undefined ? Date.now() : from);
    d.setDate(d.getDate() - n);
    return localDateStr(d);
  }

  /** Whole calendar days between two YYYY-MM-DD strings (b - a). */
  function dayDiff(a, b) {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
  }

  /** Accepts a playlist URL or a bare playlist ID. Returns the ID or null. */
  function extractPlaylistId(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim();
    if (!s) return null;
    if (PLAYLIST_ID_RE.test(s)) return s;
    let url;
    try { url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host !== 'youtube.com' && host !== 'music.youtube.com' && host !== 'youtu.be') return null;
    const id = url.searchParams.get('list');
    return id && PLAYLIST_ID_RE.test(id) ? id : null;
  }

  /** Does the user already have this YouTube playlist? */
  function findDuplicatePlaylist(existing, playlistId) {
    return (existing || []).find(p => p && p.playlistId === playlistId) || null;
  }

  /** Remove private/deleted entries and repeated videoIds (keeps first occurrence, order preserved). */
  function dedupeVideos(items) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
      if (!it || !it.videoId || seen.has(it.videoId)) continue;
      seen.add(it.videoId);
      out.push(it);
    }
    return out;
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /** Playlist progress from video docs. Never exceeds 100, never NaN. */
  function computeProgress(videos) {
    const list = videos || [];
    const total = list.length;
    const done = list.filter(v => v && v.completed).length;
    const remainingSeconds = list.filter(v => v && !v.completed).reduce((s, v) => s + (v.duration || 0), 0);
    return { total, done, percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0, remainingSeconds };
  }

  /** Plan the video additions/removals for a sync without touching existing docs. */
  function planSync(existingVideos, remoteVideos) {
    const existingIds = new Set((existingVideos || []).map(v => v.id));
    const remote = dedupeVideos(remoteVideos);
    const remoteIds = new Set(remote.map(v => v.videoId));
    const toAdd = remote.filter(v => !existingIds.has(v.videoId));
    const missingRemotely = (existingVideos || []).filter(v => !remoteIds.has(v.id)).map(v => v.id);
    const maxPos = (existingVideos || []).reduce((m, v) => Math.max(m, Number.isFinite(v.position) ? v.position : -1), -1);
    toAdd.forEach((v, i) => { v.position = maxPos + 1 + i; });
    return { toAdd, missingRemotely };
  }

  /** Next streak state when the learner completes something on `today`. */
  function nextStreak(state, today) {
    const s = state || {};
    let current = s.currentStreak || 0;
    const longest = s.longestStreak || 0;
    if (s.lastStreakDate === today) return { currentStreak: current, longestStreak: longest, lastStreakDate: today, changed: false };
    current = s.lastStreakDate && dayDiff(s.lastStreakDate, today) === 1 ? current + 1 : 1;
    return { currentStreak: current, longestStreak: Math.max(longest, current), lastStreakDate: today, changed: true };
  }

  /** Streak to *display*: a streak whose last day is older than yesterday has lapsed. */
  function displayStreak(state, today) {
    const s = state || {};
    if (!s.lastStreakDate || !s.currentStreak) return 0;
    return dayDiff(s.lastStreakDate, today) <= 1 ? s.currentStreak : 0;
  }

  /** Pomodoro: remaining seconds from an absolute end timestamp (immune to throttled timers / drift). */
  function remainingFromEnd(endTs, now) {
    return Math.max(0, Math.ceil((endTs - (now === undefined ? Date.now() : now)) / 1000));
  }

  function goalPercent(minutes, goalMin) {
    if (!goalMin || goalMin <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((minutes / goalMin) * 100)));
  }

  function escapeHtml(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Neutralise CSV/spreadsheet formula injection and quote the cell. */
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /** Only allow http(s) URLs (for thumbnails etc.). Returns '' otherwise. */
  function safeHttpUrl(u) {
    try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch (e) { return ''; }
  }

  return { localDateStr, daysAgoStr, dayDiff, extractPlaylistId, findDuplicatePlaylist, dedupeVideos, chunk,
    computeProgress, planSync, nextStreak, displayStreak, remainingFromEnd, goalPercent, escapeHtml, csvCell, safeHttpUrl };
});
