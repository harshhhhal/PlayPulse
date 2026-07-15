/* ============================================
   PlayPulse — Admin Dashboard Controller
   ============================================ */

(function () {
  const ADMIN_EMAIL = 'neonone739@gmail.com';
  
  // Dashboard & State Variables
  let allUsers = [];
  let cachedLogs = [];
  let currentSort = 'name';
  let searchQuery = '';
  
  // Chart Instances
  let overallSignupsChart = null;
  let overallWatchTimeChart = null;
  let userActivityChart = null;
  
  // State tracking active selected user
  let selectedUserId = null;

  // Helper to determine user activity status
  function getUserStatus(u) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (u.lastStreakDate === todayStr) {
      return { text: 'Active Today', class: 'status-today' };
    } else if (u.lastStreakDate === yesterdayStr) {
      return { text: 'Active Yesterday', class: 'status-yesterday' };
    } else if (u.lastStreakDate) {
      const last = new Date(u.lastStreakDate);
      const diff = Math.abs(new Date() - last);
      const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        return { text: 'Active recently', class: 'status-recent' };
      }
    }
    return { text: 'Inactive', class: 'status-inactive' };
  }

  // Auth state listener
  auth.onAuthStateChanged(async (user) => {
    // Hide all loader/screens
    document.getElementById('admin-loading').style.display = 'none';
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-denied-screen').style.display = 'none';
    document.getElementById('admin-dashboard-screen').style.display = 'none';

    if (!user) {
      document.getElementById('admin-login-screen').style.display = 'flex';
      return;
    }

    if (user.email !== ADMIN_EMAIL) {
      document.getElementById('admin-denied-screen').style.display = 'flex';
      return;
    }

    // Authorized Admin logged in
    document.getElementById('admin-dashboard-screen').style.display = 'flex';
    document.getElementById('admin-user-avatar').src = user.photoURL || 'https://ui-avatars.com/api/?name=Admin&background=2563eb&color=ffffff&bold=true';
    document.getElementById('admin-user-name').textContent = user.displayName || 'Administrator';

    // Load admin dashboard statistics and users list
    await loadAdminDashboard();
    initSidebarTabs();
    initCollapsibleSidebar();
  });

  // Login event binding
  const signinBtn = document.getElementById('btn-admin-signin');
  if (signinBtn) {
    signinBtn.addEventListener('click', async () => {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
      } catch (err) {
        console.error('Admin Sign-in error:', err);
        alert(err.message || 'Login failed');
      }
    });
  }

  // Logout event bindings
  const handleSignout = async () => {
    try {
      await auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const logoutBtn = document.getElementById('btn-admin-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', handleSignout);

  const deniedLogoutBtn = document.getElementById('btn-denied-logout');
  if (deniedLogoutBtn) deniedLogoutBtn.addEventListener('click', handleSignout);

  // Theme Toggle Logic
  const themeBtn = document.getElementById('btn-theme-admin');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const nextTheme = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('playpulse_theme', nextTheme);
      
      const icon = themeBtn.querySelector('i');
      if (nextTheme === 'dark') {
        icon.className = 'fa-solid fa-sun';
        themeBtn.setAttribute('aria-label', 'Switch to light mode');
      } else {
        icon.className = 'fa-solid fa-moon';
        themeBtn.setAttribute('aria-label', 'Switch to dark mode');
      }
      
      // Re-render overall charts to update styling
      renderOverallCharts();
    });

    // Set initial theme icon
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const icon = themeBtn.querySelector('i');
    if (currentTheme === 'dark') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  }

  // Load Admin stats and users
  async function loadAdminDashboard() {
    const tbody = document.getElementById('admin-users-tbody');
    try {
      const snap = await db.collection('users').get();
      allUsers = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Fetch each user's total watch time from all dailyLogs in parallel (derived field)
      const userWatchTimePromises = allUsers.map(async (u) => {
        try {
          const logsSnap = await db.collection('users').doc(u.id).collection('dailyLogs').get();
          const totalMins = logsSnap.docs.reduce((sum, d) => sum + (d.data().minutesStudied || 0), 0);
          u.totalHours = totalMins / 60;
        } catch (err) {
          console.warn(`Error calculating watch time for user ${u.id}:`, err);
          u.totalHours = 0;
        }
      });
      
      await Promise.all(userWatchTimePromises);

      // Calculate overall statistics
      const totalUsers = allUsers.length;
      let totalXP = 0;
      let activeStreaks = 0;
      let sumLevel = 0;

      allUsers.forEach(u => {
        totalXP += u.totalXP || 0;
        sumLevel += u.level || 1;
        if ((u.currentStreak || 0) > 0) {
          activeStreaks++;
        }
      });

      const avgLevel = totalUsers > 0 ? (sumLevel / totalUsers).toFixed(1) : '1.0';

      // Update counters in UI
      document.getElementById('stat-total-users').textContent = totalUsers;
      document.getElementById('stat-active-streaks').textContent = activeStreaks;
      document.getElementById('stat-total-xp').textContent = totalXP.toLocaleString();
      document.getElementById('stat-avg-level').textContent = avgLevel;

      // Fetch daily logs of the last 7 days for ALL users in parallel to draw overall watch time
      const yesterday = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);
      
      const logPromises = allUsers.map(async (u) => {
        try {
          const snap = await db.collection('users').doc(u.id).collection('dailyLogs')
            .where('date', '>=', yesterday)
            .where('date', '<=', todayStr)
            .get();
          return snap.docs.map(d => d.data());
        } catch (e) {
          console.warn(`Could not load dailyLogs for user ${u.id}:`, e);
          return [];
        }
      });
      
      const allLogsList = await Promise.all(logPromises);
      cachedLogs = allLogsList.flat();

      // Render Charts & User Table
      renderOverallCharts();
      renderUserTable();

      // Broadcast and activity status checks
      await checkActiveAnnouncement();
      renderActivityStatusChart();

      // Backfill welcome notifications for existing users
      sendWelcomeNotificationToExistingUsers();
    } catch (err) {
      console.error('Error fetching admin data:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--error); padding: 40px;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:24px;margin-bottom:8px;"></i>
            <div>Failed to load users: ${err.message}. Ensure your Firestore permissions are configured correctly.</div>
          </td>
        </tr>
      `;
    }
  }

  // Sort and Search Filtering
  function renderUserTable() {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';

    // Search query match
    let filtered = allUsers.filter(u => {
      const q = searchQuery.toLowerCase();
      const name = (u.displayName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    // Sorting options
    filtered.sort((a, b) => {
      if (currentSort === 'name') {
        return (a.displayName || '').localeCompare(b.displayName || '');
      } else if (currentSort === 'xp') {
        return (b.totalXP || 0) - (a.totalXP || 0);
      } else if (currentSort === 'level') {
        return (b.level || 1) - (a.level || 1);
      } else if (currentSort === 'watchtime') {
        return (b.totalHours || 0) - (a.totalHours || 0);
      } else if (currentSort === 'streak') {
        return (b.currentStreak || 0) - (a.currentStreak || 0);
      } else if (currentSort === 'lastLogin') {
        const tA = a.lastLoginAt?.toDate ? a.lastLoginAt.toDate().getTime() : 0;
        const tB = b.lastLoginAt?.toDate ? b.lastLoginAt.toDate().getTime() : 0;
        return tB - tA;
      } else if (currentSort === 'createdAt') {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return tB - tA;
      }
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">
            No users found matching "${searchQuery}"
          </td>
        </tr>
      `;
      return;
    }

    // Render rows
    filtered.forEach(u => {
      const tr = document.createElement('tr');
      const joinedDate = u.createdAt?.toDate
        ? u.createdAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Unknown';

      const initialsAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || 'User')}&background=2563eb&color=ffffff&bold=true`;
      const avatarUrl = (u.photoURL && u.photoURL.trim() !== '') 
        ? u.photoURL 
        : ((u.photoUrl && u.photoUrl.trim() !== '') ? u.photoUrl : initialsAvatar);

      const status = getUserStatus(u);

      tr.innerHTML = `
        <td>
          <div class="admin-user-cell">
            <img src="${avatarUrl}" onerror="this.src='${initialsAvatar}'" alt="" />
            <div>
              <div class="admin-user-name">${u.displayName || 'Unnamed Student'}</div>
              <div class="admin-user-email">${u.email || 'No email'}</div>
              <div style="margin-top: 4px; display: flex; align-items: center;">
                <span class="status-dot ${status.class}"></span>
                <span class="status-text">${status.text}</span>
              </div>
            </div>
          </div>
        </td>
        <td><span class="admin-badge level">Lv ${u.level || 1}</span></td>
        <td><span class="admin-badge xp">${(u.totalXP || 0).toLocaleString()} XP</span></td>
        <td><span class="admin-badge streak">🔥 ${u.currentStreak || 0}</span></td>
        <td class="hide-mobile">${parseFloat((u.totalHours || 0).toFixed(1))} hrs</td>
        <td class="hide-mobile">${joinedDate}</td>
        <td>
          <button class="btn-table-action" onclick="viewUserActivity('${u.id}')">
            <i class="fa-solid fa-eye"></i> View Activity
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Debounced event bindings for filters to improve performance (lag-free)
  let searchTimeout;
  const searchInput = document.getElementById('admin-search-users');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = e.target.value;
        renderUserTable();
      }, 150);
    });
  }

  const sortSelect = document.getElementById('admin-sort-users');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderUserTable();
    });
  }

  // CSV Export Listener
  const exportCsvBtn = document.getElementById('btn-export-csv');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      let csv = 'Name,Email,Level,Total XP,Current Streak,Longest Streak,Status,Last Active,Joined Date\r\n';
      allUsers.forEach(u => {
        const name = (u.displayName || 'Unnamed').replace(/,/g, '');
        const email = (u.email || '').replace(/,/g, '');
        const status = getUserStatus(u).text;
        const lastActive = u.lastStreakDate || 'N/A';
        const joined = u.createdAt?.toDate ? u.createdAt.toDate().toISOString().slice(0, 10) : 'N/A';
        csv += `"${name}","${email}",${u.level || 1},${u.totalXP || 0},${u.currentStreak || 0},${u.longestStreak || 0},"${status}","${lastActive}","${joined}"\r\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `playpulse_users_export_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Render Dashboard Overall Statistics Charts
  function renderOverallCharts() {
    if (overallSignupsChart) overallSignupsChart.destroy();
    if (overallWatchTimeChart) overallWatchTimeChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const textColor = isDark ? '#aaa' : '#555';

    // 1. Sign-ups Chart (Last 7 Days)
    const signupsCtx = document.getElementById('overall-signups-chart');
    if (signupsCtx) {
      const dates = [];
      const signupCounts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const dStr = d.toDateString();
        const count = allUsers.filter(u => {
          if (!u.createdAt) return false;
          const uDate = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
          return uDate.toDateString() === dStr;
        }).length;
        signupCounts.push(count);
      }

      overallSignupsChart = new Chart(signupsCtx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            data: signupCounts,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,.15)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#2563eb'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 10 } }
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textColor, font: { size: 10 }, stepSize: 1 }
            }
          }
        }
      });
    }

    // 2. Watch Time Spent Chart (Total Watch Time over Last 7 Days in Minutes)
    const watchTimeCtx = document.getElementById('overall-watchtime-chart');
    if (watchTimeCtx) {
      const dates = [];
      const watchTimeData = [];
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const dStr = d.toISOString().slice(0, 10);
        dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const dayTotalMins = cachedLogs
          .filter(l => l.date === dStr)
          .reduce((sum, l) => sum + (l.minutesStudied || 0), 0);
        
        watchTimeData.push(parseFloat(dayTotalMins.toFixed(1)));
      }

      overallWatchTimeChart = new Chart(watchTimeCtx, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: 'Total Minutes Watched',
            data: watchTimeData,
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 10 } }
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textColor, font: { size: 10 } },
              title: { display: true, text: 'Minutes', color: textColor, font: { size: 10 } }
            }
          }
        }
      });
    }
  }

  // Detailed Drawer Overlay Control
  async function viewUserActivity(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;

    if (userActivityChart) {
      userActivityChart.destroy();
      userActivityChart = null;
    }

    // Reveal Drawer
    const overlay = document.getElementById('admin-drawer-overlay');
    if (overlay) overlay.classList.add('open');

    // Reset drawer active tab to Overview
    const tabButtons = document.querySelectorAll('.drawer-tab');
    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === 'overview'));
    document.querySelectorAll('.drawer-tab-content').forEach(content => {
      content.style.display = content.id === 'drawer-tab-content-overview' ? 'block' : 'none';
    });

    // Fill general profile stats
    const initialsAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=2563eb&color=ffffff&bold=true`;
    const avatarUrl = (user.photoURL && user.photoURL.trim() !== '') 
      ? user.photoURL 
      : ((user.photoUrl && user.photoUrl.trim() !== '') ? user.photoUrl : initialsAvatar);

    const detailAvatar = document.getElementById('detail-user-avatar');
    detailAvatar.src = avatarUrl;
    detailAvatar.onerror = function() {
      this.src = initialsAvatar;
    };

    document.getElementById('detail-user-name').textContent = `${user.displayName || 'Unnamed Student'} (Lv ${user.level || 1})`;
    document.getElementById('detail-user-email').textContent = user.email || 'No email';
    
    const joined = user.createdAt?.toDate
      ? user.createdAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Unknown';
    document.getElementById('detail-user-joined').textContent = `Joined: ${joined}`;

    const lastLogin = user.lastLoginAt?.toDate
      ? user.lastLoginAt.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Never';
    const detailLastLogin = document.getElementById('detail-user-last-login');
    if (detailLastLogin) {
      detailLastLogin.textContent = `Last Login: ${lastLogin}`;
    }

    document.getElementById('detail-user-watchtime').innerHTML = `<i class="fa-solid fa-clock"></i> Total Watch Time: ${parseFloat((user.totalHours || 0).toFixed(1))} hrs`;

    // Load sub-sections with loading UI
    const badgesDiv = document.getElementById('detail-user-badges');
    badgesDiv.innerHTML = '<div style="color:var(--text-muted);padding:8px;">Loading achievements...</div>';

    const playlistsTbody = document.getElementById('detail-user-playlists');
    playlistsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">Loading playlists...</td></tr>';

    const logsTbody = document.getElementById('detail-user-logs');
    logsTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px;">Loading study history...</td></tr>';

    try {
      // 1. Fetch Achievements
      const achsSnap = await db.collection('users').doc(userId).collection('achievements').get();
      const achievements = achsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (achievements.length === 0) {
        badgesDiv.innerHTML = '<div class="admin-no-data" style="grid-column: 1/-1;">No achievements unlocked yet.</div>';
      } else {
        badgesDiv.innerHTML = '';
        achievements.forEach(ach => {
          const item = document.createElement('div');
          item.className = 'admin-badge-item';

          let iconClass = 'fa-solid fa-award';
          if (typeof BADGE_DEFS !== 'undefined') {
            const definition = BADGE_DEFS.find(b => b.id === ach.id);
            if (definition) iconClass = definition.icon;
          }

          const earnedAtStr = ach.earnedAt?.toDate
            ? ach.earnedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
            : '';

          item.innerHTML = `
            <i class="${iconClass}"></i>
            <span style="font-weight:600;margin-top:4px;">${ach.badgeName || ach.id}</span>
            <span style="font-size:10px;color:var(--text-muted);">${earnedAtStr}</span>
          `;
          badgesDiv.appendChild(item);
        });
      }

      // 2. Fetch Playlists and Progress (Parallelized using Promise.all to prevent lagginess)
      const plSnap = await db.collection('users').doc(userId).collection('playlists').orderBy('createdAt', 'desc').get();
      const playlists = plSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (playlists.length === 0) {
        playlistsTbody.innerHTML = '<tr><td colspan="4" class="admin-no-data" style="text-align:center;padding:20px;">No playlists imported yet.</td></tr>';
      } else {
        playlistsTbody.innerHTML = '';
        
        // Parallel video snaps loading
        const playlistPromises = playlists.map(async (pl) => {
          const videosSnap = await db.collection('users').doc(userId).collection('playlists').doc(pl.id).collection('videos').get();
          const videos = videosSnap.docs.map(d => d.data());
          const total = videos.length;
          const completed = videos.filter(v => v.completed).length;
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return { pl, total, completed, pct };
        });

        const playlistDataList = await Promise.all(playlistPromises);

        playlistDataList.forEach(({ pl, total, completed, pct }) => {
          const tr = document.createElement('tr');
          const ytUrl = pl.playlistId ? `https://www.youtube.com/playlist?list=${pl.playlistId}` : '#';
          tr.innerHTML = `
            <td><strong style="color:var(--text-primary);">${pl.title || 'Untitled Playlist'}</strong></td>
            <td><span class="admin-badge level" style="font-size:11px;padding:2px 8px;">${pl.tag || 'Other'}</span></td>
            <td>${total} videos</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex-grow:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;width:60px;">
                  <div style="width:${pct}%;height:100%;background:var(--success);"></div>
                </div>
                <span>${completed}/${total} (${pct}%)</span>
              </div>
            </td>
            <td>
              ${pl.playlistId ? `
                <a href="${ytUrl}" target="_blank" class="btn-table-action" title="Visit YouTube Playlist" style="padding: 6px 10px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center;">
                  <i class="fa-brands fa-youtube" style="color: #ff0000;"></i>
                </a>
              ` : '<span style="color:var(--text-muted); font-size:11px;">N/A</span>'}
            </td>
          `;
          playlistsTbody.appendChild(tr);
        });
      }

      // 3. Fetch Study Logs (limit to 30)
      const logsSnap = await db.collection('users').doc(userId).collection('dailyLogs').orderBy('date', 'desc').limit(30).get();
      const logs = logsSnap.docs.map(d => d.data());

      if (logs.length === 0) {
        logsTbody.innerHTML = '<tr><td colspan="3" class="admin-no-data" style="text-align:center;padding:20px;">No study activity logged yet.</td></tr>';
        document.getElementById('drawer-chart-container').style.display = 'none';
      } else {
        logsTbody.innerHTML = '';
        logs.forEach(log => {
          const tr = document.createElement('tr');
          const formattedDate = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
          
          const mins = log.minutesStudied || 0;
          let timeStr = '0s';
          if (mins > 0) {
            const totalSeconds = Math.round(mins * 60);
            const m = Math.floor(totalSeconds / 60);
            const s = totalSeconds % 60;
            if (m === 0) {
              timeStr = `${s}s`;
            } else {
              timeStr = s > 0 ? `${m}m ${s}s` : `${m}m`;
            }
          }

          tr.innerHTML = `
            <td><strong>${formattedDate}</strong></td>
            <td>${timeStr}</td>
            <td>${log.videosCompleted || 0} videos</td>
          `;
          logsTbody.appendChild(tr);
        });

        // Render Chart.js dual axis habit logs
        const chartCtx = document.getElementById('drawer-user-chart');
        const chartContainer = document.getElementById('drawer-chart-container');
        if (chartCtx && chartContainer) {
          chartContainer.style.display = 'block';
          const chartLogs = [...logs].reverse().slice(-10); // last 10 entries chronologically
          const labels = chartLogs.map(l => {
            const d = new Date(l.date);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          const minutesData = chartLogs.map(l => parseFloat((l.minutesStudied || 0).toFixed(1)));
          const completedData = chartLogs.map(l => l.videosCompleted || 0);

          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
          const textColor = isDark ? '#aaa' : '#555';

          userActivityChart = new Chart(chartCtx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: 'Mins Studied',
                  data: minutesData,
                  backgroundColor: 'rgba(37,99,235,.6)',
                  borderColor: '#2563eb',
                  borderWidth: 1,
                  borderRadius: 4,
                  yAxisID: 'y'
                },
                {
                  label: 'Vids Completed',
                  data: completedData,
                  type: 'line',
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16,185,129,.1)',
                  borderWidth: 2,
                  pointRadius: 4,
                  tension: 0.3,
                  yAxisID: 'y1'
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  labels: { color: textColor, font: { size: 10 } }
                }
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { color: textColor, font: { size: 10 } }
                },
                y: {
                  type: 'linear',
                  position: 'left',
                  beginAtZero: true,
                  grid: { color: gridColor },
                  ticks: { color: textColor, font: { size: 10 } },
                  title: { display: true, text: 'Mins', color: textColor, font: { size: 10 } }
                },
                y1: {
                  type: 'linear',
                  position: 'right',
                  beginAtZero: true,
                  grid: { display: false },
                  ticks: { color: textColor, font: { size: 10 }, stepSize: 1 },
                  title: { display: true, text: 'Videos', color: textColor, font: { size: 10 } }
                }
              }
            }
          });
        }
      }

    } catch (err) {
      console.error('Error loading detailed drawer data:', err);
      badgesDiv.innerHTML = '<div style="color:var(--error);padding:8px;">Error loading achievements.</div>';
      playlistsTbody.innerHTML = '<tr><td colspan="4" style="color:var(--error);text-align:center;padding:20px;">Error loading playlists.</td></tr>';
      logsTbody.innerHTML = '<tr><td colspan="3" style="color:var(--error);text-align:center;padding:20px;">Error loading logs.</td></tr>';
    }
  }

  // Expose global drawer opener
  window.viewUserActivity = viewUserActivity;

  // Drawer tab bar click listeners
  const drawerTabs = document.querySelectorAll('.drawer-tab');
  drawerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      drawerTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.drawer-tab-content').forEach(c => c.style.display = 'none');
      const target = document.getElementById(`drawer-tab-content-${tab.dataset.tab}`);
      if (target) target.style.display = 'block';
    });
  });

  // Drawer closer
  const closeDrawer = () => {
    const overlay = document.getElementById('admin-drawer-overlay');
    if (overlay) overlay.classList.remove('open');
    if (userActivityChart) {
      userActivityChart.destroy();
      userActivityChart = null;
    }
    selectedUserId = null;
  };

  const closeBtn = document.getElementById('btn-close-drawer');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

  const drawerOverlay = document.getElementById('admin-drawer-overlay');
  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) {
        closeDrawer();
      }
    });
  }

  // Action Modals logic
  let currentActionCallback = null;

  function openActionModal(title, description, defaultValue, callback) {
    const modal = document.getElementById('admin-action-modal');
    document.getElementById('action-modal-title').innerHTML = `<i class="fa-solid fa-gear"></i> ${title}`;
    document.getElementById('action-modal-desc').textContent = description;

    const xpGroup = document.getElementById('xp-input-group');
    const xpInput = document.getElementById('input-adjust-xp');

    if (defaultValue !== null) {
      xpGroup.style.display = 'block';
      xpInput.value = defaultValue;
    } else {
      xpGroup.style.display = 'none';
      xpInput.value = '';
    }

    currentActionCallback = callback;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('open'), 10);
  }

  function closeActionModal() {
    const modal = document.getElementById('admin-action-modal');
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 200);
    currentActionCallback = null;
  }

  const cancelActionBtn = document.getElementById('btn-cancel-action');
  if (cancelActionBtn) cancelActionBtn.addEventListener('click', closeActionModal);

  const saveActionBtn = document.getElementById('btn-save-action');
  if (saveActionBtn) {
    saveActionBtn.addEventListener('click', async () => {
      if (currentActionCallback) {
        const val = document.getElementById('input-adjust-xp').value;
        const success = await currentActionCallback(val);
        if (success !== false) {
          closeActionModal();
        }
      }
    });
  }

  // Administrative Quick Actions Listeners
  document.getElementById('btn-action-edit-xp').addEventListener('click', () => {
    const user = allUsers.find(u => u.id === selectedUserId);
    if (!user) return;

    openActionModal(
      'Adjust User XP',
      `Modify total experience points for ${user.displayName || 'this student'}. User level will be automatically re-calculated from this new XP.`,
      user.totalXP || 0,
      async (newXP) => {
        const parsed = parseInt(newXP);
        if (isNaN(parsed) || parsed < 0) {
          alert('Please enter a valid non-negative XP amount.');
          return false;
        }

        const levelInfo = getLevelFromXP(parsed);
        await db.collection('users').doc(selectedUserId).update({
          totalXP: parsed,
          level: levelInfo.level
        });

        user.totalXP = parsed;
        user.level = levelInfo.level;

        await loadAdminDashboard();
        document.getElementById('detail-user-name').textContent = `${user.displayName} (Lv ${user.level})`;
        return true;
      }
    );
  });

  document.getElementById('btn-action-reset-recovery').addEventListener('click', () => {
    const user = allUsers.find(u => u.id === selectedUserId);
    if (!user) return;

    openActionModal(
      'Reset Streak Cooldown',
      `Reset the streak recovery cooldown token for ${user.displayName || 'this student'}. This will clear their last recovery timestamp, enabling them to restore their daily streak immediately in their dashboard.`,
      null,
      async () => {
        await db.collection('users').doc(selectedUserId).update({
          lastStreakRecoveryUsed: null
        });

        user.lastStreakRecoveryUsed = null;
        alert(`Streak recovery cooldown has been reset for ${user.displayName || 'User'}!`);
        return true;
      }
    );
  });

  document.getElementById('btn-action-delete-user').addEventListener('click', () => {
    const user = allUsers.find(u => u.id === selectedUserId);
    if (!user) return;

    openActionModal(
      'Delete User Profile',
      `WARNING: Are you sure you want to permanently delete the profile for ${user.displayName || 'this student'} (${user.email || 'no email'})? This action is irreversible and deletes their progress data.`,
      null,
      async () => {
        await db.collection('users').doc(selectedUserId).delete();
        allUsers = allUsers.filter(u => u.id !== selectedUserId);
        closeDrawer();
        await loadAdminDashboard();
        alert('User profile deleted successfully.');
        return true;
      }
    );
  });

  // Announcements broadcast controls
  const broadcastBtn = document.getElementById('btn-broadcast-announcement');
  const clearBtn = document.getElementById('btn-clear-announcement');
  const announcementInput = document.getElementById('input-announcement-text');
  const announcementSelect = document.getElementById('select-announcement-type');
  const activeStatusDiv = document.getElementById('active-announcement-status');
  const activeStatusText = document.getElementById('active-announcement-text');

  async function checkActiveAnnouncement() {
    if (!activeStatusDiv) return;
    try {
      const doc = await db.collection('announcements').doc('global').get();
      if (doc.exists) {
        const data = doc.data();
        activeStatusDiv.style.display = 'flex';
        activeStatusText.textContent = `Active Notice: "${data.message}" (${data.type})`;
      } else {
        activeStatusDiv.style.display = 'none';
      }
    } catch (e) {
      console.warn('Failed to load active announcement:', e);
    }
  }

  if (broadcastBtn) {
    broadcastBtn.addEventListener('click', async () => {
      const text = announcementInput.value.trim();
      const type = announcementSelect.value;
      if (!text) {
        alert('Please enter announcement message');
        return;
      }

      try {
        await db.collection('announcements').doc('global').set({
          message: text,
          type: type,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        announcementInput.value = '';
        await checkActiveAnnouncement();
        alert('Announcement broadcasted successfully!');
      } catch (err) {
        console.error('Failed to broadcast:', err);
        alert(`Failed: ${err.message}`);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      try {
        await db.collection('announcements').doc('global').delete();
        await checkActiveAnnouncement();
        alert('Active announcement cleared.');
      } catch (err) {
        console.error('Failed to clear announcement:', err);
        alert(`Failed: ${err.message}`);
      }
    });
  }

  let activityStatusChart = null;

  function renderActivityStatusChart() {
    const ctxEl = document.getElementById('activity-status-chart-canvas');
    if (!ctxEl) return;

    if (activityStatusChart) {
      activityStatusChart.destroy();
      activityStatusChart = null;
    }

    let activeToday = 0;
    let activeRecently = 0;
    let inactive = 0;
    const today = new Date();

    allUsers.forEach(u => {
      if (u.lastStreakDate) {
        const lastDate = new Date(u.lastStreakDate);
        const diffDays = Math.ceil(Math.abs(today - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          activeToday++;
        } else if (diffDays <= 4) {
          activeRecently++;
        } else {
          inactive++;
        }
      } else {
        inactive++;
      }
    });

    // Populate custom HTML legends with exact counts
    const todayLegend = document.getElementById('legend-count-today');
    const recentLegend = document.getElementById('legend-count-recent');
    const inactiveLegend = document.getElementById('legend-count-inactive');

    if (todayLegend) todayLegend.textContent = activeToday;
    if (recentLegend) recentLegend.textContent = activeRecently;
    if (inactiveLegend) inactiveLegend.textContent = inactive;

    const total = allUsers.length;
    const active = activeToday + activeRecently;
    const retentionRate = total > 0 ? Math.round((active / total) * 100) : 0;
    
    const badge = document.getElementById('retention-score-badge');
    if (badge) {
      badge.textContent = `Retention: ${retentionRate}%`;
      if (retentionRate >= 70) {
        badge.style.background = 'var(--success-soft)';
        badge.style.color = 'var(--success)';
      } else if (retentionRate >= 40) {
        badge.style.background = 'var(--warning-soft)';
        badge.style.color = 'var(--warning)';
      } else {
        badge.style.background = 'var(--error-soft)';
        badge.style.color = 'var(--error)';
      }
    }

    // Dynamic border color based on theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartBorderColor = isDark ? '#16181d' : '#ffffff'; // match var(--bg-card)

    const ctx = ctxEl.getContext('2d');
    activityStatusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Active Today', 'Active 2-4d ago', 'Inactive (>4d)'],
        datasets: [{
          data: [activeToday, activeRecently, inactive],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderColor: chartBorderColor,
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // Hide default legend to use custom HTML legends
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.raw || 0;
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return ` ${context.label}: ${value} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '70%'
      }
    });
  }

  // Send Nudge button inside User Details Drawer
  const nudgeUserBtn = document.getElementById('btn-action-nudge-user');
  if (nudgeUserBtn) {
    nudgeUserBtn.addEventListener('click', () => {
      const user = allUsers.find(u => u.id === selectedUserId);
      if (!user) return;

      openActionModal(
        'Nudge Student',
        `Send a real-time motivation alert to ${user.displayName || 'this student'}. The nudge text will pop up inside their topbar notification bell dropdown.`,
        null,
        async () => {
          try {
            await db.collection('users').doc(selectedUserId).update({
              pendingNudge: 'The Administrator is cheering for you! Keep up the good work and check back in today to study!'
            });
            alert(`Nudge notification sent to ${user.displayName || 'User'}!`);
            return true;
          } catch (e) {
            console.error('Failed to nudge:', e);
            alert('Failed to send nudge notification.');
            return false;
          }
        }
      );
    });
  }

  // Backfill welcome notifications for users who do not have any notifications
  async function sendWelcomeNotificationToExistingUsers() {
    try {
      console.log('Checking existing users for welcome notifications backfill...');
      let migrationCount = 0;
      
      for (const u of allUsers) {
        // Query their notifications collection to see if they already have notifications
        const notifSnap = await db.collection('users').doc(u.id).collection('notifications')
          .limit(1)
          .get();
          
        if (notifSnap.empty) {
          // Send welcome notification
          await db.collection('users').doc(u.id).collection('notifications').add({
            text: `👋 Welcome to PlayPulse, ${u.displayName || 'Learner'}! Start studying by adding playlists, tracking your progress, and leveling up!`,
            style: 'info',
            icon: 'fa-solid fa-door-open',
            timestamp: firebase.firestore.FieldValue.serverTimestamp() || new Date()
          });
          migrationCount++;
        }
      }
      
      if (migrationCount > 0) {
        console.log(`Successfully backfilled welcome notifications for ${migrationCount} existing users.`);
      }
    } catch (err) {
      console.error('Failed to run welcome notification migration:', err);
    }
  }

  // Initialize multi-tab sidebar switching
  function initSidebarTabs() {
    const tabButtons = document.querySelectorAll('.admin-sidebar-nav .admin-nav-item');
    const panelOverview = document.getElementById('admin-panel-overview');
    const panelStudents = document.getElementById('admin-panel-students');
    const pageTitle = document.getElementById('admin-page-title');

    if (tabButtons.length > 0 && panelOverview && panelStudents) {
      tabButtons.forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';

        btn.addEventListener('click', () => {
          // Deactivate all buttons
          tabButtons.forEach(b => b.classList.remove('active'));
          // Activate clicked button
          btn.classList.add('active');

          const target = btn.dataset.adminTab;
          if (target === 'overview') {
            panelOverview.classList.remove('hidden');
            panelStudents.classList.add('hidden');
            if (pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-chart-simple"></i> Admin Dashboard';
            
            // Re-render overall stats charts to prevent sizing calculation issues in hidden elements
            renderOverallCharts();
            renderActivityStatusChart();
          } else if (target === 'students') {
            panelStudents.classList.remove('hidden');
            panelOverview.classList.add('hidden');
            if (pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-users"></i> Students Directory';
          }
        });
      });
    }
  }

  // Initialize collapsible sidebar logic
  function initCollapsibleSidebar() {
    const collapseBtn = document.getElementById('btn-collapse-sidebar');
    const sidebar = document.querySelector('.admin-sidebar');

    if (collapseBtn && sidebar) {
      // Restore state from localStorage
      const isCollapsed = localStorage.getItem('playpulse_admin_sidebar_collapsed') === 'true';
      if (isCollapsed) {
        sidebar.classList.add('collapsed');
        const icon = collapseBtn.querySelector('i');
        if (icon) {
          icon.className = 'fa-solid fa-angle-right';
        }
      }

      collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('playpulse_admin_sidebar_collapsed', String(nowCollapsed));

        const icon = collapseBtn.querySelector('i');
        if (icon) {
          icon.className = nowCollapsed ? 'fa-solid fa-angle-right' : 'fa-solid fa-angle-left';
        }

        // Trigger chart redraw to adjust fluid sizing after transitions
        setTimeout(() => {
          renderOverallCharts();
          renderActivityStatusChart();
        }, 260);
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
      closeActionModal();
    }
  });

})();
