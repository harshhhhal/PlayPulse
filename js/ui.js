/* ============================================
   UI Module â€” Shared UI utilities
   Theme toggle, sidebar, scroll anims, FAQ
   ============================================ */

const UI = (() => {

  function init() {
    initTheme();
    initSidebar();
    initScrollAnimations();
    initFAQ();
    initNavbar();
    initUserDropdown();
    initUrlValidation();
    initBugReportModal();
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    let saved = localStorage.getItem('playpulse_theme');
    if (!saved) {
      saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);

    // All theme toggle buttons (landing + app + topbar)
    document.querySelectorAll('#btn-theme-toggle, #btn-theme-toggle-landing, #btn-theme-topbar').forEach(btn => {
      btn?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        // UI-5: Smooth theme transition
        document.documentElement.classList.add('theme-transition');
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('playpulse_theme', next);
        updateThemeIcon(next);
        // UI-10: Recolor charts on theme toggle
        if (typeof Analytics !== 'undefined' && Analytics.recolorCharts) {
          Analytics.recolorCharts();
        }
        setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
      });
    });
  }

  function updateThemeIcon(theme) {
    document.querySelectorAll('#btn-theme-toggle i, #btn-theme-toggle-landing i, #btn-theme-topbar i').forEach(icon => {
      if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
      }
    });
    // Update aria labels (UX-27)
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    document.querySelectorAll('#btn-theme-toggle, #btn-theme-toggle-landing, #btn-theme-topbar').forEach(btn => {
      if (btn) {
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      }
    });
  }

  /* ---------- Sidebar ---------- */
  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    const mobileBtn = document.getElementById('btn-mobile-menu');

    if (!sidebar) return;

    // Desktop collapse
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('playpulse_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
      });

      // Restore state
      if (localStorage.getItem('playpulse_sidebar') === 'collapsed') {
        sidebar.classList.add('collapsed');
      }
    }

    // Mobile open
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay?.classList.add('show');
        mobileBtn.setAttribute('aria-expanded', 'true');
      });
    }

    // Close on overlay click
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
      });
    }
  }

  /* ---------- Scroll Animations ---------- */
  function initScrollAnimations() {
    const elements = document.querySelectorAll('.fade-in');
    if (!elements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    elements.forEach(el => observer.observe(el));
  }

  /* ---------- FAQ Accordion ---------- */
  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');

        // Close all
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));

        // Toggle this
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  /* ---------- Navbar Scroll Effect ---------- */
  function initNavbar() {
    const nav = document.getElementById('landing-nav');
    if (!nav) return;

    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    });

    // Mobile menu toggle
    const mobileToggle = document.getElementById('nav-mobile-toggle');
    const navLinks = document.getElementById('nav-links');
    if (mobileToggle && navLinks) {
      mobileToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navLinks.classList.toggle('open');
        mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Close menu when clicking a link
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('open');
          mobileToggle.setAttribute('aria-expanded', 'false');
        });
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
          navLinks.classList.remove('open');
          mobileToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Landing page login buttons
    ['btn-landing-login', 'btn-hero-login', 'btn-cta-login'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => Auth.loginWithGoogle());
    });
  }

  /* ---------- Landing Page Init ---------- */
  function initLanding() {
    initTheme();
    initScrollAnimations();
    initFAQ();
    initNavbar();
    initBugReportModal();

    // Swap buttons based on auth state
    auth.onAuthStateChanged((user) => {
      document.querySelectorAll('.auth-signed-out').forEach(el => {
        el.classList.toggle('hidden', !!user);
      });
      document.querySelectorAll('.auth-signed-in').forEach(el => {
        el.classList.toggle('hidden', !user);
      });
    });
  }

  /* ---------- User Dropdown - Click-based (UX-14) ---------- */
  function initUserDropdown() {
    const userEl = document.getElementById('topbar-user');
    if (!userEl) return;

    userEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = userEl.classList.toggle('dropdown-open');
      userEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    userEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const isOpen = userEl.classList.toggle('dropdown-open');
        userEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      if (e.key === 'Escape') {
        userEl.classList.remove('dropdown-open');
        userEl.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#topbar-user')) {
        userEl.classList.remove('dropdown-open');
        userEl.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- URL Validation Hint (UX-25) ---------- */
  function initUrlValidation() {
    const input = document.getElementById('input-playlist-url');
    const hint = document.getElementById('url-validation-hint');
    if (!input || !hint) return;

    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val) {
        hint.classList.add('hidden');
        return;
      }
      hint.classList.remove('hidden');
      if (val.includes('list=')) {
        hint.className = 'url-validation-hint valid';
        hint.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-circle-check"></i> Looks like a valid playlist URL');
      } else if (val.includes('youtube.com/watch') || val.includes('youtu.be/')) {
        hint.className = 'url-validation-hint invalid';
        hint.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-triangle-exclamation"></i> Looks like a video URL - make sure to use a playlist URL with list= in it');
      } else {
        hint.className = 'url-validation-hint invalid';
        hint.innerHTML = DOMPurify.sanitize('<i class="fa-solid fa-circle-info"></i> Paste a full YouTube playlist URL');
      }
    });
  }

  /* ---------- Feedback & Bug Report Modal ---------- */
  function initBugReportModal() {
    const modal = document.getElementById('bug-report-modal');
    const overlay = document.getElementById('bug-report-overlay');
    const form = document.getElementById('bug-report-form');
    const successEl = document.getElementById('bug-report-success');
    const closeBtn = document.getElementById('btn-close-bug-report');
    const doneBtn = document.getElementById('btn-bug-report-done');
    const triggerLanding = document.getElementById('btn-report-bug-landing');
    const triggerApp = document.getElementById('btn-report-bug-app');

    if (!modal) return;

    function openModal(e) { 
      if (e) e.preventDefault(); 
      modal.classList.remove('hidden'); 
    }

    function closeModal() {
      modal.classList.add('hidden');
      if (form) {
        setTimeout(() => {
          form.classList.remove('hidden');
          successEl?.classList.add('hidden');
          form.reset();
        }, 300);
      }
    }

    if (triggerLanding) triggerLanding.onclick = openModal;
    if (triggerApp) triggerApp.onclick = openModal;
    if (closeBtn) closeBtn.onclick = closeModal;
    if (doneBtn) doneBtn.onclick = closeModal;
    if (overlay) overlay.onclick = closeModal;

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Sending...';

        try {
          const res = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
          });
          if (res.ok) {
            form.classList.add('hidden');
            successEl?.classList.remove('hidden');
          } else {
            throw new Error('Failed');
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = originalText;
          showToast('Something went wrong. Please try again.', 'error');
        }
      };
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
  }

  return { init, initLanding };
})();

