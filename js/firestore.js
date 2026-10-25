/* ============================================
   Firestore Operations Module
   ============================================ */

const FirestoreOps = (() => {

  // ---------- User ----------
  function userRef() {
    return db.collection('users').doc(Auth.getUID());
  }

  async function getUserData() {
    const snap = await userRef().get();
    return snap.exists ? snap.data() : null;
  }

  async function updateUser(data) {
    await userRef().update(data);
  }

  // ---------- Playlists ----------
  function playlistsCol() {
    return userRef().collection('playlists');
  }

  async function addPlaylist(playlistData) {
    const ref = await playlistsCol().add({
      ...playlistData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
  }

  async function getPlaylists() {
    const snap = await playlistsCol().orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getPlaylist(playlistId) {
    const snap = await playlistsCol().doc(playlistId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  async function updatePlaylist(playlistId, data) {
    await playlistsCol().doc(playlistId).update(data);
  }

  async function deletePlaylist(playlistId) {
    // Firestore batches are limited to 500 writes; delete videos in chunks first,
    // then the playlist doc last so a partial failure can simply be retried (BUG-005).
    const videos = await videosColRaw(playlistId).get();
    for (const group of PPUtils.chunk(videos.docs, 450)) {
      const batch = db.batch();
      group.forEach(v => batch.delete(v.ref));
      await batch.commit();
    }
    await playlistsCol().doc(playlistId).delete();
  }

  function videosColRaw(playlistId) {
    return playlistsCol().doc(playlistId).collection('videos');
  }

  // ---------- Videos ----------
  function videosCol(playlistId) {
    return playlistsCol().doc(playlistId).collection('videos');
  }

  async function addVideos(playlistId, videosArray) {
    const unique = PPUtils.dedupeVideos(videosArray); // repeated videoIds would collapse into one doc (BUG-007)
    for (const chunk of PPUtils.chunk(unique, 450)) {
      const batch = db.batch();
      chunk.forEach(v => {
        batch.set(videosCol(playlistId).doc(v.videoId), {
          title: v.title,
          thumbnail: v.thumbnail,
          duration: v.duration || 0,
          durationStr: v.durationStr || '0:00',
          completed: false,
          notes: '',
          watchedSeconds: 0,
          lastWatchedAt: null,
          position: Number.isFinite(v.position) ? v.position : 0
        });
      });
      await batch.commit();
    }
    return unique.length;
  }

  async function setAllVideosCompleted(playlistId, videoIds, completed) {
    for (const group of PPUtils.chunk(videoIds, 450)) {
      const batch = db.batch();
      group.forEach(id => batch.update(videosCol(playlistId).doc(id), { completed }));
      await batch.commit();
    }
  }

  async function getVideos(playlistId) {
    const snap = await videosCol(playlistId).orderBy('position').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function updateVideo(playlistId, videoId, data) {
    await videosCol(playlistId).doc(videoId).update(data);
  }

  // ---------- Daily Logs ----------
  function dailyLogsCol() {
    return userRef().collection('dailyLogs');
  }

  function todayStr() {
    return PPUtils.localDateStr();
  }

  async function getTodayLog() {
    const snap = await dailyLogsCol().doc(todayStr()).get();
    return snap.exists ? snap.data() : { date: todayStr(), minutesStudied: 0, videosCompleted: 0 };
  }

  async function updateTodayLog(data) {
    await dailyLogsCol().doc(todayStr()).set(data, { merge: true });
  }

  /** Atomically add to today's counters (avoids read-modify-write races between tabs/timers). */
  async function incrementTodayLog(fields) {
    const inc = {};
    for (const [k, v] of Object.entries(fields)) inc[k] = firebase.firestore.FieldValue.increment(v);
    await dailyLogsCol().doc(todayStr()).set({ date: todayStr(), ...inc }, { merge: true });
  }

  async function getLogsRange(startDate, endDate) {
    const snap = await dailyLogsCol()
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date')
      .get();
    return snap.docs.map(d => d.data());
  }

  // ---------- Achievements ----------
  function achievementsCol() {
    return userRef().collection('achievements');
  }

  async function getAchievements() {
    const snap = await achievementsCol().get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function unlockAchievement(badgeId, badgeName) {
    const ref = achievementsCol().doc(badgeId);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        badgeName,
        earnedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    }
    return false;
  }

  // ---------- Streak ----------
  async function checkAndUpdateStreak() {
    const userData = await getUserData();
    if (!userData) return;
    const todayLog = await getTodayLog();
    if ((todayLog.videosCompleted || 0) < 1) return;
    const next = PPUtils.nextStreak(userData, todayStr());
    if (!next.changed) return;
    await updateUser({
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastStreakDate: next.lastStreakDate
    });
    return next;
  }

  // ---------- Resume ----------
  async function getResumeVideos() {
    // Collects all in-progress videos across playlists for resume ranking
    const playlists = await getPlaylists();
    const candidates = [];
    const now = Date.now();
    const oneDayMs = 86400000;

    for (const pl of playlists) {
      const videos = await getVideos(pl.id);
      for (const v of videos) {
        if (v.completed) continue;
        if (!v.lastWatchedAt && (!v.watchedSeconds || v.watchedSeconds < 1)) continue;
        const lastTs = typeof v.lastWatchedAt === 'number' ? v.lastWatchedAt : (v.lastWatchedAt?.toDate ? v.lastWatchedAt.toDate().getTime() : (v.lastWatchedAt instanceof Date ? v.lastWatchedAt.getTime() : 0));
        const remaining = Math.max(0, (v.duration || 0) - (v.watchedSeconds || 0));
        const completionPct = v.duration > 0 ? Math.round((v.watchedSeconds / v.duration) * 100) : 0;
        candidates.push({
          playlistId: pl.id,
          playlistTitle: pl.title,
          playlistTag: pl.tag || 'Other',
          videoDocId: v.id,
          videoId: v.id,
          title: v.title,
          thumbnail: v.thumbnail || pl.thumbnail || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
          duration: v.duration || 0,
          watchedSeconds: v.watchedSeconds || 0,
          completionPct,
          remaining,
          lastWatchedTs: lastTs,
          withinDay: (now - lastTs) < oneDayMs,
          withinSameDay: lastTs > 0 && new Date(lastTs).toDateString() === new Date().toDateString()
        });
      }
    }

    // Sort by priority rules
    candidates.sort((a, b) => {
      // 1. Paused within last 24h first
      if (a.withinDay !== b.withinDay) return a.withinDay ? -1 : 1;
      // 2. Highest completion pct (not completed)
      if (b.completionPct !== a.completionPct) return b.completionPct - a.completionPct;
      // 3. Shortest remaining duration
      return a.remaining - b.remaining;
    });

    return candidates;
  }

  // ---------- Skill Progress ----------
  function skillProgressCol() {
    return userRef().collection('skillProgress');
  }

  async function getSkillProgress() {
    const snap = await skillProgressCol().get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function addSkillXP(category, xpAmount) {
    const catId = category.toLowerCase().replace(/\s+/g, '_');
    const ref = skillProgressCol().doc(catId);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      const newXP = (data.totalXP || 0) + xpAmount;
      const levelInfo = getLevelFromXP(newXP);
      await ref.update({ totalXP: newXP, level: levelInfo.level, categoryName: category });
    } else {
      const levelInfo = getLevelFromXP(xpAmount);
      await ref.set({ categoryName: category, totalXP: xpAmount, level: levelInfo.level, badgesUnlocked: [] });
    }
  }

  return {
    getUserData, updateUser,
    addPlaylist, getPlaylists, getPlaylist, updatePlaylist, deletePlaylist,
    addVideos, getVideos, updateVideo, setAllVideosCompleted,
    getTodayLog, updateTodayLog, incrementTodayLog, getLogsRange,
    getAchievements, unlockAchievement,
    checkAndUpdateStreak,
    getResumeVideos,
    getSkillProgress, addSkillXP,
    todayStr
  };
})();
