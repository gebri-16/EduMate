const BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : 'https://edu-mate-kappa.vercel.app/api';
const API_BASE = BASE + '/auth';
const API_NOTIF = BASE + '/notifikasi';

// ==================== TOKEN ====================

function saveTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem('sb_token', token);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function getToken() {
  return localStorage.getItem('sb_token');
}

function requireLogin() {
  const token = getToken();
  if (!token) {
    window.location.replace('/pages/login.html');
    return null;
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      localStorage.removeItem('sb_token');
      localStorage.removeItem('sb_notif_count');
      window.location.replace('/pages/login.html?error=session_expired');
      return null;
    }
    return payload;
  } catch (err) {
    localStorage.removeItem('sb_token');
    window.location.replace('/pages/login.html?error=invalid_token');
    return null;
  }
}

// ==================== TOAST ====================

function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      display: flex; flex-direction: column; gap: 10px;
      z-index: 9999; pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const colors = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', icon: '✅' },
    error:   { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '❌' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', icon: 'ℹ️' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', icon: '⚠️' },
  };
  const c = colors[type] || colors.success;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${c.bg}; border: 1.5px solid ${c.border}; color: ${c.text};
    padding: 12px 16px; border-radius: 12px;
    font-family: 'DM Sans', sans-serif; font-size: 13.5px; font-weight: 500;
    display: flex; align-items: center; gap: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08); pointer-events: all;
    opacity: 0; transform: translateY(12px);
    transition: opacity 0.25s ease, transform 0.25s ease;
    max-width: 320px; min-width: 200px;
  `;
  toast.innerHTML = `<span>${c.icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ==================== FETCH USER ====================

async function fetchCurrentUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('sb_token');
      localStorage.removeItem('sb_notif_count');
      window.location.replace('/pages/login.html?error=unauthorized');
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch (err) {
    console.error('Gagal fetch user:', err);
    return null;
  }
}

// ==================== UPDATE SIDEBAR ====================

function updateSidebar(user) {
  if (!user) return;

  let metaRef = document.querySelector('meta[name="referrer"]');
  if (!metaRef) {
    metaRef = document.createElement('meta');
    metaRef.name = 'referrer';
    document.head.appendChild(metaRef);
  }
  metaRef.content = 'no-referrer';

  document.querySelectorAll('.user-name').forEach(el => {
    el.textContent = user.nama || 'Pengguna';
  });

  document.querySelectorAll('.user-email').forEach(el => {
    el.innerHTML = '';
    el.textContent = user.email || '';
  });

  document.querySelectorAll('.user-avatar').forEach(el => {
    if (user.foto) {
      el.style.overflow = 'hidden';
      el.style.borderRadius = '50%';
      el.style.flexShrink = '0';
      el.style.padding = '0';
      el.style.fontSize = '0';
      el.innerHTML = `<img src="${user.foto}" alt="${user.nama}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;">`;
    }
  });
}

// ==================== POLLING NOTIFIKASI ====================

async function updateNotifBadge() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch(`${API_NOTIF}/unread-count`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const count = data.count || 0;

    document.querySelectorAll('.nav-badge').forEach(el => {
      const navItem = el.closest('.nav-item');
      if (navItem && navItem.getAttribute('href')?.includes('notifikasi')) {
        el.textContent = count;
        el.style.display = count > 0 ? 'inline-block' : 'none';
      }
    });

    ['notifBadge', 'navBadge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = count;
        el.style.display = count > 0 ? 'inline-block' : 'none';
      }
    });

    const prevRaw  = localStorage.getItem('sb_notif_count');
const prevCount = prevRaw !== null ? parseInt(prevRaw) : null;
// prevCount null = pertama kali load (jangan bunyi)
// prevCount 0 = sebelumnya memang 0, kalau sekarang > 0 berarti ada baru → bunyi
if (prevCount !== null && count > prevCount) {
  showToast('Kamu punya notifikasi baru! 🔔', 'info');
  playNotifSound();
}
localStorage.setItem('sb_notif_count', count);
  } catch (err) {}
}

function startNotifPolling() {
  updateNotifBadge();
  setInterval(updateNotifBadge, 15000);
}

// ==================== NOTIF SOUND ====================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playNotifSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    function playTone(freq, startTime, duration, volume) {
      volume = volume || 0.3;
      const oscillator = ctx.createOscillator();
      const gainNode   = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    }

    const now = ctx.currentTime;
    playTone(659, now, 0.18);
    playTone(988, now + 0.18, 0.28);

  } catch (err) {
    console.warn('Web Audio API tidak tersedia:', err.message);
  }
}

// ==================== LOGOUT ====================

async function logout() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {}
  finally {
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_notif_count');
    sessionStorage.clear();
    window.location.replace('/pages/login.html');
  }
}

// ==================== SIDEBAR TOGGLE (MOBILE) ====================

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const btn = document.getElementById('hamburgerBtn');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('open');
  if (overlay) {
    overlay.classList.toggle('active', isOpen);
    overlay.style.pointerEvents = isOpen ? 'none' : 'none';
  }
  if (btn) btn.classList.toggle('open', isOpen);
}

// ==================== INIT ====================

async function initPage() {
  saveTokenFromURL();
  requireLogin();
  const user = await fetchCurrentUser();
  if (user) {
    updateSidebar(user);
    startNotifPolling();
    startActivityPing();
  }
  document.addEventListener('click', () => getAudioContext(), { once: true });
  return user;
}

// ==================== ACTIVITY PING ====================
// Kirim ping ke server setiap 60 detik agar last_active terupdate

async function pingActivity() {
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/ping`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  } catch (err) {}
}

function startActivityPing() {
  pingActivity();
  setInterval(pingActivity, 60000);
}

// ==================== HELPER: render status online ====================
function renderOnlineStatus(online, label) {
  const color = online ? '#16a34a' : '#9b9894';
  return `<span style="display:inline-flex;align-items:center;gap:5px;">
    <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
    <span style="font-size:11.5px;color:${color};font-weight:500;">${label || (online ? 'Online' : 'Offline')}</span>
  </span>`;
}