// ORG-1: showToast() â€” primary implementation (overrides config.js stub)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) { console.log(`[Toast] ${type}: ${message}`); return; }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = DOMPurify.sanitize(`<i class="fa-solid ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-info-circle'}"></i> ${message}`);
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3000);
}

/* ---------- Profile Editor (UX-23) ---------- */
const ProfileEditor = (() => {
  function open() {
    const nameEl = document.getElementById('profile-name');
    const input = document.getElementById('input-display-name');
    if (nameEl && input) {
      input.value = nameEl.textContent || '';
    }
    // Populate daily goal & pomodoro settings
    const goalInput = document.getElementById('input-edit-daily-goal');
    const focusInput = document.getElementById('input-edit-pomo-focus');
    const breakInput = document.getElementById('input-edit-pomo-break');
    if (goalInput) goalInput.value = parseInt(localStorage.getItem('playpulse_daily_goal')) || 60;
    const pomoSettings = JSON.parse(localStorage.getItem('playpulse_pomodoro') || '{}');
    if (focusInput) focusInput.value = pomoSettings.focusMin || 25;
    if (breakInput) breakInput.value = pomoSettings.breakMin || 5;
    document.getElementById('edit-profile-modal')?.classList.remove('hidden');
  }

  function close() {
    document.getElementById('edit-profile-modal')?.classList.add('hidden');
  }

  async function save(e) {
    e.preventDefault();
    const name = document.getElementById('input-display-name').value.trim();
    if (!name) return;

    try {
      await FirestoreOps.updateUser({ displayName: name });
      // Update UI in all places
      document.getElementById('profile-name').textContent = name;
      document.getElementById('topbar-name').textContent = name.split(' ')[0];

      // Save daily goal
      const goalVal = parseInt(document.getElementById('input-edit-daily-goal')?.value) || 60;
      localStorage.setItem('playpulse_daily_goal', String(goalVal));
      const profileGoalEl = document.getElementById('profile-daily-goal');
      if (profileGoalEl) profileGoalEl.value = goalVal;

      // Save pomodoro settings
      const focusVal = parseInt(document.getElementById('input-edit-pomo-focus')?.value) || 25;
      const breakVal = parseInt(document.getElementById('input-edit-pomo-break')?.value) || 5;
      const existingPomo = JSON.parse(localStorage.getItem('playpulse_pomodoro') || '{}');
      existingPomo.focusMin = focusVal;
      existingPomo.breakMin = breakVal;
      localStorage.setItem('playpulse_pomodoro', JSON.stringify(existingPomo));
      // Sync profile settings card & pomodoro widget inputs
      const pFocus = document.getElementById('pomo-focus-min');
      const pBreak = document.getElementById('pomo-break-min');
      const profileFocusEl = document.getElementById('profile-pomo-focus');
      const profileBreakEl = document.getElementById('profile-pomo-break');
      if (pFocus) pFocus.value = focusVal;
      if (pBreak) pBreak.value = breakVal;
      if (profileFocusEl) profileFocusEl.value = focusVal;
      if (profileBreakEl) profileBreakEl.value = breakVal;

      close();
      showToast('Profile updated!', 'success');
    } catch (err) {
      console.error('Profile update error:', err);
      showToast('Failed to update profile', 'error');
    }
  }

  return { open, close, save };
})();

