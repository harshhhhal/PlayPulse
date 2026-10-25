process.env.TZ = 'Asia/Kolkata'; // regression for BUG-004 (UTC day boundaries)
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../js/utils.js');

test('localDateStr uses the local calendar day, not UTC (BUG-004)', () => {
  const d = new Date('2026-10-24T20:00:00Z'); // 01:30 on 25 Oct in IST
  assert.equal(U.localDateStr(d), '2026-10-25');
  assert.equal(d.toISOString().slice(0, 10), '2026-10-24'); // the old, wrong behaviour
});

test('daysAgoStr / dayDiff cross month and year boundaries', () => {
  assert.equal(U.daysAgoStr(1, new Date(2026, 0, 1, 12)), '2025-12-31');
  assert.equal(U.dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(U.dayDiff('2024-02-28', '2024-03-01'), 2); // leap year
});

test('extractPlaylistId accepts valid URLs and bare IDs', () => {
  const id = 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf';
  assert.equal(U.extractPlaylistId(`https://www.youtube.com/playlist?list=${id}`), id);
  assert.equal(U.extractPlaylistId(`https://www.youtube.com/watch?v=abc&list=${id}&index=2`), id);
  assert.equal(U.extractPlaylistId(`youtube.com/playlist?list=${id}`), id);
  assert.equal(U.extractPlaylistId(`https://music.youtube.com/playlist?list=${id}`), id);
  assert.equal(U.extractPlaylistId(` ${id} `), id);
});

test('extractPlaylistId rejects junk, other hosts and malformed input', () => {
  for (const bad of ['', '   ', null, undefined, 42, 'hello world', 'https://evil.com/?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
    'https://www.youtube.com/watch?v=abc', 'https://www.youtube.com/playlist?list=short', 'javascript:alert(1)'])
    assert.equal(U.extractPlaylistId(bad), null, String(bad));
});

test('duplicate playlist detection', () => {
  const existing = [{ id: 'a', playlistId: 'PL1234567890' }];
  assert.equal(U.findDuplicatePlaylist(existing, 'PL1234567890').id, 'a');
  assert.equal(U.findDuplicatePlaylist(existing, 'PLother12345'), null);
  assert.equal(U.findDuplicatePlaylist(undefined, 'x'), null);
});

test('dedupeVideos keeps first occurrence and order (BUG-007)', () => {
  const out = U.dedupeVideos([{ videoId: 'a' }, { videoId: 'b' }, { videoId: 'a' }, null, {}]);
  assert.deepEqual(out.map(v => v.videoId), ['a', 'b']);
});

test('chunk splits at the Firestore batch limit', () => {
  const sizes = U.chunk(Array.from({ length: 1201 }, (_, i) => i), 450).map(c => c.length);
  assert.deepEqual(sizes, [450, 450, 301]);
  assert.deepEqual(U.chunk([], 10), []);
});

test('computeProgress handles empty, partial and full playlists', () => {
  assert.deepEqual(U.computeProgress([]), { total: 0, done: 0, percent: 0, remainingSeconds: 0 });
  const p = U.computeProgress([{ completed: true, duration: 60 }, { completed: false, duration: 120 }, { duration: 30 }]);
  assert.equal(p.done, 1); assert.equal(p.percent, 33); assert.equal(p.remainingSeconds, 150);
  assert.equal(U.computeProgress([{ completed: true }, { completed: true }]).percent, 100);
});

test('planSync adds only new videos, never touches existing ones, appends positions', () => {
  const existing = [{ id: 'a', position: 0, completed: true }, { id: 'b', position: 1 }];
  const remote = [{ videoId: 'a' }, { videoId: 'b' }, { videoId: 'c' }, { videoId: 'c' }, { videoId: 'd' }];
  const plan = U.planSync(existing, remote);
  assert.deepEqual(plan.toAdd.map(v => [v.videoId, v.position]), [['c', 2], ['d', 3]]);
  assert.deepEqual(plan.missingRemotely, []);
});

test('planSync reports videos removed from YouTube but does not delete them', () => {
  const plan = U.planSync([{ id: 'a', position: 0 }, { id: 'gone', position: 1 }], [{ videoId: 'a' }]);
  assert.deepEqual(plan.missingRemotely, ['gone']);
  assert.equal(plan.toAdd.length, 0);
});

test('planSync position starts at 0 for an empty playlist', () => {
  assert.equal(U.planSync([], [{ videoId: 'x' }]).toAdd[0].position, 0);
});

test('nextStreak: first day, consecutive, gap, same-day', () => {
  assert.deepEqual(U.nextStreak({}, '2026-10-24'), { currentStreak: 1, longestStreak: 1, lastStreakDate: '2026-10-24', changed: true });
  assert.equal(U.nextStreak({ currentStreak: 4, longestStreak: 4, lastStreakDate: '2026-10-23' }, '2026-10-24').currentStreak, 5);
  const gap = U.nextStreak({ currentStreak: 9, longestStreak: 9, lastStreakDate: '2026-10-20' }, '2026-10-24');
  assert.equal(gap.currentStreak, 1); assert.equal(gap.longestStreak, 9);
  assert.equal(U.nextStreak({ currentStreak: 3, longestStreak: 5, lastStreakDate: '2026-10-24' }, '2026-10-24').changed, false);
});

test('nextStreak works across month boundary', () => {
  assert.equal(U.nextStreak({ currentStreak: 2, lastStreakDate: '2026-09-30' }, '2026-10-01').currentStreak, 3);
});

test('displayStreak shows 0 once a streak has lapsed', () => {
  const s = { currentStreak: 6, lastStreakDate: '2026-10-22' };
  assert.equal(U.displayStreak(s, '2026-10-23'), 6);
  assert.equal(U.displayStreak(s, '2026-10-24'), 0);
  assert.equal(U.displayStreak({}, '2026-10-24'), 0);
});

test('remainingFromEnd is drift-free and never negative', () => {
  assert.equal(U.remainingFromEnd(10_000, 4_500), 6);
  assert.equal(U.remainingFromEnd(10_000, 20_000), 0);
});

test('goalPercent clamps and tolerates a zero goal', () => {
  assert.equal(U.goalPercent(30, 60), 50);
  assert.equal(U.goalPercent(500, 60), 100);
  assert.equal(U.goalPercent(10, 0), 0);
});

test('escapeHtml neutralises markup and quotes (BUG-002)', () => {
  assert.equal(U.escapeHtml('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(U.escapeHtml(null), '');
});

test('csvCell blocks formula injection and escapes quotes (BUG-003)', () => {
  assert.equal(U.csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(U.csvCell('+1'), `"'+1"`);
  assert.equal(U.csvCell('Ada "A" L'), '"Ada ""A"" L"');
});

test('safeHttpUrl only allows http(s)', () => {
  assert.equal(U.safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(U.safeHttpUrl('https://i.ytimg.com/vi/x/mq.jpg'), 'https://i.ytimg.com/vi/x/mq.jpg');
});
