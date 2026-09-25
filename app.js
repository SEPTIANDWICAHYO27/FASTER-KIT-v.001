/* P3K PRO — aplikasi utama (vanilla JS, tanpa build step) */
(function () {
  'use strict';
  const CFG = window.P3K_CONFIG || {};
  const URL_RE = /^https:\/\/script\.google(usercontent)?\.com\/.+\/exec\/?$/;
  // URL server bisa diatur dari aplikasi (disimpan di perangkat) dan mengalahkan config.js
  const apiUrl = () => { try { return localStorage.getItem('p3k_api_url') || CFG.API_URL || ''; } catch (e) { return CFG.API_URL || ''; } };
  const isConfigured = () => URL_RE.test(apiUrl().trim());
  const LOGO = 'logo.webp';
  const $app = document.getElementById('app');
  const $sheet = document.getElementById('sheet-root');
  const $toast = document.getElementById('toast-root');

  const state = {
    token: localStorage.getItem('p3k_token') || '',
    me: JSON.parse(localStorage.getItem('p3k_me') || 'null'),
    data: null,
    offline: false,
    lastSync: null,
    boxQuery: '',
    pendingPhoto: null,
    users: null,
    userQuery: '',
  };

  /* ---------------- util ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const parseYmd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const fmtDate = s => { const d = parseYmd(s); return d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const fmtTime = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const ago = s => {
    const d = new Date(s); if (isNaN(d)) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'baru saja'; if (m < 60) return m + ' menit lalu';
    const h = Math.round(m / 60); if (h < 24) return h + ' jam lalu';
    const dd = Math.round(h / 24); return dd < 8 ? dd + ' hari lalu' : fmtTime(s);
  };
  const isAdmin = () => state.me && /^admin$/i.test(state.me.role);
  const isApprover = () => state.me && /^(approver|admin)$/i.test(state.me.role);
  const cacheKey = () => 'p3k_cache_' + (state.me ? state.me.nik : '');
  const pad2 = n => String(n).padStart(2, '0');
  const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
  const monthName = (ym, short) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('id-ID', short ? { month: 'short' } : { month: 'long', year: 'numeric' }); };
  const photoSrc = (p, big) => (p.file_id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(p.file_id) + '&sz=w' + (big ? 1600 : 640) : p.url);

  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  };

  function toast(msg, isErr) {
    $toast.innerHTML = '<div class="toast' + (isErr ? ' error' : '') + '">' + esc(msg) + '</div>';
    clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.innerHTML = ''), isErr ? 5000 : 3000);
  }

  /* ---------------- API ---------------- */
  async function api(action, payload) {
    const body = Object.assign({ action, token: state.token }, payload || {});
    return callApi(apiUrl().trim(), body);
  }

  async function callApi(url, body) {
    if (!URL_RE.test(url)) throw new Error('URL server belum diatur. Buka Pengaturan server.');
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      throw new Error(navigator.onLine ? 'Tidak bisa menghubungi server Google Sheets. Periksa URL API dan akses Web App (Anyone).' : 'Tidak ada koneksi internet.');
    }
    if (!r.ok) throw new Error(r.status === 404
      ? 'Server tidak ditemukan (404). URL Web App salah atau deployment sudah dihapus. Buat deployment baru lalu perbarui URL di Pengaturan server.'
      : 'Server Google Sheets tidak merespons (' + r.status + ').');
    let res;
    const text = await r.text();
    try { res = JSON.parse(text); } catch (e) {
      if (/doPost|Script function not found/i.test(text)) throw new Error('Fungsi doPost tidak ditemukan. Pastikan Code.gs P3K PRO sudah ditempel lalu deploy ulang (Versi baru).');
      throw new Error('Server membalas halaman, bukan data. Biasanya akses Web App belum "Siapa saja (Anyone)" atau deployment belum versi terbaru.');
    }
    if (!res.ok) {
      if (res.code === 'AUTH' && body.action !== 'login') { doLogout(true); }
      const e = new Error(res.error || 'Terjadi kesalahan.'); e.code = res.code; throw e;
    }
    return res;
  }

  async function refresh(silent) {
    try {
      const d = await api('bootstrap');
      state.data = d; state.me = d.me; state.offline = false; state.loadError = ''; state.lastSync = new Date();
      localStorage.setItem('p3k_me', JSON.stringify(d.me));
      try { localStorage.setItem(cacheKey(), JSON.stringify({ at: state.lastSync.toISOString(), d })); } catch (e) {}
      derive();
      render();
      checkNewAlerts();
    } catch (e) {
      if (e.code === 'AUTH') return;
      const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
      if (c && !state.data) { state.data = c.d; state.lastSync = new Date(c.at); derive(); }
      state.offline = true; state.loadError = e.message;
      render();
      if (!silent) toast(navigator.onLine ? e.message : 'Tidak ada koneksi. Menampilkan data terakhir.', true);
    }
  }

  /* ---------------- derived data ---------------- */
  let D = {};
  function derive() {
    const d = state.data; const warn = (d.settings && d.settings.expWarnDays) || 30; const t0 = today0();
    const boxById = {}; d.boxes.forEach(b => { boxById[b.box_id] = Object.assign(b, { expired: 0, soon: 0, low: 0 }); });
    const stockById = {};
    d.stock.forEach(s => {
      stockById[s.stok_id] = s;
      const ed = parseYmd(s.expired);
      s.days = ed ? Math.round((ed - t0) / 864e5) : null;
      s.exp = s.days == null ? null : s.days < 0 ? 'expired' : s.days <= warn ? 'soon' : 'ok';
      s.low = s.qty < s.min_stok;
      const b = boxById[s.box_id];
      if (b) { if (s.exp === 'expired') b.expired++; if (s.exp === 'soon') b.soon++; if (s.low) b.low++; }
    });
    d.boxes.forEach(b => { b.status = b.expired ? 'expired' : b.soon ? 'soon' : b.low ? 'low' : 'ok'; });
    const expired = d.stock.filter(s => s.exp === 'expired').sort((a, b) => a.days - b.days);
    const soon = d.stock.filter(s => s.exp === 'soon').sort((a, b) => a.days - b.days);
    const low = d.stock.filter(s => s.low).sort((a, b) => (a.qty / (a.min_stok || 1)) - (b.qty / (b.min_stok || 1)));
    d.logs.sort((x, y) => String(y.waktu).localeCompare(String(x.waktu)));
    const usage = d.logs.filter(l => l.action === 'PEMAKAIAN');
    const pending = d.approvals.filter(a => a.status === 'Menunggu');
    const photos = (d.photos || []).slice().sort((x, y) => String(y.waktu).localeCompare(String(x.waktu)));
    const photoIdx = {};
    photos.forEach(p => { const k = p.box_id + '|' + p.bulan; (photoIdx[k] = photoIdx[k] || []).push(p); });
    const cur = thisMonth();
    const noPhoto = d.boxes.filter(b => !photoIdx[b.box_id + '|' + cur]);
    D = { warn, boxById, stockById, expired, soon, low, usage, pending, photos, photoIdx, noPhoto };
  }
  const photosOf = (box, ym) => D.photoIdx[box + '|' + ym] || [];
  const alertCount = () => D.expired.length + D.soon.length + D.low.length;

  /* ---------------- browser notifications ---------------- */
  let swReg = null;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => (swReg = r)).catch(() => {}));
  }
  function notifSupported() { return 'Notification' in window; }
  async function enableNotif() {
    if (!notifSupported()) return toast('Browser ini tidak mendukung notifikasi.', true);
    const p = await Notification.requestPermission();
    if (p === 'granted') { toast('Notifikasi aktif.'); localStorage.removeItem(seenKey()); checkNewAlerts(); }
    else toast('Izin notifikasi ditolak. Aktifkan dari pengaturan browser.', true);
    render();
  }
  const seenKey = () => 'p3k_seen_' + (state.me ? state.me.nik : '');
  function checkNewAlerts() {
    if (!state.data) return;
    const items = [];
    D.expired.forEach(s => items.push(['e:' + s.stok_id + ':' + s.expired, 'Kadaluwarsa: ' + s.nama_item + ' (Kotak ' + s.box_id + ')']));
    D.soon.forEach(s => items.push(['s:' + s.stok_id + ':' + s.expired, 'Segera kadaluwarsa: ' + s.nama_item + ' (Kotak ' + s.box_id + '), ' + s.days + ' hari']));
    D.low.forEach(s => items.push(['l:' + s.stok_id + ':' + s.qty, 'Stok kurang: ' + s.nama_item + ' ' + s.qty + '/' + s.min_stok + ' (Kotak ' + s.box_id + ')']));
    D.usage.slice(0, 30).forEach(l => items.push(['u:' + l.waktu + ':' + l.stok_id, 'Dipakai: ' + l.details]));
    if (new Date().getDate() >= 20) D.noPhoto.filter(b => isApprover() || b.pic_nik === state.me.nik)
      .forEach(b => items.push(['p:' + b.box_id + ':' + thisMonth(), 'Belum ada foto pengecekan ' + monthName(thisMonth()) + ': Kotak ' + b.box_id]));
    if (isApprover()) D.pending.forEach(a => items.push(['a:' + a.apv_id, 'Menunggu approval: ' + a.jenis + ' Kotak ' + a.box_id + ' oleh ' + a.pengaju_nama]));

    const seen = new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]'));
    const fresh = items.filter(([k]) => !seen.has(k));
    localStorage.setItem(seenKey(), JSON.stringify(items.map(i => i[0])));
    if (!fresh.length || !notifSupported() || Notification.permission !== 'granted') return;
    const title = fresh.length === 1 ? 'P3K PRO' : 'P3K PRO: ' + fresh.length + ' pemberitahuan baru';
    const body = fresh.slice(0, 4).map(i => i[1]).join('\n') + (fresh.length > 4 ? '\n+' + (fresh.length - 4) + ' lainnya' : '');
    const opts = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'p3k-alerts', renotify: true, data: { url: location.href.split('#')[0] + '#/notifikasi' } };
    if (swReg && swReg.showNotification) swReg.showNotification(title, opts); else try { new Notification(title, opts); } catch (e) {}
  }

  /* ---------------- auth ---------------- */
  async function doLogin(form) {
    const btn = form.querySelector('button'); const err = form.querySelector('.err');
    btn.disabled = true; err.textContent = '';
    try {
      const r = await api('login', { username: form.username.value.trim(), password: form.password.value });
      state.token = r.token; state.me = r.me;
      localStorage.setItem('p3k_token', r.token); localStorage.setItem('p3k_me', JSON.stringify(r.me));
      location.hash = '#/beranda';
      $app.innerHTML = '<div class="spinner"></div>';
      await refresh();
    } catch (e) {
      err.textContent = e.message; btn.disabled = false;
    }
  }
  function doLogout(expired) {
    if (!expired && state.token) api('logout').catch(() => {});
    state.token = ''; state.data = null; state.users = null; state.loadError = '';
    localStorage.removeItem('p3k_token');
    if (expired) toast('Sesi berakhir. Silakan masuk lagi.', true);
    location.hash = '#/masuk';
    render();
  }

  /* ---------------- views ---------------- */
  function viewLogin() {
    return '<div class="login"><div class="login-wrap"><form class="login-card" id="login-form" autocomplete="on">' +
      '<img class="login-logo" src="' + LOGO + '" alt="Logo Asam Sulfat Utilitas 3B" width="250" height="161">' +
      '<h1>P3K PRO</h1><p class="sub">Monitoring kotak P3K SR Asam Sulfat &amp; Utilitas 3B</p>' +
      '<label class="field"><span>NIK / username</span><input class="input" name="username" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="Contoh: 2146103" required></label>' +
      '<label class="field"><span>Kata sandi</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>' +
      '<div class="err" role="alert"></div>' +
      '<button class="btn block" type="submit">Masuk</button>' +
      '<button type="button" class="linkbtn" data-act="server">Pengaturan server</button></form>' +
      '<p class="login-foot">Keselamatan dimulai dari kotak P3K yang lengkap.</p></div></div>';
  }

  function viewSetup(first) {
    const cur = apiUrl();
    return '<div class="login"><div class="login-wrap"><form class="login-card setup" id="server-form" autocomplete="off">' +
      '<img class="login-logo" src="' + LOGO + '" alt="Logo Asam Sulfat Utilitas 3B" width="250" height="161">' +
      '<h1>' + (first ? 'Hubungkan ke Google Sheets' : 'Pengaturan server') + '</h1>' +
      '<p class="sub">Tempel URL Web App Google Apps Script (berakhiran <code>/exec</code>).</p>' +
      '<label class="field"><span>URL Web App</span><textarea class="input" name="url" rows="3" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" required>' + esc(cur) + '</textarea></label>' +
      '<div class="err" role="alert"></div><div class="okmsg" role="status"></div>' +
      '<button class="btn block" type="submit">Tes &amp; simpan</button>' +
      (localStorage.getItem('p3k_api_url') && CFG.API_URL ? '<button type="button" class="linkbtn" data-act="server-reset">Pakai URL bawaan config.js</button>' : '') +
      (!first ? '<button type="button" class="linkbtn" data-act="server-close">Kembali ke login</button>' : '') +
      '<ol><li>Buka Google Sheet → <b>Ekstensi → Apps Script</b>, tempel <code>Code.gs</code>, jalankan <code>setup</code>.</li><li><b>Terapkan → Deployment baru → Aplikasi web</b>, akses: <b>Siapa saja</b>.</li><li>Salin URL <code>/exec</code> lalu tempel di atas.</li></ol>' +
      '</form></div></div>';
  }

  async function saveServer(form) {
    const btn = form.querySelector('button[type=submit]'), err = form.querySelector('.err'), ok = form.querySelector('.okmsg');
    const url = form.url.value.trim().replace(/\s+/g, '');
    err.textContent = ''; ok.textContent = '';
    if (!URL_RE.test(url)) { err.textContent = 'URL harus diawali https://script.google.com/macros/s/ dan berakhiran /exec.'; return; }
    btn.disabled = true; btn.textContent = 'Menguji koneksi…';
    try {
      const r = await callApi(url, { action: 'ping' });
      if (url === (CFG.API_URL || '').trim()) localStorage.removeItem('p3k_api_url'); else localStorage.setItem('p3k_api_url', url);
      ok.textContent = 'Terhubung ke "' + (r.spreadsheet || 'Google Sheets') + '"' + (r.version ? ' (backend v' + r.version + ')' : '') + '.';
      state.showServer = false;
      setTimeout(() => { location.hash = '#/masuk'; render(); }, 900);
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false; btn.textContent = 'Tes & simpan';
  }

  function viewLoadError() {
    return '<div class="login"><div class="login-wrap"><div class="login-card setup">' +
      '<img class="login-logo" src="' + LOGO + '" alt="Logo Asam Sulfat Utilitas 3B" width="250" height="161">' +
      '<h1>Data belum bisa dimuat</h1><p class="sub">' + esc(state.loadError || 'Terjadi kesalahan.') + '</p>' +
      '<button class="btn block" data-act="retry">Coba lagi</button>' +
      '<button type="button" class="linkbtn" data-act="server">Pengaturan server</button>' +
      '<button type="button" class="linkbtn" data-act="logout">Keluar</button></div></div></div>';
  }

  function shell(route, content) {
    const nAlert = alertCount(); const nApv = isApprover() ? D.pending.length : 0;
    const nav = [
      ['beranda', 'Beranda', ICON.home, 0],
      ['kotak', 'Kotak', ICON.box, 0],
      ['foto', 'Foto', ICON.camera, 0],
      ['notifikasi', 'Notifikasi|Notif', ICON.bell, nAlert],
      ['approval', 'Approval', ICON.check, nApv],
      ['akun', 'Akun', ICON.user, 0],
    ];
    const syncTxt = state.lastSync ? 'Sinkron ' + state.lastSync.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
    return '<div class="shell">' +
      '<header class="topbar"><a href="#/beranda" aria-label="Beranda"><img class="logo-chip" src="' + LOGO + '" alt="Logo Asam Sulfat Utilitas 3B" width="71" height="46"></a><div class="brand"><b>P3K PRO</b><small>SR Asam Sulfat &amp; Utilitas 3B</small></div><div class="spacer"></div>' +
      '<button class="icon-btn" data-act="sync" title="Muat ulang data. ' + esc(syncTxt) + '" aria-label="Muat ulang data">' + ICON.sync + '</button>' +
      '<a class="icon-btn" href="#/notifikasi" aria-label="Notifikasi, ' + nAlert + ' peringatan">' + ICON.bell + (nAlert ? '<span class="dot">' + nAlert + '</span>' : '') + '</a></header>' +
      '<nav class="nav" aria-label="Menu utama">' + nav.map(([k, l, ic, n]) => '<a href="#/' + k + '" class="' + (route === k ? 'on' : '') + '">' + ic + (l.includes('|') ? '<span class="l-long">' + l.split('|')[0] + '</span><span class="l-short">' + l.split('|')[1] + '</span>' : '<span>' + l + '</span>') + (n ? '<span class="dot">' + n + '</span>' : '') + '</a>').join('') + '</nav>' +
      '<main>' + (state.offline ? '<div class="offline" role="status">Offline. Menampilkan data terakhir (' + esc(state.lastSync ? state.lastSync.toLocaleString('id-ID') : '-') + '). Perubahan belum bisa dikirim.</div>' : '') + content + '</main></div>';
  }

  function viewBeranda() {
    const d = state.data;
    const bad = d.boxes.filter(b => b.status !== 'ok').length;
    const statusTxt = bad ? bad + ' dari ' + d.boxes.length + ' kotak P3K perlu tindakan' : 'Semua ' + d.boxes.length + ' kotak P3K lengkap dan layak pakai';
    const tileLabel = b => b.status === 'expired' ? b.expired + ' kadaluwarsa' : b.status === 'soon' ? b.soon + ' segera ED' : b.status === 'low' ? b.low + ' stok kurang' : 'Lengkap';
    const wall = d.boxes.map(b => '<a class="tile s-' + b.status + '" href="#/kotak/' + encodeURIComponent(b.box_id) + '" title="' + esc(b.lokasi) + '"><span class="no">' + esc(b.box_id) + '</span><span class="st">' + tileLabel(b) + '</span></a>').join('');
    const alerts = '<div class="alerts">' +
      '<a class="alert c-red" href="#/notifikasi/kadaluwarsa"><span class="n">' + D.expired.length + '</span><span class="t">Sudah kadaluwarsa<small>Ganti sebelum dipakai</small></span></a>' +
      '<a class="alert c-amber" href="#/notifikasi/kadaluwarsa"><span class="n">' + D.soon.length + '</span><span class="t">Kadaluwarsa ≤ ' + D.warn + ' hari<small>Siapkan pengganti</small></span></a>' +
      '<a class="alert c-blue" href="#/notifikasi/stok"><span class="n">' + D.low.length + '</span><span class="t">Di bawah stok minimum<small>Ajukan restock</small></span></a>' +
      '<a class="alert c-ink" href="#/foto"><span class="n">' + D.noPhoto.length + '</span><span class="t">Belum difoto ' + esc(monthName(thisMonth(), true)) + '<small>Upload foto pengecekan</small></span></a></div>';
    const recent = D.usage.slice(0, 5);
    const usage = recent.length ? '<div class="list">' + recent.map(rowUsage).join('') + '</div>' : '<div class="list"><div class="empty"><b>Belum ada pemakaian tercatat</b>Catat pemakaian dari halaman kotak setiap kali isi kotak dipakai.</div></div>';
    const apvBlock = isApprover()
      ? '<h2 class="h2">Menunggu approval <span class="chip ' + (D.pending.length ? 'amber' : 'grey') + '">' + D.pending.length + '</span><a href="#/approval">Buka approval</a></h2>' +
        (D.pending.length ? D.pending.slice(0, 3).map(apvCard).join('') : '<div class="list"><div class="empty"><b>Tidak ada pengajuan tertunda</b></div></div>')
      : '';
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return '<section class="hero" aria-labelledby="hero-t"><p class="hello">Halo, <b>' + esc(firstName(state.me.nama)) + '</b>. ' + esc(today) + '</p>' +
      '<h1 class="hero-title" id="hero-t"><span class="sep" aria-hidden="true"></span>' + statusTxt + '</h1>' +
      '<div class="wall">' + wall + '</div>' +
      '<div class="legend"><span><i style="background:#FF5D6E"></i>Kadaluwarsa</span><span><i style="background:#FFA53B"></i>Segera ED</span><span><i style="background:#7FA6FF"></i>Stok kurang</span><span><i style="background:#3CCB98"></i>Lengkap</span></div></section>' +
      '<h2 class="h2">Peringatan</h2>' + alerts + apvBlock +
      '<h2 class="h2">Pemakaian terakhir<a href="#/notifikasi/riwayat">Semua riwayat</a></h2>' + usage;
  }
  const firstName = n => String(n || '').split(' ')[0];
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  function statusChips(b) {
    const c = [];
    if (b.expired) c.push('<span class="chip red">' + b.expired + ' kadaluwarsa</span>');
    if (b.soon) c.push('<span class="chip amber">' + b.soon + ' segera ED</span>');
    if (b.low) c.push('<span class="chip blue">' + b.low + ' stok kurang</span>');
    if (!c.length) c.push('<span class="chip green">Lengkap</span>');
    return c.join('');
  }

  function viewKotak() {
    const q = state.boxQuery.toLowerCase();
    const list = state.data.boxes.filter(b => !q || (b.box_id + ' ' + b.lokasi + ' ' + b.pic_nama).toLowerCase().includes(q));
    const mine = state.data.boxes.filter(b => b.pic_nik === state.me.nik);
    return '<h1 class="h1">Kotak P3K</h1><p class="lead">' + state.data.boxes.length + ' kotak terdaftar' + (mine.length ? '. Anda PIC kotak ' + mine.map(b => b.box_id).join(', ') + '.' : '.') + '</p>' +
      '<div class="searchbar"><input class="input" id="box-q" type="search" placeholder="Cari nomor kotak, lokasi, atau PIC" value="' + esc(state.boxQuery) + '" aria-label="Cari kotak"></div>' +
      (list.length ? '<div class="plates">' + list.map(b =>
        '<a class="plate" href="#/kotak/' + encodeURIComponent(b.box_id) + '"><div class="plate-head"><div class="mark" aria-hidden="true"></div><div><div class="no">' + esc(b.box_id) + '</div><div class="loc">' + esc(b.lokasi) + '</div></div></div>' +
        '<div class="plate-body"><div class="pic">PIC <b>' + esc(b.pic_nama) + '</b> (' + esc(b.pic_nik) + ')</div><div class="chips">' + statusChips(b) + '</div></div></a>').join('') + '</div>'
        : '<div class="list"><div class="empty"><b>Tidak ada kotak yang cocok</b>Coba kata kunci lain.</div></div>');
  }

  function edCell(s) {
    if (!s.expired) return '<span class="meta" title="Tidak ada tanggal kadaluwarsa">—</span>';
    if (s.exp === 'expired') return '<span class="chip red">' + fmtDate(s.expired) + ' · lewat ' + Math.abs(s.days) + ' hr</span>';
    if (s.exp === 'soon') return '<span class="chip amber">' + fmtDate(s.expired) + ' · ' + s.days + ' hr lagi</span>';
    return fmtDate(s.expired);
  }

  function viewBoxDetail(id) {
    const b = D.boxById[id];
    if (!b) return '<a class="back" href="#/kotak">' + ICON.back + 'Semua kotak</a><div class="list"><div class="empty"><b>Kotak ' + esc(id) + ' tidak ditemukan</b></div></div>';
    const items = state.data.stock.filter(s => s.box_id === id);
    const rows = items.map(s => '<tr class="' + (s.exp === 'expired' ? 'is-expired' : s.exp === 'soon' ? 'is-soon' : s.low ? 'is-low' : '') + '">' +
      '<td>' + esc(s.nama_item) + '</td>' +
      '<td class="num"><b class="' + (s.low ? 'qty-bad' : '') + '">' + s.qty + '</b><span class="of"> / ' + s.min_stok + '<span class="unit"> ' + esc(s.satuan) + '</span></span></td>' +
      '<td>' + edCell(s) + '</td></tr>').join('');
    const logs = state.data.logs.filter(l => l.box_id === id).slice(0, 10);
    return '<a class="back" href="#/kotak">' + ICON.back + 'Semua kotak</a>' +
      '<div class="detail-head"><div class="no">' + esc(b.box_id) + '</div><div class="loc">' + esc(b.lokasi) + '</div><div class="pic">PIC ' + esc(b.pic_nama) + ' (' + esc(b.pic_nik) + ')</div></div>' +
      '<div class="actions box-actions"><button class="btn" data-act="usage" data-box="' + esc(id) + '">Catat pemakaian</button>' +
      '<button class="btn ghost" data-act="restock" data-box="' + esc(id) + '">Ajukan restock</button>' +
      '<button class="btn ghost" data-act="koreksi" data-box="' + esc(id) + '">Koreksi stok &amp; ED</button>' +
      '<button class="btn ghost" data-act="beli" data-box="' + esc(id) + '">Ajukan pembelian</button>' +
      '<button class="btn ghost" data-act="foto-upload" data-box="' + esc(id) + '">' + ICON.camera.replace('<svg', '<svg width="20" height="20"') + 'Upload foto</button></div>' +
      '<div class="chips" style="margin:6px 0 14px">' + statusChips(b) + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th class="num">Stok / min</th><th>Kadaluwarsa</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h2 class="h2">Foto pengecekan ' + new Date().getFullYear() + '</h2>' + photoStrip(id) +
      '<h2 class="h2">Aktivitas kotak ini</h2>' +
      (logs.length ? '<div class="list">' + logs.map(rowLog).join('') + '</div>' : '<div class="list"><div class="empty"><b>Belum ada aktivitas</b></div></div>');
  }

  function rowUsage(l) {
    return '<div class="row"><div class="main"><div class="title">' + esc((D.stockById[l.stok_id] || {}).nama_item || 'Item') + ' ×' + l.qty + ' <span class="chip grey">Kotak ' + esc(l.box_id) + '</span></div>' +
      '<div class="meta">' + esc(l.keterangan) + '</div><div class="meta">' + esc(l.user) + '</div></div><div class="side meta">' + esc(ago(l.waktu)) + '</div></div>';
  }
  const LOG_LABEL = { PEMAKAIAN: ['Pemakaian', 'blue'], AJUAN_RESTOCK: ['Ajuan restock', 'grey'], AJUAN_PEMBELIAN: ['Ajuan pembelian', 'grey'], AJUAN_KOREKSI: ['Ajuan koreksi', 'grey'], APPROVE: ['Disetujui', 'green'], REJECT: ['Ditolak', 'red'], FOTO: ['Foto pengecekan', 'green'] };
  function rowLog(l) {
    const [lbl, c] = LOG_LABEL[l.action] || [l.action, 'grey'];
    return '<div class="row"><div class="main"><div class="title"><span class="chip ' + c + '">' + esc(lbl) + '</span></div><div class="meta">' + esc(l.details) + '</div><div class="meta">' + esc(l.user) + '</div></div><div class="side meta">' + esc(ago(l.waktu)) + '</div></div>';
  }

  function viewNotif(tab) {
    tab = tab || 'kadaluwarsa';
    const tabs = [['kadaluwarsa', 'Kadaluwarsa', D.expired.length + D.soon.length], ['stok', 'Stok minimum|Stok', D.low.length], ['riwayat', 'Riwayat penggunaan|Riwayat', D.usage.length]];
    let perm = '';
    if (notifSupported() && Notification.permission !== 'granted') {
      perm = '<div class="perm"><p>Aktifkan notifikasi agar perangkat ini memberi tahu saat ada item kadaluwarsa, stok di bawah minimum, pemakaian baru' + (isApprover() ? ', dan pengajuan yang menunggu approval' : '') + '.</p><button class="btn sm" data-act="notif-on">Aktifkan notifikasi</button></div>';
    }
    let body = '';
    const itemRow = (s, side) => '<a class="row" style="text-decoration:none;color:inherit" href="#/kotak/' + encodeURIComponent(s.box_id) + '"><div class="main"><div class="title">' + esc(s.nama_item) + '</div><div class="meta">Kotak ' + esc(s.box_id) + ', ' + esc((D.boxById[s.box_id] || {}).lokasi || '') + '</div></div><div class="side">' + side + '</div></a>';
    if (tab === 'kadaluwarsa') {
      body = (D.expired.length ? '<h2 class="h2" style="margin-top:0">Sudah kadaluwarsa</h2><div class="list">' + D.expired.map(s => itemRow(s, '<span class="chip red">Lewat ' + Math.abs(s.days) + ' hari</span><div class="meta">' + fmtDate(s.expired) + '</div>')).join('') + '</div>' : '') +
        (D.soon.length ? '<h2 class="h2">Kadaluwarsa dalam ' + D.warn + ' hari</h2><div class="list">' + D.soon.map(s => itemRow(s, '<span class="chip amber">' + (s.days === 0 ? 'Hari ini' : s.days + ' hari lagi') + '</span><div class="meta">' + fmtDate(s.expired) + '</div>')).join('') + '</div>' : '');
      if (!body) body = '<div class="list"><div class="empty"><b>Tidak ada item kadaluwarsa</b>Semua item dengan tanggal ED masih berlaku lebih dari ' + D.warn + ' hari.</div></div>';
    } else if (tab === 'stok') {
      body = D.low.length ? '<div class="list">' + D.low.map(s => itemRow(s, '<span class="chip blue">' + s.qty + ' / ' + s.min_stok + ' ' + esc(s.satuan) + '</span><div class="meta">kurang ' + (s.min_stok - s.qty) + '</div>')).join('') + '</div>'
        : '<div class="list"><div class="empty"><b>Semua stok memenuhi minimum</b></div></div>';
    } else {
      body = D.usage.length ? '<div class="list">' + D.usage.map(rowUsage).join('') + '</div>' : '<div class="list"><div class="empty"><b>Belum ada pemakaian tercatat</b></div></div>';
    }
    return '<h1 class="h1">Notifikasi</h1><p class="lead">Peringatan dihitung ulang setiap sinkronisasi dengan Google Sheets.</p>' + perm +
      '<div class="tabs" role="tablist">' + tabs.map(([k, l, n]) => '<a role="tab" aria-selected="' + (k === tab) + '" class="' + (k === tab ? 'on' : '') + '" href="#/notifikasi/' + k + '">' + (l.includes('|') ? '<span class="l-long">' + l.split('|')[0] + '</span><span class="l-short">' + l.split('|')[1] + '</span>' : l) + ' <span class="count">' + n + '</span></a>').join('') + '</div>' + body;
  }

  /* ---------------- foto pengecekan ---------------- */
  function photoStrip(boxId) {
    const y = new Date().getFullYear(), cur = thisMonth();
    let cells = '';
    for (let m = 1; m <= 12; m++) {
      const ym = y + '-' + pad2(m), ps = photosOf(boxId, ym), future = ym > cur;
      const label = '<span class="m">' + esc(monthName(ym, true)) + '</span>';
      if (ps.length) cells += '<button class="mcell has" data-act="foto-view" data-box="' + esc(boxId) + '" data-month="' + ym + '" aria-label="Lihat foto ' + esc(monthName(ym)) + '"><img loading="lazy" alt="" src="' + esc(photoSrc(ps[0])) + '">' + label + (ps.length > 1 ? '<span class="n">' + ps.length + '</span>' : '') + '</button>';
      else if (future) cells += '<div class="mcell future">' + label + '</div>';
      else cells += '<button class="mcell miss' + (ym === cur ? ' now' : '') + '" data-act="foto-upload" data-box="' + esc(boxId) + '" data-month="' + ym + '" aria-label="Upload foto ' + esc(monthName(ym)) + '">' + ICON.camera + label + '</button>';
    }
    return '<div class="mstrip">' + cells + '</div>';
  }

  function viewFoto(ym) {
    const cur = thisMonth();
    ym = /^\d{4}-\d{2}$/.test(ym || '') && ym <= cur ? ym : cur;
    const boxes = state.data.boxes.slice();
    const done = boxes.filter(b => photosOf(b.box_id, ym).length);
    boxes.sort((a, b) => (photosOf(a.box_id, ym).length ? 1 : 0) - (photosOf(b.box_id, ym).length ? 1 : 0));
    const all = done.length === boxes.length;
    const cards = boxes.map(b => {
      const ps = photosOf(b.box_id, ym), p = ps[0];
      const head = '<div class="pc-tag"><span class="no">' + esc(b.box_id) + '</span><span class="loc">' + esc(b.lokasi) + '</span></div>';
      if (p) return '<div class="pcard"><button class="pc-img" data-act="foto-view" data-box="' + esc(b.box_id) + '" data-month="' + ym + '" aria-label="Lihat foto Kotak ' + esc(b.box_id) + '"><img loading="lazy" alt="Foto Kotak ' + esc(b.box_id) + '" src="' + esc(photoSrc(p)) + '">' + (ps.length > 1 ? '<span class="n">' + ps.length + ' foto</span>' : '') + '</button>' + head +
        '<div class="pc-meta">' + esc(p.pic_nama || p.pic_nik) + ', ' + esc(fmtTime(p.waktu)) + (p.catatan ? '<br>' + esc(p.catatan) : '') + '</div></div>';
      return '<div class="pcard missing"><button class="pc-img" data-act="foto-upload" data-box="' + esc(b.box_id) + '" data-month="' + ym + '">' + ICON.camera + '<span>Upload foto</span></button>' + head +
        '<div class="pc-meta">Belum ada foto. PIC ' + esc(b.pic_nama) + '</div></div>';
    }).join('');
    return '<h1 class="h1">Foto pengecekan</h1><p class="lead">Satu foto per kotak setiap bulan sebagai bukti pengecekan. Foto tersimpan di Google Drive dan tercatat di sheet Foto Kotak.</p>' +
      '<div class="monthbar"><a class="icon-btn" href="#/foto/' + shiftMonth(ym, -1) + '" aria-label="Bulan sebelumnya">' + ICON.back + '</a>' +
      '<b>' + esc(monthName(ym)) + '</b>' +
      (ym < cur ? '<a class="icon-btn" href="#/foto/' + shiftMonth(ym, 1) + '" aria-label="Bulan berikutnya">' + ICON.next + '</a>' : '<span class="icon-btn" aria-hidden="true"></span>') +
      '<button class="btn sm" data-act="foto-upload" data-month="' + ym + '">' + ICON.camera.replace('<svg', '<svg width="18" height="18"') + 'Upload foto</button></div>' +
      '<p class="photo-status ' + (all ? 'good' : 'bad') + '">' + (all ? 'Semua ' + boxes.length + ' kotak sudah difoto' : done.length + ' dari ' + boxes.length + ' kotak sudah difoto') + '</p>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + boxes.length + '" aria-valuenow="' + done.length + '"><span style="width:' + (100 * done.length / (boxes.length || 1)) + '%"></span></div>' +
      '<div class="pgrid">' + cards + '</div>';
  }

  function compressImage(file) {
    const maxDim = 1600, quality = 0.82;
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type || 'image/')) return reject(new Error('File harus berupa foto.'));
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL('image/jpeg', quality);
        resolve({ mime: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl, kb: Math.round(dataUrl.length * 0.75 / 1024), w, h });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto tidak bisa dibaca. Gunakan format JPG atau PNG.')); };
      img.src = url;
    });
  }

  function sheetUpload(boxId, ym) {
    state.pendingPhoto = null;
    const cur = thisMonth(); ym = ym || cur;
    const months = []; for (let i = 0; i < 12; i++) months.push(shiftMonth(cur, -i));
    if (months.indexOf(ym) < 0) months.push(ym);
    const mine = state.data.boxes.find(b => b.pic_nik === state.me.nik);
    boxId = boxId || (mine ? mine.box_id : state.data.boxes[0].box_id);
    const body =
      '<div class="twocol"><label class="field"><span>Kotak</span><select class="input" name="box">' + state.data.boxes.map(b => '<option value="' + esc(b.box_id) + '"' + (b.box_id === boxId ? ' selected' : '') + '>' + esc(b.box_id + ', ' + b.lokasi) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Bulan pengecekan</span><select class="input" name="bulan">' + months.map(m => '<option value="' + m + '"' + (m === ym ? ' selected' : '') + '>' + esc(monthName(m)) + '</option>').join('') + '</select></label></div>' +
      '<div class="field"><span>Foto kotak</span><div class="picker" id="picker"><div class="ph">' + ICON.image + '<span>Foto seluruh kotak dengan tutup terbuka, isi terlihat jelas.</span></div></div>' +
      '<div class="pick-btns"><label class="btn ghost">' + ICON.camera.replace('<svg', '<svg width="20" height="20"') + 'Ambil foto<input type="file" accept="image/*" capture="environment" class="sr" data-photo-input></label>' +
      '<label class="btn ghost">' + ICON.image.replace('<svg', '<svg width="20" height="20"') + 'Pilih dari galeri<input type="file" accept="image/*" class="sr" data-photo-input></label></div></div>' +
      '<label class="field"><span>Catatan kondisi (opsional)</span><textarea class="input" name="catatan" placeholder="Mis. segel utuh, isi rapi, label daftar isi terpasang"></textarea></label>';
    openSheet('Upload foto pengecekan', 'Foto dikompres otomatis sebelum dikirim.', body, 'Upload foto', async f => {
      if (!state.pendingPhoto) throw new Error('Ambil atau pilih foto terlebih dahulu.');
      const btn = f.querySelector('[type=submit]'); btn.textContent = 'Mengunggah…';
      try {
        await api('uploadPhoto', { box_id: f.box.value, bulan: f.bulan.value, mime: state.pendingPhoto.mime, data: state.pendingPhoto.data, catatan: f.catatan.value.trim() });
      } finally { btn.textContent = 'Upload foto'; }
      state.pendingPhoto = null;
      toast('Foto Kotak ' + f.box.value + ' untuk ' + monthName(f.bulan.value) + ' terunggah.');
      await refresh(true);
    });
  }

  async function onPhotoPicked(input) {
    const file = input.files && input.files[0]; if (!file) return;
    const picker = document.getElementById('picker'); const err = $sheet.querySelector('.err');
    picker.innerHTML = '<div class="spinner" style="margin:40px auto"></div>'; err.textContent = '';
    try {
      const r = await compressImage(file);
      state.pendingPhoto = r;
      picker.innerHTML = '<img alt="Pratinjau foto" src="' + r.dataUrl + '"><span class="size">' + r.w + '×' + r.h + ', ' + r.kb + ' KB</span>';
    } catch (e) {
      state.pendingPhoto = null;
      picker.innerHTML = '<div class="ph">' + ICON.image + '<span>Belum ada foto.</span></div>'; err.textContent = e.message;
    }
    input.value = '';
  }

  function viewerPhotos(boxId, ym) {
    const ps = photosOf(boxId, ym); if (!ps.length) return;
    const b = D.boxById[boxId] || {};
    const html = ps.map(p => '<figure class="viewer-fig"><img alt="Foto Kotak ' + esc(boxId) + '" src="' + esc(photoSrc(p, true)) + '">' +
      '<figcaption><b>' + esc(p.pic_nama || p.pic_nik) + '</b>, ' + esc(fmtTime(p.waktu)) + (p.catatan ? '<br>' + esc(p.catatan) : '') +
      (p.url ? '<br><a href="' + esc(p.url) + '" target="_blank" rel="noopener">Buka di Google Drive</a>' : '') + '</figcaption></figure>').join('');
    $sheet.innerHTML = '<div class="scrim" data-act="close-sheet"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t">' +
      '<div class="sheet-head"><div style="flex:1"><h3 id="sh-t">Kotak ' + esc(boxId) + ', ' + esc(monthName(ym)) + '</h3><p>' + esc(b.lokasi || '') + '. ' + ps.length + ' foto.</p></div><button type="button" class="icon-btn" data-act="close-sheet" aria-label="Tutup">' + ICON.x + '</button></div>' +
      '<div class="sheet-body">' + html + '</div>' +
      '<div class="sheet-foot"><button type="button" class="btn ghost" data-act="close-sheet">Tutup</button><button type="button" class="btn" data-act="foto-upload" data-box="' + esc(boxId) + '" data-month="' + ym + '">Tambah foto</button></div></div></div>';
  }

  const JENIS = { RESTOCK: 'Restock', PEMBELIAN: 'Pembelian', KOREKSI: 'Koreksi stok' };
  const STATUS_CHIP = { Menunggu: 'amber', Disetujui: 'green', Ditolak: 'red' };
  function apvCard(a) {
    const canDecide = isApprover() && a.status === 'Menunggu' && (a.pengaju_nik !== state.me.nik || /^admin$/i.test(state.me.role));
    const items = (a.items || []).map(i => '<li>' + esc(i.nama_item) + (i.qty ? (a.jenis === 'KOREKSI' ? ' → ' : ' +') + i.qty : '') + (i.expired ? ', ED ' + fmtDate(i.expired) : '') + '</li>').join('');
    const note = (a.ringkasan || '').split('| Catatan: ')[1];
    return '<div class="apv"><div class="apv-top"><span class="chip ' + (STATUS_CHIP[a.status] || 'grey') + '">' + esc(a.status) + '</span><b>' + esc(JENIS[a.jenis] || a.jenis) + ', Kotak ' + esc(a.box_id) + '</b><span class="id">' + esc(a.apv_id) + '</span></div>' +
      '<ul>' + (items || '<li>' + esc(a.ringkasan) + '</li>') + '</ul>' + (note ? '<div class="by">Catatan: ' + esc(note) + '</div>' : '') +
      '<div class="by">Diajukan ' + esc(a.pengaju_nama || a.pengaju_nik) + ', ' + esc(ago(a.waktu_ajuan)) + '</div>' +
      (a.status !== 'Menunggu' ? '<div class="by">' + esc(a.status) + ' ' + esc(fmtTime(a.waktu_putusan)) + (a.alasan ? '. Alasan: ' + esc(a.alasan) : '') + '</div>' : '') +
      (canDecide ? '<div class="btns"><button class="btn sm" data-act="approve" data-id="' + esc(a.apv_id) + '">Setujui</button><button class="btn sm ghost" data-act="reject" data-id="' + esc(a.apv_id) + '">Tolak</button></div>' : '') + '</div>';
  }

  function viewApproval(tab) {
    const all = state.data.approvals;
    if (!isApprover()) {
      return '<h1 class="h1">Pengajuan saya</h1><p class="lead">Restock, koreksi, dan pembelian yang Anda ajukan. Stok berubah setelah disetujui Approver.</p>' +
        (all.length ? all.map(apvCard).join('') : '<div class="list"><div class="empty"><b>Belum ada pengajuan</b>Buka salah satu kotak lalu pilih Ajukan restock.</div></div>');
    }
    tab = tab || 'menunggu';
    const list = tab === 'menunggu' ? D.pending : all.filter(a => a.status !== 'Menunggu');
    return '<h1 class="h1">Approval</h1><p class="lead">Keputusan langsung tercatat di sheet Approvals dan memperbarui sheet Stok.</p>' +
      '<div class="tabs"><a class="' + (tab === 'menunggu' ? 'on' : '') + '" href="#/approval/menunggu">Menunggu <span class="count">' + D.pending.length + '</span></a><a class="' + (tab === 'riwayat' ? 'on' : '') + '" href="#/approval/riwayat">Sudah diputuskan <span class="count">' + (all.length - D.pending.length) + '</span></a></div>' +
      (list.length ? list.map(apvCard).join('') : '<div class="list"><div class="empty"><b>' + (tab === 'menunggu' ? 'Tidak ada pengajuan yang menunggu' : 'Belum ada keputusan') + '</b></div></div>');
  }

  function viewAkun() {
    const mine = state.data.boxes.filter(b => b.pic_nik === state.me.nik);
    const perm = notifSupported() ? ({ granted: 'Aktif', denied: 'Diblokir di pengaturan browser', default: 'Belum diaktifkan' }[Notification.permission]) : 'Tidak didukung';
    return '<h1 class="h1">Akun</h1><p class="lead">Informasi login dan perangkat.</p>' +
      '<div class="profile"><div class="avatar" aria-hidden="true">' + esc(initials(state.me.nama)) + '</div><div><div class="nm">' + esc(state.me.nama) + '</div><div class="role">' + esc(state.me.role) + ', NIK ' + esc(state.me.nik) + '</div></div></div>' +
      '<dl class="kv"><dt>PIC kotak</dt><dd>' + (mine.length ? mine.map(b => esc(b.box_id)).join(', ') : '—') + '</dd><dt>Notifikasi</dt><dd>' + perm + '</dd>' +
      '<dt>Sumber data</dt><dd>Google Sheets</dd><dt>Sinkron terakhir</dt><dd>' + (state.lastSync ? esc(state.lastSync.toLocaleString('id-ID')) : '—') + '</dd></dl>' +
      '<div class="actions">' + (notifSupported() && Notification.permission === 'default' ? '<button class="btn ghost" data-act="notif-on">Aktifkan notifikasi</button>' : '') +
      '<button class="btn ghost" data-act="pw-change">Ubah kata sandi</button>' +
      '<button class="btn danger" data-act="logout">Keluar</button></div>' +
      (isAdmin() ? '<a class="admin-card" href="#/pengguna"><span class="ic">' + ICON.user + '</span><span><b>Kelola pengguna</b><small>Tambah akun, ubah role, reset kata sandi, dan nonaktifkan akun di sheet User.</small></span>' + ICON.next + '</a>' : '') +
      '<h2 class="h2">Pasang di layar utama</h2><p class="lead" style="max-width:62ch">Android/Chrome: menu ⋮ lalu <b>Instal aplikasi</b>. iPhone/Safari: tombol Bagikan lalu <b>Tambahkan ke Layar Utama</b>. Setelah terpasang, P3K PRO terbuka layar penuh dan tetap bisa menampilkan data terakhir saat offline.</p>';
  }

  /* ---------------- kelola pengguna (Admin) ---------------- */
  async function loadUsers() {
    try { const r = await api('listUsers'); state.users = r.users; }
    catch (e) { state.users = []; toast(e.message, true); }
    if (location.hash.indexOf('#/pengguna') === 0) render();
  }

  function viewPengguna() {
    const back = '<a class="back" href="#/akun">' + ICON.back + 'Akun</a>';
    if (!isAdmin()) return back + '<div class="list"><div class="empty"><b>Khusus Admin</b>Halaman ini hanya untuk pengguna dengan role Admin.</div></div>';
    if (!state.users) { loadUsers(); return back + '<div class="spinner" role="status" aria-label="Memuat pengguna"></div>'; }
    const q = state.userQuery.toLowerCase();
    const list = state.users.filter(u => !q || (u.username + ' ' + u.nama + ' ' + u.role).toLowerCase().includes(q))
      .sort((x, y) => (y.aktif - x.aktif) || ROLE_ORDER[x.role] - ROLE_ORDER[y.role] || x.nama.localeCompare(y.nama));
    const count = r => state.users.filter(u => u.role === r && u.aktif).length;
    const plain = state.users.filter(u => !u.hashed).length;
    const rows = list.map(u =>
      '<button class="row urow' + (u.aktif ? '' : ' off') + '" data-act="user-edit" data-u="' + esc(u.username) + '">' +
      '<span class="avatar sm" aria-hidden="true">' + esc(initials(u.nama)) + '</span>' +
      '<span class="main"><span class="title">' + esc(u.nama) + '</span><span class="meta">NIK ' + esc(u.username) + (u.last_login ? ', login ' + esc(ago(u.last_login)) : ', belum pernah login') + '</span></span>' +
      '<span class="side"><span class="chip ' + ({ Admin: 'navy', Approver: 'amber', User: 'grey' }[u.role] || 'grey') + '">' + esc(u.role) + '</span>' + (u.aktif ? '' : '<span class="chip red">Nonaktif</span>') + '</span></button>').join('');
    return back + '<h1 class="h1">Kelola pengguna</h1><p class="lead">Data tersimpan di sheet User. ' + count('Admin') + ' Admin, ' + count('Approver') + ' Approver, ' + count('User') + ' User aktif.</p>' +
      (plain ? '<div class="perm"><p><b>' + plain + ' akun</b> masih memakai kata sandi teks biasa di sheet. Minta pengguna mengganti kata sandi lewat menu Akun, atau reset di sini; kata sandi baru selalu disimpan dalam bentuk hash.</p></div>' : '') +
      '<div class="searchbar"><input class="input" id="user-q" type="search" placeholder="Cari nama, NIK, atau role" value="' + esc(state.userQuery) + '" aria-label="Cari pengguna">' +
      '<button class="btn" data-act="user-add">+ Tambah</button></div>' +
      (list.length ? '<div class="list">' + rows + '</div>' : '<div class="list"><div class="empty"><b>Tidak ada pengguna yang cocok</b></div></div>');
  }
  const ROLE_ORDER = { Admin: 0, Approver: 1, User: 2 };

  function sheetUser(username) {
    const u = username ? state.users.find(x => x.username === username) : null;
    const self = u && u.username === state.me.nik;
    const body =
      '<label class="field"><span>NIK / username</span><input class="input" name="username" inputmode="numeric" autocomplete="off" required value="' + esc(u ? u.username : '') + '"' + (u ? ' readonly' : '') + '></label>' +
      '<label class="field"><span>Nama lengkap</span><input class="input" name="nama" required value="' + esc(u ? u.nama : '') + '"></label>' +
      '<label class="field"><span>Role</span><select class="input" name="role"' + (self ? ' disabled' : '') + '>' + ['User', 'Approver', 'Admin'].map(r => '<option' + ((u ? u.role : 'User') === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></label>' +
      '<label class="switch"><input type="checkbox" name="aktif"' + (!u || u.aktif ? ' checked' : '') + (self ? ' disabled' : '') + '><span class="track"></span><span>Akun aktif (bisa login)</span></label>' +
      '<label class="field"><span>' + (u ? 'Reset kata sandi (kosongkan jika tidak diubah)' : 'Kata sandi awal') + '</span><input class="input" name="password" type="text" autocomplete="new-password"' + (u ? '' : ' required') + ' placeholder="Min. 6 karakter, huruf dan angka"></label>' +
      (self ? '<p class="hint">Ini akun Anda sendiri: role dan status tidak bisa diubah dari sini.</p>' : '');
    openSheet(u ? 'Ubah pengguna' : 'Tambah pengguna', u ? esc(u.nama) + (u.created ? ', terdaftar ' + esc(fmtDate(u.created)) : '') : 'Pengguna baru langsung bisa login dengan NIK dan kata sandi awal ini.', body, u ? 'Simpan perubahan' : 'Tambah pengguna', async f => {
      await api('saveUser', { mode: u ? 'edit' : 'add', username: f.username.value.trim(), nama: f.nama.value.trim(),
        role: self ? u.role : f.role.value, aktif: self ? true : f.aktif.checked, password: f.password.value });
      toast(u ? 'Data pengguna disimpan.' : 'Pengguna ditambahkan.');
      await loadUsers();
    });
  }

  function sheetChangePw() {
    const body =
      '<label class="field"><span>Kata sandi lama</span><input class="input" type="password" name="old" autocomplete="current-password" required></label>' +
      '<label class="field"><span>Kata sandi baru</span><input class="input" type="password" name="new1" autocomplete="new-password" required placeholder="Min. 6 karakter, huruf dan angka"></label>' +
      '<label class="field"><span>Ulangi kata sandi baru</span><input class="input" type="password" name="new2" autocomplete="new-password" required></label>';
    openSheet('Ubah kata sandi', 'Berlaku untuk login berikutnya di semua perangkat.', body, 'Simpan kata sandi', async f => {
      if (f.new1.value !== f.new2.value) throw new Error('Kata sandi baru dan ulangannya tidak sama.');
      await api('changePassword', { old_password: f.old.value, new_password: f.new1.value });
      toast('Kata sandi berhasil diganti.');
    });
  }

  /* ---------------- sheets (forms) ---------------- */
  function openSheet(title, sub, bodyHtml, submitLabel, onSubmit, danger) {
    $sheet.innerHTML = '<div class="scrim" data-act="close-sheet"><form class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" novalidate>' +
      '<div class="sheet-head"><div style="flex:1"><h3 id="sh-t">' + esc(title) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><button type="button" class="icon-btn" data-act="close-sheet" aria-label="Tutup">' + ICON.x + '</button></div>' +
      '<div class="sheet-body">' + bodyHtml + '<div class="err" role="alert"></div></div>' +
      '<div class="sheet-foot"><button type="button" class="btn ghost" data-act="close-sheet">Batal</button><button type="submit" class="btn' + (danger ? ' danger' : '') + '">' + esc(submitLabel) + '</button></div></form></div>';
    const form = $sheet.querySelector('form');
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const btn = form.querySelector('[type=submit]'); const err = form.querySelector('.err');
      btn.disabled = true; err.textContent = '';
      try { await onSubmit(form); closeSheet(); } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    const first = form.querySelector('input:not([type=file]):not(.sr),textarea'); if (first) first.focus({ preventScroll: true });
  }
  function closeSheet() { $sheet.innerHTML = ''; }

  const stepper = (name, max, val) => '<div class="stepper"><button type="button" data-step="-1" aria-label="Kurangi">−</button><input type="number" inputmode="numeric" min="0"' + (max != null ? ' max="' + max + '"' : '') + ' name="' + name + '" value="' + (val || 0) + '"><button type="button" data-step="1" aria-label="Tambah">+</button></div>';

  function sheetUsage(boxId) {
    const items = state.data.stock.filter(s => s.box_id === boxId && s.qty > 0);
    const body = '<label class="field"><span>Keterangan</span><textarea class="input" name="keterangan" placeholder="Nama korban / kejadian, mis. luka gores tangan saat buka valve" required></textarea></label>' +
      items.map(s => '<div class="pick"><div class="name">' + esc(s.nama_item) + '</div>' + stepper('q_' + s.stok_id, s.qty, 0) + '<div class="sub">Sisa ' + s.qty + ' ' + esc(s.satuan) + (s.exp === 'expired' ? ' · <b style="color:var(--red)">kadaluwarsa</b>' : '') + '</div></div>').join('');
    openSheet('Catat pemakaian', 'Kotak ' + esc(boxId) + '. Stok langsung berkurang dan tercatat di riwayat penggunaan.', body, 'Catat pemakaian', async f => {
      const pick = items.map(s => ({ stok_id: s.stok_id, qty: +f['q_' + s.stok_id].value || 0 })).filter(i => i.qty > 0);
      await api('usage', { box_id: boxId, items: pick, keterangan: f.keterangan.value });
      toast('Pemakaian tercatat.'); await refresh(true);
    });
  }

  function sheetRequest(boxId, jenis) {
    const items = state.data.stock.filter(s => s.box_id === boxId);
    let body = '', sub = '', label = '';
    if (jenis === 'RESTOCK') {
      sub = 'Kotak ' + esc(boxId) + '. Jumlah yang ditambahkan dan tanggal ED baru. Stok bertambah setelah disetujui.';
      label = 'Kirim ajuan restock';
      const sorted = items.slice().sort((a, b) => (b.low - a.low) || ((b.exp === 'expired') - (a.exp === 'expired')));
      body = sorted.map(s => '<div class="pick"><div class="name">' + esc(s.nama_item) + '</div>' + stepper('q_' + s.stok_id, null, s.low ? s.min_stok - s.qty : 0) +
        '<div class="sub">Stok ' + s.qty + '/' + s.min_stok + (s.low ? ' · <b style="color:var(--blue)">kurang ' + (s.min_stok - s.qty) + '</b>' : '') + '</div>' +
        (s.expired ? '<div class="extra"><label>ED baru <input class="input" type="date" name="ed_' + s.stok_id + '"></label></div>' : '') + '</div>').join('');
    } else if (jenis === 'KOREKSI') {
      sub = 'Kotak ' + esc(boxId) + '. Isi jumlah fisik sebenarnya dan tanggal ED. Hanya baris yang diubah yang dikirim.';
      label = 'Kirim ajuan koreksi';
      body = items.map(s => '<div class="pick"><div class="name">' + esc(s.nama_item) + '</div>' + stepper('q_' + s.stok_id, null, s.qty) +
        '<div class="sub">Tercatat ' + s.qty + ' ' + esc(s.satuan) + '</div><div class="extra"><label>ED <input class="input" type="date" name="ed_' + s.stok_id + '" value="' + esc(s.expired || '') + '"></label></div></div>').join('');
    } else {
      sub = 'Kotak ' + esc(boxId) + '. Setelah disetujui, tercatat di sheet Purchase.';
      label = 'Kirim ajuan pembelian';
      body = items.map(s => '<div class="pick"><div class="name">' + esc(s.nama_item) + '</div>' + stepper('q_' + s.stok_id, null, s.low ? s.min_stok - s.qty : 0) + '<div class="sub">Stok ' + s.qty + '/' + s.min_stok + '</div></div>').join('');
    }
    body = '<label class="field"><span>Catatan untuk approver (opsional)</span><input class="input" name="catatan"></label>' + body;
    openSheet(jenis === 'RESTOCK' ? 'Ajukan restock' : jenis === 'KOREKSI' ? 'Koreksi stok & ED' : 'Ajukan pembelian', sub, body, label, async f => {
      let pick;
      if (jenis === 'KOREKSI') {
        pick = items.map(s => ({ stok_id: s.stok_id, qty: +f['q_' + s.stok_id].value, expired: f['ed_' + s.stok_id].value }))
          .filter((i, k) => i.qty !== items[k].qty || (i.expired || '') !== (items[k].expired || ''));
        if (!pick.length) throw new Error('Belum ada perubahan.');
      } else {
        pick = items.map(s => ({ stok_id: s.stok_id, qty: +f['q_' + s.stok_id].value || 0, expired: f['ed_' + s.stok_id] ? f['ed_' + s.stok_id].value : '' }))
          .filter(i => i.qty > 0 || (jenis === 'RESTOCK' && i.expired));
        if (!pick.length) throw new Error('Isi jumlah minimal satu item.');
      }
      await api('request', { jenis, box_id: boxId, items: pick, catatan: f.catatan.value.trim() });
      toast('Pengajuan terkirim ke approver.'); await refresh(true);
    });
  }

  function sheetDecide(id, keputusan) {
    const a = state.data.approvals.find(x => x.apv_id === id);
    const tolak = keputusan === 'Ditolak';
    openSheet(tolak ? 'Tolak pengajuan' : 'Setujui pengajuan', esc((JENIS[a.jenis] || a.jenis) + ', Kotak ' + a.box_id + ', oleh ' + a.pengaju_nama),
      '<label class="field"><span>' + (tolak ? 'Alasan penolakan' : 'Catatan (opsional)') + '</span><textarea class="input" name="alasan"' + (tolak ? ' required' : '') + '></textarea></label>',
      tolak ? 'Tolak pengajuan' : 'Setujui pengajuan', async f => {
        await api('decide', { apv_id: id, keputusan, alasan: f.alasan.value });
        toast(tolak ? 'Pengajuan ditolak.' : 'Pengajuan disetujui. Stok diperbarui.'); await refresh(true);
      }, tolak);
  }

  /* ---------------- router & render ---------------- */
  function render() {
    if (!isConfigured()) { $app.innerHTML = viewSetup(true); return; }
    if (state.showServer) { $app.innerHTML = viewSetup(false); return; }
    if (!state.token) { $app.innerHTML = viewLogin(); return; }
    if (!state.data) { $app.innerHTML = state.loadError ? viewLoadError() : '<div class="spinner" role="status" aria-label="Memuat"></div>'; return; }
    const parts = (location.hash.replace(/^#\/?/, '') || 'beranda').split('/').map(decodeURIComponent);
    let route = parts[0], html;
    switch (route) {
      case 'kotak': html = parts[1] ? viewBoxDetail(parts[1]) : viewKotak(); break;
      case 'notifikasi': html = viewNotif(parts[1]); break;
      case 'approval': html = viewApproval(parts[1]); break;
      case 'akun': html = viewAkun(); break;
      case 'foto': html = viewFoto(parts[1]); break;
      case 'pengguna': route = 'akun'; html = viewPengguna(); break;
      default: route = 'beranda'; html = viewBeranda();
    }
    const y = window.scrollY, keepScroll = render.last === location.hash;
    $app.innerHTML = shell(route, html);
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render.last = location.hash;
    document.title = 'P3K PRO' + (alertCount() ? ' (' + alertCount() + ')' : '');
  }

  window.addEventListener('hashchange', () => { closeSheet(); render(); });

  document.addEventListener('submit', e => {
    if (e.target.id === 'login-form') { e.preventDefault(); doLogin(e.target); }
    if (e.target.id === 'server-form') { e.preventDefault(); saveServer(e.target); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'user-q') {
      state.userQuery = e.target.value; const pos = e.target.selectionStart;
      render(); const el = document.getElementById('user-q'); el.focus(); el.setSelectionRange(pos, pos);
    }
    if (e.target.id === 'box-q') {
      state.boxQuery = e.target.value; const pos = e.target.selectionStart;
      render(); const el = document.getElementById('box-q'); el.focus(); el.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    if (step) {
      const inp = step.parentElement.querySelector('input'); const max = inp.max === '' ? Infinity : +inp.max;
      inp.value = Math.min(max, Math.max(0, (+inp.value || 0) + +step.dataset.step)); return;
    }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'close-sheet') { if (e.target === el || el.tagName === 'BUTTON') closeSheet(); return; }
    if (state.offline && /usage|restock|koreksi|beli|approve|reject|foto-upload/.test(act)) return toast('Sedang offline. Sambungkan internet untuk mengirim perubahan.', true);
    switch (act) {
      case 'server': state.showServer = true; render(); break;
      case 'server-close': state.showServer = false; render(); break;
      case 'server-reset': localStorage.removeItem('p3k_api_url'); state.showServer = false; render(); toast('Memakai URL dari config.js.'); break;
      case 'retry': state.loadError = ''; render(); refresh(); break;
      case 'sync': el.disabled = true; refresh().then(() => toast('Data terbaru dimuat.')); break;
      case 'usage': sheetUsage(el.dataset.box); break;
      case 'restock': sheetRequest(el.dataset.box, 'RESTOCK'); break;
      case 'koreksi': sheetRequest(el.dataset.box, 'KOREKSI'); break;
      case 'beli': sheetRequest(el.dataset.box, 'PEMBELIAN'); break;
      case 'approve': sheetDecide(el.dataset.id, 'Disetujui'); break;
      case 'reject': sheetDecide(el.dataset.id, 'Ditolak'); break;
      case 'foto-upload': sheetUpload(el.dataset.box, el.dataset.month); break;
      case 'foto-view': viewerPhotos(el.dataset.box, el.dataset.month); break;
      case 'notif-on': enableNotif(); break;
      case 'logout': doLogout(); break;
      case 'pw-change': sheetChangePw(); break;
      case 'user-add': sheetUser(); break;
      case 'user-edit': sheetUser(el.dataset.u); break;
    }
  });
  document.addEventListener('change', e => { if (e.target.matches('[data-photo-input]')) onPhotoPicked(e.target); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $sheet.innerHTML) closeSheet(); });

  // sinkron berkala saat aplikasi terlihat
  setInterval(() => { if (state.token && document.visibilityState === 'visible') refresh(true); }, (CFG.REFRESH_MINUTES || 5) * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.token && state.lastSync && Date.now() - state.lastSync > 60000) refresh(true);
  });
  window.addEventListener('online', () => state.token && refresh(true));

  /* ---------------- start ---------------- */
  if (state.token && isConfigured()) {
    const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (c) { state.data = c.d; state.lastSync = new Date(c.at); derive(); }
    render(); refresh(true);
  } else render();
})();