// Dynamic Interactive Tip Support Modal Builder
function showTipModal() {
  let modal = document.getElementById('playpulse-tip-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'playpulse-tip-modal';
    modal.className = 'modal hidden';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(4px)';
    modal.style.zIndex = '2000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.transition = 'opacity 0.2s ease';

    modal.innerHTML = `
      <style>
        @keyframes heartbeat {
          0% { transform: scale(1); }
          14% { transform: scale(1.12); }
          28% { transform: scale(1); }
          42% { transform: scale(1.12); }
          70% { transform: scale(1); }
        }
        .heart-beat-icon {
          animation: heartbeat 1.4s infinite ease-in-out;
          display: inline-block;
        }
        .btn-predefined-tip {
          border: 1px solid var(--border) !important;
          background: var(--bg-secondary) !important;
          color: var(--text-primary) !important;
          border-radius: 20px !important;
          padding: 8px 18px !important;
          font-size: 13px !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          outline: none !important;
        }
        .btn-predefined-tip:hover {
          transform: translateY(-1px);
          border-color: var(--accent) !important;
          color: var(--accent) !important;
        }
        .btn-predefined-tip.active {
          background: var(--accent) !important;
          color: var(--text-inverse) !important;
          border-color: var(--accent) !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2) !important;
        }
        .tip-pay-button {
          background: linear-gradient(135deg, var(--accent) 0%, #1d4ed8 100%) !important;
          color: var(--text-inverse) !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25) !important;
          border-radius: var(--radius) !important;
          font-weight: 700 !important;
          padding: 12px 24px !important;
          font-size: 14px !important;
          border: none !important;
          cursor: pointer !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          text-decoration: none !important;
          transition: all 0.2s ease !important;
        }
        .tip-pay-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35) !important;
        }
        .tip-input-amount {
          width: 100% !important;
          padding: 12px 16px !important;
          background: var(--bg-secondary) !important;
          border: 1px solid var(--border) !important;
          border-radius: var(--radius) !important;
          color: var(--text-primary) !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          text-align: center !important;
          font-family: inherit !important;
          transition: all 0.2s ease !important;
          outline: none !important;
        }
        .tip-input-amount:focus {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px var(--accent-soft) !important;
        }
      </style>

      <div class="modal-content" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; width: 90%; max-width: 380px; box-shadow: var(--shadow-lg); position: relative; text-align: center; color: var(--text-primary); animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
        <button id="btn-close-tip-modal" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Close Modal">
          <i class="fa-solid fa-xmark"></i>
        </button>
        
        <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i class="fa-solid fa-heart heart-beat-icon" style="color: var(--error);"></i> Support PlayPulse
        </h3>
        <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin-bottom: 24px; padding: 0 8px;">
          Select or enter a custom amount to generate your secure payment details:
        </p>

        <!-- Predefined amounts -->
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;">
          <button class="btn-predefined-tip" data-amount="10">₹10</button>
          <button class="btn-predefined-tip active" data-amount="50">₹50</button>
          <button class="btn-predefined-tip" data-amount="100">₹100</button>
        </div>

        <!-- Custom amount input -->
        <div style="margin-bottom: 24px; text-align: left;">
          <label style="display: block; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">Custom Amount (₹)</label>
          <input type="number" id="input-tip-amount" value="50" min="1" placeholder="Enter amount..." class="tip-input-amount" />
        </div>

        <!-- QR Code Display -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 24px;">
          <img id="img-tip-qr" src="" alt="UPI QR Code" style="border: 4px solid #ffffff; border-radius: var(--radius); width: 140px; height: 140px; box-shadow: var(--shadow-sm); display: block;" />
          <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Scan with GPay, PhonePe, or BHIM</span>
        </div>

        <!-- Action pay button -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <a id="btn-tip-pay-link" href="" class="tip-pay-button">
            <i class="fa-solid fa-mobile-screen"></i> Pay via UPI App
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    const closeBtn = modal.querySelector('#btn-close-tip-modal');
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    const amountInput = modal.querySelector('#input-tip-amount');
    const predefinedBtns = modal.querySelectorAll('.btn-predefined-tip');
    const qrImg = modal.querySelector('#img-tip-qr');
    const payLink = modal.querySelector('#btn-tip-pay-link');

    function updatePaymentDetails(amount) {
      const upiUrl = `upi://pay?pa=harshal6805-4@okaxis&pn=PlayPulse&am=${amount}&cu=INR`;
      payLink.href = upiUrl;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiUrl)}`;
    }

    // Input changes
    amountInput.addEventListener('input', () => {
      const val = parseInt(amountInput.value) || 0;
      predefinedBtns.forEach(btn => btn.classList.remove('active'));
      updatePaymentDetails(val);
    });

    // Predefined buttons click
    predefinedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const amt = btn.dataset.amount;
        amountInput.value = amt;

        predefinedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        updatePaymentDetails(amt);
      });
    });

    // Default init
    updatePaymentDetails(50);
  }

  // Open modal
  modal.classList.remove('hidden');
}
window.showTipModal = showTipModal;
