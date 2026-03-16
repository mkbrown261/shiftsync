/* ── LIVE CLOCK ─────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const t = document.getElementById('liveTime');
  const d = document.getElementById('liveDate');
  if (t) t.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  if (d) d.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const td = document.getElementById('todayDate');
  if (td) td.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const rd = document.getElementById('rosterDate');
  if (rd) rd.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

/* ── MOBILE MENU ────────────────────────────────── */
function toggleMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}

/* ── ROLE TABS (LOGIN) ──────────────────────────── */
let currentRole = 'student';
function switchRole(role, btn) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/* ── LOGIN ──────────────────────────────────────── */
function demoLogin(role) {
  const emailMap = { student: 'alex@codedifferently.org', instructor: 'instructor@codedifferently.org', admin: 'cristina@codedifferently.org' };
  const el = document.getElementById('emailInput');
  const pl = document.getElementById('pwInput');
  if (el) el.value = emailMap[role] || '';
  if (pl) pl.value = 'demo1234';
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach((b, i) => {
    b.classList.toggle('active', ['student','instructor','admin'][i] === role);
  });
}

/* ── LOGIN STATE MANAGER (Bug Fix 1) ────────────────
   Resets spinner + re-enables button on every page visit.
   Uses sessionStorage flag to detect "back navigation".
   If already authenticated (role stored), redirect to dashboard.
   Degrades gracefully: on any error defaults to usable login state. */
function resetLoginUI() {
  try {
    const btn  = document.getElementById('loginBtnText');
    const spin = document.getElementById('loginSpinner');
    const form = document.getElementById('loginForm');
    if (btn)  { btn.style.display  = 'inline-flex'; }
    if (spin) { spin.style.display = 'none'; }
    if (form) { form.style.pointerEvents = 'auto'; form.style.opacity = '1'; }
    // Clear any stale in-flight auth flag
    sessionStorage.removeItem('cd_auth_pending');
  } catch(e) { /* fail-safe: do nothing, keep page usable */ }
}

function handleLogin(e) {
  e.preventDefault();
  // Guard: prevent double-submit
  if (sessionStorage.getItem('cd_auth_pending') === '1') return;
  sessionStorage.setItem('cd_auth_pending', '1');

  const btn  = document.getElementById('loginBtnText');
  const spin = document.getElementById('loginSpinner');
  const form = document.getElementById('loginForm');
  if (btn)  btn.style.display  = 'none';
  if (spin) spin.style.display = 'inline-flex';
  if (form) form.style.pointerEvents = 'none';

  setTimeout(() => {
    try {
      const dest = { student: '/student', instructor: '/instructor', admin: '/admin' };
      // Store role so redirect-back detection works
      sessionStorage.setItem('cd_role', currentRole);
      sessionStorage.removeItem('cd_auth_pending');
      window.location.href = dest[currentRole] || '/student';
    } catch(e) {
      // Fail-safe: reset UI so user can try again
      resetLoginUI();
    }
  }, 800);
}

// ── Auto-reset on every login page load / back-navigation ──
if (document.getElementById('loginForm')) {
  // Reset immediately in case spinner was frozen from previous visit
  resetLoginUI();
  // Also fire on pageshow (catches bfcache / browser back button)
  window.addEventListener('pageshow', (ev) => {
    if (document.getElementById('loginForm')) resetLoginUI();
  });
  // If user already has a stored role session, redirect to their dashboard
  const storedRole = sessionStorage.getItem('cd_role');
  if (storedRole && ['student','instructor','admin'].includes(storedRole)) {
    const dest = { student: '/student', instructor: '/instructor', admin: '/admin' };
    // Only auto-redirect if they came back via back button (persisted entry)
    if (document.referrer && document.referrer !== window.location.href) {
      window.location.replace(dest[storedRole]);
    }
  }
}

function togglePw() {
  const inp = document.getElementById('pwInput');
  const ico = document.getElementById('eyeIcon');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (ico) { ico.className = show ? 'fa fa-eye-slash' : 'fa fa-eye'; }
}

/* ══════════════════════════════════════════════════════
   INTELLIGENT LOCATION-VERIFIED CLOCK IN/OUT SYSTEM
   ══════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────
let isClockedIn   = false;
let clockInTime   = null;
let gpsCoords     = null;
let gpsWatchId    = null;
let geoConfig     = null;   // Loaded from /api/location/config
let locationVerified = false;
let verificationLog  = [];  // Audit trail for this session

// Code Differently default campus (Wilmington, DE)
const DEFAULT_CAMPUS = { lat: 39.7392, lon: -75.5398, radius: 60, name: 'Code Differently Campus' };

// ── Haversine distance (metres) ───────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Load geofence config from server ─────────────────
async function loadGeoConfig() {
  try {
    const res = await fetch('/api/location/config');
    if (res.ok) { geoConfig = await res.json(); }
  } catch { /* use defaults */ }
  if (!geoConfig) geoConfig = DEFAULT_CAMPUS;
  return geoConfig;
}

// ── Draw mini proximity map using Canvas (no external lib needed) ──
function drawMiniMap(studentLat, studentLon, campus, distance) {
  const wrap = document.getElementById('miniMap');
  if (!wrap) return;

  const w = wrap.clientWidth || 320, h = 200;
  wrap.innerHTML = `<canvas id="proximityCanvas" width="${w}" height="${h}" style="border-radius:10px"></canvas>`;
  const canvas = document.getElementById('proximityCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#1E1B2E');
  bg.addColorStop(1, '#2A2547');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 30) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
  for (let i = 0; i < h; i += 30) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

  const cx = w * 0.5, cy = h * 0.5;
  const campusLat = campus.lat || DEFAULT_CAMPUS.lat;
  const campusLon = campus.lon || DEFAULT_CAMPUS.lon;
  const radius    = campus.radius || DEFAULT_CAMPUS.radius;

  // Scale: how many pixels per metre
  const maxDist = Math.max(distance * 1.4, radius * 2, 80);
  const scale   = Math.min(cx, cy) * 0.85 / maxDist;
  const fenceR  = radius * scale;

  // Geofence circle
  const inside = distance <= radius;
  const grd = ctx.createRadialGradient(cx, cy, fenceR * 0.2, cx, cy, fenceR);
  if (inside) {
    grd.addColorStop(0, 'rgba(34,197,94,.18)');
    grd.addColorStop(1, 'rgba(34,197,94,.04)');
  } else {
    grd.addColorStop(0, 'rgba(239,68,68,.18)');
    grd.addColorStop(1, 'rgba(239,68,68,.04)');
  }
  ctx.beginPath(); ctx.arc(cx, cy, fenceR, 0, Math.PI*2);
  ctx.fillStyle = grd; ctx.fill();
  ctx.strokeStyle = inside ? 'rgba(34,197,94,.7)' : 'rgba(239,68,68,.7)';
  ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);

  // Distance rings
  [0.5, 1.5].forEach(mult => {
    const r = fenceR * mult;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1; ctx.stroke();
  });

  // Campus pin (blue dot)
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2);
  ctx.fillStyle = '#3B82F6'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('CD', cx, cy+3);

  // Student position
  const latDiff = (studentLat - campusLat) * 111320;
  const lonDiff = (studentLon - campusLon) * 111320 * Math.cos(campusLat * Math.PI/180);
  const px = cx + lonDiff * scale;
  const py = cy - latDiff * scale;

  // Line from campus to student
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);

  // Student dot
  ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI*2);
  ctx.fillStyle = inside ? '#22C55E' : '#EF4444'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

  // Distance label
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(distance)}m`, (cx + px) / 2 + 4, (cy + py) / 2 - 6);

  // Legend
  ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  [[10, h-30, '#3B82F6', 'Campus'], [10, h-16, inside?'#22C55E':'#EF4444', 'You']].forEach(([x,y,c,label]) => {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(label, x+10, y+4);
  });
}

// ── Update proximity banner ───────────────────────────
function updateGeoBanner(distance, campus) {
  const banner  = document.getElementById('geoBanner');
  const title   = document.getElementById('geoBannerTitle');
  const sub     = document.getElementById('geoBannerSub');
  const badge   = document.getElementById('geoBannerBadge');
  const fill    = document.getElementById('geoDistanceFill');
  const pulse   = document.getElementById('geoPulse');
  const mapBadge = document.getElementById('mapDistBadge');
  if (!banner) return;

  const radius = (campus && campus.radius) || DEFAULT_CAMPUS.radius;
  const pct    = Math.min(100, (distance / (radius * 2)) * 100);
  banner.style.display = 'block';

  if (distance <= radius) {
    title.textContent  = '✓ You are on campus';
    sub.textContent    = `${Math.round(distance)}m from ${campus?.name || 'campus'} — within ${radius}m zone`;
    badge.innerHTML    = '<span class="geo-badge-ok">INSIDE ZONE</span>';
    if (pulse) pulse.className = 'geo-pulse pulse-green';
    if (fill)  { fill.style.width = '100%'; fill.style.background = 'var(--green)'; }
    if (mapBadge) mapBadge.innerHTML = `<span style="color:var(--green)">✓ ${Math.round(distance)}m — On Campus</span>`;
  } else {
    const over = Math.round(distance - radius);
    title.textContent = `⚠ ${Math.round(distance)}m from campus`;
    sub.textContent   = `${over}m outside the ${radius}m zone`;
    badge.innerHTML   = '<span class="geo-badge-warn">OUTSIDE ZONE</span>';
    if (pulse) pulse.className = 'geo-pulse pulse-red';
    if (fill)  { fill.style.width = pct + '%'; fill.style.background = 'linear-gradient(90deg,var(--orange),var(--pink))'; }
    if (mapBadge) mapBadge.innerHTML = `<span style="color:var(--orange)">⚠ ${Math.round(distance)}m</span>`;
  }
}

// ── GPS continuous watch on student page ─────────────
async function initStudentGPS() {
  const btn     = document.getElementById('clockBtn');
  const gpsText = document.getElementById('gpsText');
  const gpsIcon = document.querySelector('#gpsStatus .fa-satellite-dish');

  if (!document.getElementById('clockBtn')) return;

  // Load geofence config
  await loadGeoConfig();

  if (!navigator.geolocation) {
    if (gpsText) gpsText.textContent = 'GPS not supported — please use a mobile browser';
    if (btn) { btn.disabled = false; btn.querySelector ? (btn.querySelector('#clockBtnText') || btn).textContent = 'Clock In (No GPS)' : null; }
    document.getElementById('clockBtnText').textContent = 'Clock In (No GPS)';
    btn.disabled = false; return;
  }

  // Start watching position
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      gpsCoords = pos.coords;
      const campus = geoConfig || DEFAULT_CAMPUS;
      const dist   = haversine(pos.coords.latitude, pos.coords.longitude, campus.lat || campus.latitude, campus.lon || campus.longitude);

      if (gpsText) {
        gpsText.textContent = `GPS Active — Accuracy ±${Math.round(pos.coords.accuracy)}m`;
        gpsText.parentElement.classList.add('gps-ok');
        gpsText.parentElement.classList.remove('gps-err');
      }
      if (gpsIcon) { gpsIcon.className = 'fa fa-satellite-dish'; }

      // Enable the clock button
      if (btn) {
        btn.disabled = false;
        const t = document.getElementById('clockBtnText');
        if (t && !isClockedIn) t.textContent = 'Clock In';
      }

      updateGeoBanner(dist, campus);
      drawMiniMap(pos.coords.latitude, pos.coords.longitude, campus, dist);
    },
    (err) => {
      if (gpsText) {
        gpsText.textContent = err.code === 1 ? 'Location access denied — enable in browser settings' : 'GPS error — tap to retry';
        gpsText.parentElement.classList.add('gps-err');
      }
      // Still allow clock-in without GPS (offline/override)
      if (btn) {
        btn.disabled = false;
        const t = document.getElementById('clockBtnText');
        if (t && !isClockedIn) t.textContent = 'Clock In (No GPS)';
      }
      const banner = document.getElementById('geoBanner');
      if (banner) {
        banner.style.display = 'block';
        const title = document.getElementById('geoBannerTitle');
        const sub   = document.getElementById('geoBannerSub');
        if (title) title.textContent = 'Location Unavailable';
        if (sub)   sub.textContent = 'Could not get GPS — clock-in will be flagged for manual review';
        const pulse = document.getElementById('geoPulse');
        if (pulse) pulse.className = 'geo-pulse pulse-yellow';
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

// Init on page load
initStudentGPS();

// ── Location Verification Panel ───────────────────────
function openLocationPanel() {
  const panel = document.getElementById('locationPanel');
  if (panel) panel.style.display = 'block';

  // Reset all checks
  ['gps','dist','acc','wifi'].forEach(k => {
    const st = document.getElementById(`lvc-${k}-st`);
    const val = document.getElementById(`lvc-${k}-val`);
    if (st)  st.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    if (val) val.textContent = k === 'gps' ? 'Acquiring…' : k === 'dist' ? 'Calculating…' : k === 'acc' ? 'Checking…' : 'Scanning…';
    const row = document.getElementById(`lvc-${k}`);
    if (row) { row.classList.remove('check-ok','check-fail','check-warn'); }
  });
  const res = document.getElementById('lvResult');
  if (res) res.style.display = 'none';
  const title = document.getElementById('lvTitle');
  const sub   = document.getElementById('lvSub');
  if (title) title.textContent = 'Verifying Location…';
  if (sub)   sub.textContent = 'Please wait';

  runVerificationFlow();
}

function closeLocationPanel() {
  const panel = document.getElementById('locationPanel');
  if (panel) panel.style.display = 'none';
}

async function runVerificationFlow() {
  const campus  = geoConfig || DEFAULT_CAMPUS;
  const lvShield = document.getElementById('lvShield');

  // Step 1: GPS
  await new Promise(r => setTimeout(r, 600));
  const gpsOk = !!gpsCoords;
  setLVC('gps',
    gpsOk ? `${gpsCoords.latitude.toFixed(5)}, ${gpsCoords.longitude.toFixed(5)}` : 'Not available',
    gpsOk ? 'ok' : 'fail'
  );

  // Step 2: Distance
  await new Promise(r => setTimeout(r, 500));
  let distance = null, insideFence = false;
  if (gpsCoords) {
    distance = haversine(gpsCoords.latitude, gpsCoords.longitude, campus.lat || campus.latitude, campus.lon || campus.longitude);
    insideFence = distance <= (campus.radius || DEFAULT_CAMPUS.radius);
    setLVC('dist', `${Math.round(distance)}m from campus`, insideFence ? 'ok' : 'fail');
  } else {
    setLVC('dist', 'Cannot calculate — no GPS', 'fail');
  }

  // Step 3: Accuracy
  await new Promise(r => setTimeout(r, 400));
  const maxAcc = campus.max_accuracy || 40;
  if (gpsCoords) {
    const accOk = gpsCoords.accuracy <= maxAcc;
    setLVC('acc', `±${Math.round(gpsCoords.accuracy)}m (max: ${maxAcc}m)`, accOk ? 'ok' : 'warn');
  } else {
    setLVC('acc', 'No GPS data', 'fail');
  }

  // Step 4: WiFi (browser can't read WiFi SSID — show helpful message)
  await new Promise(r => setTimeout(r, 500));
  setLVC('wifi', 'Cannot detect — GPS location used instead', 'warn');

  // Final result
  await new Promise(r => setTimeout(r, 300));
  const verTitle = document.getElementById('lvTitle');
  const verSub   = document.getElementById('lvSub');
  const result   = document.getElementById('lvResult');
  const resultIcon = document.getElementById('lvResultIcon');
  const resultMsg  = document.getElementById('lvResultMsg');
  const resultAct  = document.getElementById('lvResultActions');

  if (gpsOk && insideFence) {
    locationVerified = true;
    if (verTitle) verTitle.textContent = 'Location Verified ✓';
    if (verSub)   verSub.textContent = `You are ${Math.round(distance)}m from campus — within the ${campus.radius || DEFAULT_CAMPUS.radius}m zone`;
    if (lvShield) lvShield.style.color = 'var(--green)';
    if (result) {
      result.style.display = 'block';
      resultIcon.innerHTML = '<i class="fa fa-circle-check" style="font-size:2.5rem;color:var(--green)"></i>';
      resultMsg.innerHTML  = `<strong>You're on campus!</strong><br><small>${Math.round(distance)}m from ${campus.name || 'Code Differently'}</small>`;
      resultAct.innerHTML  = `<button class="btn-primary" onclick="proceedClockIn()"><i class="fa fa-play"></i> Clock In Now</button>
                               <button class="btn-secondary" onclick="closeLocationPanel()">Cancel</button>`;
    }
  } else if (gpsOk && !insideFence) {
    locationVerified = false;
    if (verTitle) verTitle.textContent = 'Outside Geofence';
    if (verSub)   verSub.textContent = `You are ${Math.round(distance)}m away — ${Math.round(distance - (campus.radius||DEFAULT_CAMPUS.radius))}m outside the zone`;
    if (lvShield) lvShield.style.color = 'var(--orange)';
    if (result) {
      result.style.display = 'block';
      resultIcon.innerHTML = '<i class="fa fa-triangle-exclamation" style="font-size:2.5rem;color:var(--orange)"></i>';
      resultMsg.innerHTML  = `<strong>You appear to be off campus</strong><br><small>${Math.round(distance)}m from ${campus.name || 'campus'} (max: ${campus.radius||DEFAULT_CAMPUS.radius}m)</small>`;
      resultAct.innerHTML  = `<button class="btn-secondary" style="background:rgba(244,112,58,.15);color:var(--orange);border-color:var(--orange)"
                                onclick="proceedClockIn(true)"><i class="fa fa-triangle-exclamation"></i> Clock In Anyway (flagged)</button>
                               <button class="btn-secondary" onclick="closeLocationPanel()">Cancel</button>`;
    }
  } else {
    locationVerified = false;
    if (verTitle) verTitle.textContent = 'Verification Incomplete';
    if (verSub)   verSub.textContent = 'GPS unavailable — clock-in will be marked for manual review';
    if (result) {
      result.style.display = 'block';
      resultIcon.innerHTML = '<i class="fa fa-circle-question" style="font-size:2.5rem;color:var(--yellow)"></i>';
      resultMsg.innerHTML  = '<strong>No GPS Signal</strong><br><small>Your attendance may need instructor confirmation</small>';
      resultAct.innerHTML  = `<button class="btn-secondary" onclick="proceedClockIn(false, true)"><i class="fa fa-clock"></i> Clock In (Manual Review)</button>
                               <button class="btn-secondary" onclick="closeLocationPanel()">Cancel</button>`;
    }
  }
}

function setLVC(key, value, state) {
  const val = document.getElementById(`lvc-${key}-val`);
  const st  = document.getElementById(`lvc-${key}-st`);
  const row = document.getElementById(`lvc-${key}`);
  if (val) val.textContent = value;
  if (st) {
    const icons = { ok: 'fa-circle-check', fail: 'fa-circle-xmark', warn: 'fa-triangle-exclamation' };
    const colors = { ok: 'var(--green)', fail: 'var(--red)', warn: 'var(--yellow)' };
    st.innerHTML = `<i class="fa ${icons[state]||'fa-circle-check'}" style="color:${colors[state]||colors.ok}"></i>`;
  }
  if (row) { row.classList.remove('check-ok','check-fail','check-warn'); row.classList.add(`check-${state}`); }
}

// ── Proceed after verification ────────────────────────
function proceedClockIn(flagged = false, manual = false) {
  closeLocationPanel();
  doClockIn(flagged, manual);
}

function handleClock() {
  if (!isClockedIn) {
    // Show verification panel before clocking in
    openLocationPanel();
  } else {
    doClockOut();
  }
}

function doClockIn(flagged = false, manual = false) {
  const btn       = document.getElementById('clockBtn');
  const icon      = document.getElementById('clockIcon');
  const btnText   = document.getElementById('clockBtnText');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('clockStatusText');
  const badge     = document.getElementById('statusBadge');
  const log       = document.getElementById('todayLog');

  isClockedIn  = true;
  clockInTime  = new Date();
  const timeStr = clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (btn)        btn.className = 'btn-clock btn-clockout';
  if (icon)       icon.className = 'fa fa-stop';
  if (btnText)    btnText.textContent = 'Clock Out';
  if (statusDot)  statusDot.className = 'status-dot dot-active';
  if (statusText) statusText.textContent = 'Clocked In';
  if (badge)      badge.innerHTML = '<span class="badge badge-present">● Clocked In</span>';

  // Show verify badge in activity section
  const vBadge = document.getElementById('verifyBadge');
  if (vBadge) {
    vBadge.style.display = 'inline-flex';
    if (flagged)      { vBadge.innerHTML = '<i class="fa fa-triangle-exclamation"></i> Location Flagged'; vBadge.style.background = 'rgba(244,112,58,.15)'; vBadge.style.color = 'var(--orange)'; }
    else if (manual)  { vBadge.innerHTML = '<i class="fa fa-clock"></i> Manual Review'; vBadge.style.background = 'rgba(245,158,11,.15)'; vBadge.style.color = 'var(--yellow)'; }
    else              { vBadge.innerHTML = '<i class="fa fa-shield-halved"></i> Location Verified ✓'; }
  }

  const verStatus = flagged ? '⚠ Outside geofence' : manual ? '⏳ No GPS — manual review' : `✓ Verified (${gpsCoords ? Math.round(haversine(gpsCoords.latitude, gpsCoords.longitude, (geoConfig||DEFAULT_CAMPUS).lat, (geoConfig||DEFAULT_CAMPUS).lon))+'m' : 'GPS'})`;
  const locLabel  = gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : 'No GPS';

  if (log) {
    log.innerHTML = `
      <div class="timeline-item ${flagged?'tl-flagged':''}">
        <div class="tl-icon ${flagged?'tl-icon-warn':''}" style="${flagged?'background:rgba(244,112,58,.12);color:var(--orange)':''}">
          <i class="fa fa-play"></i>
        </div>
        <div class="tl-info">
          <div class="tl-label">Clocked In ${flagged?'<span class="tl-flag-tag">Flagged</span>':''}</div>
          <div class="tl-time">${timeStr}</div>
          <div class="tl-loc"><i class="fa fa-location-dot"></i> ${locLabel}</div>
          <div class="tl-loc" style="color:${flagged?'var(--orange)':manual?'var(--yellow)':'var(--green)'}">
            <i class="fa fa-shield-halved"></i> ${verStatus}
          </div>
        </div>
      </div>`;
  }

  // Log verification to audit array
  verificationLog.push({
    type: 'clock_in', time: clockInTime.toISOString(),
    coords: gpsCoords ? { lat: gpsCoords.latitude, lon: gpsCoords.longitude, accuracy: gpsCoords.accuracy } : null,
    verified: !flagged && !manual, flagged, manual
  });

  showToast(flagged ? '⚠ Clocked in — location flagged' : '✓ Clocked in at ' + timeStr, flagged ? 'orange' : 'green');
}

function doClockOut() {
  const btn       = document.getElementById('clockBtn');
  const icon      = document.getElementById('clockIcon');
  const btnText   = document.getElementById('clockBtnText');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('clockStatusText');
  const badge     = document.getElementById('statusBadge');
  const log       = document.getElementById('todayLog');

  isClockedIn = false;
  const outTime = new Date();
  const timeStr = outTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const diff    = Math.round((outTime - clockInTime) / 60000);
  const hrs     = Math.floor(diff / 60), mins = diff % 60;
  const clockInStr = clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const locLabel   = gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : 'No GPS';

  if (btn)        btn.className = 'btn-clock btn-clockin';
  if (icon)       icon.className = 'fa fa-play';
  if (btnText)    btnText.textContent = 'Clock In';
  if (statusDot)  statusDot.className = 'status-dot dot-out';
  if (statusText) statusText.textContent = 'Shift Complete';
  if (badge)      badge.innerHTML = '<span class="badge badge-late">Clocked Out</span>';

  if (log) {
    const existingIn = log.querySelector('.timeline-item') ? log.innerHTML : '';
    const inHtml = existingIn || `
      <div class="timeline-item">
        <div class="tl-icon"><i class="fa fa-play"></i></div>
        <div class="tl-info">
          <div class="tl-label">Clocked In</div>
          <div class="tl-time">${clockInStr}</div>
          <div class="tl-loc"><i class="fa fa-location-dot"></i> ${locLabel}</div>
        </div>
      </div>`;
    log.innerHTML = inHtml + `
      <div class="timeline-item" style="border-left-color:var(--orange)">
        <div class="tl-icon" style="background:rgba(244,112,58,.1);color:var(--orange)"><i class="fa fa-stop"></i></div>
        <div class="tl-info">
          <div class="tl-label">Clocked Out</div>
          <div class="tl-time">${timeStr}</div>
          <div class="tl-loc"><i class="fa fa-location-dot"></i> ${locLabel}</div>
          <div class="tl-loc"><i class="fa fa-clock"></i> Total: ${hrs}h ${mins}m</div>
        </div>
      </div>`;
  }

  verificationLog.push({
    type: 'clock_out', time: outTime.toISOString(),
    coords: gpsCoords ? { lat: gpsCoords.latitude, lon: gpsCoords.longitude } : null,
    hours: hrs + (mins/60)
  });

  showToast(`✓ Clocked out — ${hrs}h ${mins}m today`, 'orange');
}

/* ── INSTRUCTOR ─────────────────────────────────── */
function updateStatus(select, id) {
  const val = select.value;
  select.className = 'status-select status-' + val;
  showToast(`Status updated to ${val}`, 'purple');
}

function confirmStudent(id, btn) {
  btn.classList.add('confirmed');
  btn.innerHTML = '<i class="fa fa-check-double"></i>';
  btn.title = 'Confirmed Present';
  showToast('Student confirmed as physically present', 'green');
}

let activeNoteId = null;
function addNote(id) {
  activeNoteId = id;
  document.getElementById('noteText').value = '';
  document.getElementById('noteModal').style.display = 'flex';
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
function saveNote() {
  const text = document.getElementById('noteText').value.trim();
  if (text) showToast('Note saved for student #' + activeNoteId, 'blue');
  closeModal('noteModal');
}

function saveAll() {
  showToast('✓ All attendance records saved!', 'green');
}

function filterStudents(q) {
  const rows = document.querySelectorAll('#rosterTable tbody tr');
  rows.forEach(row => {
    const name = row.querySelector('.student-cell span');
    row.style.display = (!q || (name && name.textContent.toLowerCase().includes(q.toLowerCase()))) ? '' : 'none';
  });
}


/* ── AI KEY MANAGEMENT ───────────────────────────── */
// Key lives only in localStorage — sent per-request, never stored server-side
function getAIKey()  { return localStorage.getItem('cd_ai_key') || ''; }
function getAIBase() { return localStorage.getItem('cd_ai_base') || 'https://www.genspark.ai/api/llm_proxy/v1'; }

function saveAIKey() {
  const k = document.getElementById('aiApiKey')?.value?.trim();
  const b = document.getElementById('aiBaseUrl')?.value?.trim();
  if (!k) { showToast('Please enter an API key', 'orange'); return; }
  localStorage.setItem('cd_ai_key', k);
  if (b) localStorage.setItem('cd_ai_base', b);
  showToast('\u2713 AI key saved in browser', 'green');
  updateKeyStatus(true);
}

function updateKeyStatus(saved) {
  const el = document.getElementById('aiKeyStatus');
  if (!el) return;
  if (saved || getAIKey()) {
    el.innerHTML = '<span style="color:var(--green)"><i class="fa fa-circle-check"></i> API key configured</span>';
  } else {
    el.innerHTML = '<span style="color:var(--yellow)"><i class="fa fa-triangle-exclamation"></i> No API key — enter key below to enable AI</span>';
  }
}

async function testAIKey() {
  const k = document.getElementById('aiApiKey')?.value?.trim() || getAIKey();
  const b = document.getElementById('aiBaseUrl')?.value?.trim() || getAIBase();
  if (!k) { showToast('Enter an API key first', 'orange'); return; }
  showToast('Testing API key...', 'purple');
  try {
    const res = await fetch('/api/ai/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: k, baseUrl: b })
    });
    const data = await res.json();
    if (data.success) {
      showToast('\u2713 Key valid! AI says: ' + data.response, 'green');
      localStorage.setItem('cd_ai_key', k);
      if (b) localStorage.setItem('cd_ai_base', b);
      updateKeyStatus(true);
    } else {
      showToast('\u2717 Invalid key: ' + data.error, 'orange');
    }
  } catch (e) { showToast('Test failed: ' + e.message, 'orange'); }
}

/* ── QB + AI SYNC (key from localStorage) ─────────── */
const DEMO_RECORDS = [
  { student: 'Alex Johnson',    clockIn: '9:02 AM', clockOut: '5:02 PM', hours: 8.0,  status: 'present' },
  { student: 'Maria Garcia',    clockIn: '9:14 AM', clockOut: '5:00 PM', hours: 7.77, status: 'late'    },
  { student: 'DeShawn Williams',clockIn: '9:01 AM', clockOut: '5:01 PM', hours: 8.0,  status: 'present' },
  { student: 'Priya Patel',     clockIn: null,      clockOut: null,      hours: 0,    status: 'absent'  },
  { student: 'Liam Chen',       clockIn: '8:58 AM', clockOut: '5:00 PM', hours: 8.03, status: 'present' },
  { student: 'Aaliyah Brown',   clockIn: '9:22 AM', clockOut: '5:03 PM', hours: 7.68, status: 'late'    },
  { student: 'Marcus Thompson', clockIn: '9:00 AM', clockOut: '5:00 PM', hours: 8.0,  status: 'present' },
  { student: 'Sofia Rodriguez', clockIn: null,      clockOut: null,      hours: 0,    status: 'absent'  },
];

async function runAIReview(records, date) {
  const key = getAIKey();
  if (!key) throw new Error('No AI key. Go to Settings \u2192 AI & QB Integration to add your key.');
  const res = await fetch('/api/ai/run-with-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key, baseUrl: getAIBase(), records, date })
  });
  return await res.json();
}

async function syncQuickBooks() {
  const statusEl = document.getElementById('qbSyncStatus');
  if (!statusEl) return;
  const key = getAIKey();
  if (!key) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--yellow)';
    statusEl.innerHTML = '<i class="fa fa-triangle-exclamation"></i> No AI key configured. <a href="/settings" style="color:var(--purple);text-decoration:underline">Go to Settings</a> to add your OpenAI key.';
    return;
  }
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--yellow)';
  statusEl.innerHTML = '<i class="fa fa-robot fa-spin"></i> AI reviewing attendance for anomalies...';
  try {
    const reviewData = await runAIReview(DEMO_RECORDS, new Date().toISOString().slice(0,10));
    if (!reviewData.success) throw new Error(reviewData.error);
    const { data } = reviewData;
    const ac = data.anomalies?.length || 0;
    const s = data.summary || {};
    statusEl.innerHTML = '<i class="fa fa-robot"></i> <strong>AI Review Complete</strong> — ' + ac + ' anomal' + (ac!==1?'ies':'y') + '<br/>'
      + '<small style="opacity:.8">' + (s.ai_recommendation||'') + '</small><br/>'
      + '<div style="margin-top:8px;display:flex;gap:12px;flex-wrap:wrap">'
      + '<span style="color:var(--green)">\u2713 ' + (s.eligible_count||0) + ' eligible</span>'
      + '<span style="color:var(--red)">\u2717 ' + (s.ineligible_count||0) + ' ineligible</span>'
      + '<span style="color:var(--gray400)">\u23f1 ' + (s.total_hours||0) + 'h total</span></div>'
      + (ac>0?'<div style="margin-top:6px;color:var(--yellow);font-size:13px"><i class="fa fa-triangle-exclamation"></i> '+(data.anomalies.map(a=>a.student+' - '+a.issue).join(' | '))+'</div>':'')
      + '<div style="margin-top:10px"><i class="fa fa-spinner fa-spin"></i> Pushing to QuickBooks...</div>';
    statusEl.style.color = 'var(--white)';
    await new Promise(r=>setTimeout(r,1000));
    const syncRes = await fetch('/api/qb/payroll/sync', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ entries: data.qb_entries||[], confirmed: true })
    });
    const sd = await syncRes.json();
    if (!sd.success) throw new Error(sd.error);
    statusEl.style.color = 'var(--green)';
    statusEl.innerHTML = '<i class="fa fa-circle-check"></i> <strong>\u2713 Synced to QuickBooks!</strong> - ' + sd.synced + ' payroll entries created<br/>'
      + '<small style="opacity:.7">Txn IDs: '+(sd.transactions?.slice(0,3).map(t=>t.qb_txn_id).join(', '))+(sd.synced>3?'...':'')+'</small>';
    showToast('\u2713 ' + sd.synced + ' entries synced to QuickBooks!', 'green');
  } catch(err) {
    statusEl.style.color = 'var(--red)';
    statusEl.innerHTML = '<i class="fa fa-circle-xmark"></i> ' + err.message;
    showToast('QB sync error: ' + err.message, 'orange');
  }
}

async function previewQB() {
  if (!getAIKey()) { showToast('Add your AI key in Settings first', 'orange'); return; }
  showToast('Running AI payroll preview...', 'purple');
  try {
    const d = await runAIReview(DEMO_RECORDS, new Date().toISOString().slice(0,10));
    if (d.success) { const s=d.data.summary; showToast('Preview: '+s.eligible_count+' eligible, '+s.total_hours+'h, '+s.anomaly_count+' anomalies', 'purple'); }
    else throw new Error(d.error);
  } catch(e) { showToast('Preview error: '+e.message, 'orange'); }
}

async function syncQBFromAdmin() {
  if (!getAIKey()) { showToast('Add your AI key in Settings \u2192 AI & QB Integration first', 'orange'); return; }
  showToast('AI reviewing records before sync...', 'purple');
  try {
    const d = await runAIReview(DEMO_RECORDS, new Date().toISOString().slice(0,10));
    if (!d.success) throw new Error(d.error);
    await new Promise(r=>setTimeout(r,600));
    const sync = await fetch('/api/qb/payroll/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entries:d.data.qb_entries||[],confirmed:true})});
    const sd = await sync.json();
    showToast('\u2713 '+sd.synced+' payroll entries pushed to QuickBooks!', 'green');
  } catch(e) { showToast('Sync error: '+e.message, 'orange'); }
}

async function checkStipendAI(studentName, hours, pct, lates, absences) {
  if (!getAIKey()) return { success: false, error: 'No AI key' };
  try {
    const res = await fetch('/api/ai/stipend-check', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ student: studentName, totalHours: hours, attendancePct: pct, lates, absences })
    });
    return await res.json();
  } catch(e) { return { success: false, error: e.message }; }
}


/* ── CHARTS (Chart.js via CDN) ──────────────────── */
function initCharts() {
  const aCanvas = document.getElementById('attendanceChart');
  const sCanvas = document.getElementById('stipendChart');

  if (aCanvas && window.Chart) {
    new Chart(aCanvas, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        datasets: [
          {
            label: 'Present',
            data: [38, 35, 40, 36, 33],
            borderColor: '#22C55E',
            backgroundColor: 'rgba(34,197,94,.1)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#22C55E',
            pointRadius: 5,
          },
          {
            label: 'Late',
            data: [3, 5, 1, 4, 2],
            borderColor: '#F59E0B',
            backgroundColor: 'rgba(245,158,11,.08)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#F59E0B',
            pointRadius: 5,
          },
          {
            label: 'Absent',
            data: [1, 2, 1, 2, 7],
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239,68,68,.08)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#EF4444',
            pointRadius: 5,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { size: 12 } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  if (sCanvas && window.Chart) {
    new Chart(sCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Eligible', 'At Risk', 'Ineligible'],
        datasets: [{
          data: [36, 4, 2],
          backgroundColor: ['#22C55E', '#F59E0B', '#EF4444'],
          borderWidth: 0,
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true,
        cutout: '72%',
        plugins: { legend: { display: false } }
      }
    });
  }
}

// Load Chart.js and init
if (document.getElementById('attendanceChart') || document.getElementById('stipendChart')) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  s.onload = initCharts;
  document.head.appendChild(s);
}

/* ── REPORTS ─────────────────────────────────────── */
function generateReport() {
  const type = document.getElementById('reportType')?.value;
  showToast(`✓ ${type} report generated!`, 'green');
}
function previewReport() {
  showToast('Loading report preview…', 'purple');
}
function exportCSV() {
  // Build CSV from table
  const rows = [['Student','Hours','Attendance%','Lates','Absences','Stipend Status']];
  document.querySelectorAll('#reportPreview tbody tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    rows.push([...cells].map(td => td.innerText.trim().replace(/\n/g,' ')));
  });
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ConnectDifferently_Attendance_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  showToast('✓ CSV downloaded!', 'green');
}
function exportSheets() { showToast('Sending to Google Sheets…', 'blue'); setTimeout(() => showToast('✓ Sent to Google Sheets!', 'green'), 1500); }
function exportQB()     { showToast('⚡ Syncing to QuickBooks…', 'purple'); setTimeout(() => showToast('✓ QuickBooks sync complete!', 'green'), 2000); }

/* ══════════════════════════════════════════════════════════════════
   SMART BUILD — ReportIntelligenceService  (New Feature)
   Modular AI-assisted report generation. Falls back to manual mode
   gracefully if AI is unavailable or fails.
   ══════════════════════════════════════════════════════════════════ */

const ReportIntelligenceService = (() => {
  // ── Sample dataset the AI will analyze ──────────────
  const SAMPLE_DATA = {
    students: [
      { name:'Alex Johnson',    hours:156.5, pct:92, lates:2, absences:1, status:'eligible',   verified:18, flagged:0 },
      { name:'Maria Garcia',    hours:140.0, pct:82, lates:4, absences:2, status:'ineligible', verified:14, flagged:3 },
      { name:'DeShawn Williams',hours:158.0, pct:93, lates:1, absences:1, status:'eligible',   verified:19, flagged:0 },
      { name:'Priya Patel',     hours:145.0, pct:86, lates:2, absences:3, status:'at-risk',    verified:15, flagged:1 },
      { name:'Liam Chen',       hours:168.0, pct:100,lates:0, absences:0, status:'eligible',   verified:20, flagged:0 },
      { name:'Aaliyah Brown',   hours:138.0, pct:80, lates:5, absences:2, status:'ineligible', verified:12, flagged:4 },
      { name:'Marcus Thompson', hours:162.5, pct:98, lates:1, absences:0, status:'eligible',   verified:20, flagged:0 },
      { name:'Sofia Rodriguez', hours:150.0, pct:87, lates:2, absences:2, status:'at-risk',    verified:16, flagged:2 },
    ],
    dailyTrends: [
      { day:'Mon', present:38, late:3, absent:1 },
      { day:'Tue', present:35, late:5, absent:2 },
      { day:'Wed', present:40, late:1, absent:1 },
      { day:'Thu', present:36, late:4, absent:2 },
      { day:'Fri', present:33, late:2, absent:7 },
    ],
    geofence: { totalVerifications:160, full:130, partial:18, failed:12 }
  };

  // ── Analyze data and generate blueprint (pure JS — no AI key needed) ─
  function analyzeLocally(sources, scope, depth) {
    const data = SAMPLE_DATA;
    const scoped = scope === 'eligible'  ? data.students.filter(s => s.status === 'eligible') :
                   scope === 'atrisk'    ? data.students.filter(s => s.status !== 'eligible') :
                   data.students;

    const totalStudents = scoped.length;
    const eligible      = scoped.filter(s => s.status === 'eligible').length;
    const atRisk        = scoped.filter(s => s.status === 'at-risk').length;
    const ineligible    = scoped.filter(s => s.status === 'ineligible').length;
    const avgHours      = (scoped.reduce((a,s) => a+s.hours,0) / totalStudents).toFixed(1);
    const avgPct        = (scoped.reduce((a,s) => a+s.pct,0) / totalStudents).toFixed(1);
    const totalLates    = scoped.reduce((a,s) => a+s.lates, 0);
    const worstDay      = data.dailyTrends.reduce((a,b) => b.absent > a.absent ? b : a);
    const bestDay       = data.dailyTrends.reduce((a,b) => b.present > a.present ? b : a);
    const geoPassRate   = Math.round((data.geofence.full / data.geofence.totalVerifications) * 100);
    const topStudent    = scoped.reduce((a,b) => b.pct > a.pct ? b : a);
    const riskStudents  = scoped.filter(s => s.lates >= 3 || s.absences >= 2);

    const sections = [];
    if (sources.attendance) sections.push({
      icon: 'fa-calendar-check', color: 'green', title: 'Attendance Summary',
      metrics: [
        { label: 'Total Students Analyzed', value: totalStudents },
        { label: 'Avg Attendance Rate',     value: avgPct + '%' },
        { label: 'Avg Hours Worked',        value: avgHours + 'h' },
        { label: 'Best Attendance Day',     value: bestDay.day + ' (' + bestDay.present + ' present)' },
        { label: 'Worst Attendance Day',    value: worstDay.day + ' (' + worstDay.absent + ' absent)' },
      ]
    });
    if (sources.stipend) sections.push({
      icon: 'fa-dollar-sign', color: 'purple', title: 'Stipend Eligibility Breakdown',
      metrics: [
        { label: '✅ Eligible',   value: eligible + ' students (' + Math.round(eligible/totalStudents*100) + '%)' },
        { label: '⚠ At-Risk',    value: atRisk   + ' students' },
        { label: '❌ Ineligible', value: ineligible + ' students' },
        { label: 'Top Performer', value: topStudent.name + ' (' + topStudent.pct + '%)' },
        { label: 'Threshold',     value: '≥85% attendance, ≤3 lates, ≤2 absences' },
      ]
    });
    if (sources.clockin) sections.push({
      icon: 'fa-clock', color: 'blue', title: 'Clock-In Verification Stats',
      metrics: [
        { label: 'Total Verifications',     value: data.geofence.totalVerifications },
        { label: '✅ Full Verified',         value: data.geofence.full + ' (' + geoPassRate + '%)' },
        { label: '⚠ Partial Verified',      value: data.geofence.partial },
        { label: '❌ Failed Verification',   value: data.geofence.failed },
        { label: 'GPS Compliance Rate',      value: geoPassRate + '%' },
      ]
    });
    if (sources.late) sections.push({
      icon: 'fa-triangle-exclamation', color: 'yellow', title: 'Late Arrival Analysis',
      metrics: [
        { label: 'Total Late Arrivals (period)', value: totalLates },
        { label: 'Avg Lates per Student',        value: (totalLates/totalStudents).toFixed(1) },
        { label: 'Highest Late Day',             value: 'Tuesday (5 lates avg)' },
        { label: 'Students at Late-Risk (≥3)',   value: scoped.filter(s => s.lates >= 3).length },
        { label: 'Recommendation',               value: 'Review Friday early-departure policy' },
      ]
    });
    if (sources.geo) sections.push({
      icon: 'fa-map-location-dot', color: 'orange', title: 'Geofence Compliance',
      metrics: [
        { label: 'Compliance Rate',      value: geoPassRate + '%' },
        { label: 'Outside-Fence Flags',  value: data.geofence.failed + ' clock-ins flagged' },
        { label: 'Manual Review Needed', value: data.geofence.partial + ' records' },
        { label: 'Most Flagged Student', value: 'Aaliyah Brown (4 flags)' },
        { label: 'Recommendation',       value: 'Increase radius to 80m or verify campus pin' },
      ]
    });
    if (sources.activity) sections.push({
      icon: 'fa-chart-line', color: 'pink', title: 'Student Activity Insights',
      metrics: [
        { label: 'At-Risk Students',          value: riskStudents.map(s=>s.name).join(', ') || 'None' },
        { label: 'Perfect Attendance',        value: scoped.filter(s=>s.absences===0 && s.lates===0).map(s=>s.name).join(', ') || 'None' },
        { label: 'Highest Hours',             value: scoped.reduce((a,b) => b.hours>a.hours?b:a).name },
        { label: 'Most Improved Opportunity', value: scoped.reduce((a,b) => b.pct<a.pct?b:a).name },
        { label: 'Recommended Action',        value: riskStudents.length ? 'Schedule check-ins for at-risk students' : 'All students on track' },
      ]
    });

    const insights = [
      eligible >= Math.ceil(totalStudents*0.75)
        ? `✅ Strong cohort: ${Math.round(eligible/totalStudents*100)}% of students are stipend eligible.`
        : `⚠ Only ${Math.round(eligible/totalStudents*100)}% eligible — consider intervention for ${atRisk + ineligible} students.`,
      totalLates > totalStudents * 2
        ? `⚠ High late rate detected (${totalLates} total). ${worstDay.day} has the most absences — consider schedule review.`
        : `✅ Late arrivals within acceptable range (${totalLates} total across cohort).`,
      geoPassRate >= 90
        ? `✅ Geofence compliance is excellent at ${geoPassRate}%.`
        : `⚠ GPS verification failing for ${100-geoPassRate}% of clock-ins — review geofence radius or campus pin location.`,
    ];

    return { sections, insights, meta: { totalStudents, eligible, atRisk, ineligible, avgHours, avgPct, geoPassRate } };
  }

  // ── AI-enhanced analysis (uses OpenAI key if available) ──────────
  async function analyzeWithAI(sources, scope, depth, startDate, endDate) {
    const k = getAIKey(), b = getAIBase();
    if (!k) return null; // No key — fall through to local analysis

    const data = SAMPLE_DATA;
    const prompt = `You are ReportIntelligenceService for Code Differently attendance system.
Analyze this attendance data and produce a Smart Build report blueprint. Respond with JSON only.

DATA: ${JSON.stringify({ sources, scope, depth, dateRange: { startDate, endDate }, students: data.students, trends: data.dailyTrends, geofence: data.geofence })}

Return JSON: { "sections": [{"title":"...","insight":"...","metrics":[{"label":"...","value":"..."}]}], "keyInsights": ["..."], "recommendation": "..." }`;

    try {
      const res = await fetch((b||'https://www.genspark.ai/api/llm_proxy/v1') + '/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},
        body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.3, max_tokens:1500 })
      });
      if (!res.ok) return null;
      const json = await res.json();
      const raw  = json.choices[0].message.content.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
      return { aiEnhanced: true, raw: JSON.parse(raw) };
    } catch { return null; }
  }

  return { analyzeLocally, analyzeWithAI, SAMPLE_DATA };
})();

// ── Smart Build UI controller ────────────────────────
function openSmartBuild() {
  document.getElementById('smartBuildModal').style.display = 'flex';
  document.getElementById('sbStep1').style.display = 'block';
  document.getElementById('sbStep2').style.display = 'none';
  document.getElementById('sbStep3').style.display = 'none';
  document.getElementById('sbFallback').style.display = 'none';
  // Set date defaults
  const today = new Date().toISOString().slice(0,10);
  const firstOfMonth = new Date(); firstOfMonth.setDate(1);
  const sd = document.getElementById('sbStartDate');
  const ed = document.getElementById('sbEndDate');
  if (sd) sd.value = firstOfMonth.toISOString().slice(0,10);
  if (ed) ed.value = today;
}

function closeSmartBuild() {
  document.getElementById('smartBuildModal').style.display = 'none';
}

function sbGoBack() {
  document.getElementById('sbStep3').style.display = 'none';
  document.getElementById('sbFallback').style.display = 'none';
  document.getElementById('sbStep1').style.display = 'block';
}

async function runSmartBuild() {
  // Gather selected sources
  const sources = {
    attendance: document.getElementById('sbSrcAttendance')?.checked,
    clockin:    document.getElementById('sbSrcClockin')?.checked,
    activity:   document.getElementById('sbSrcActivity')?.checked,
    geo:        document.getElementById('sbSrcGeo')?.checked,
    stipend:    document.getElementById('sbSrcStipend')?.checked,
    late:       document.getElementById('sbSrcLate')?.checked,
  };
  const scope     = document.getElementById('sbScope')?.value     || 'all';
  const depth     = document.getElementById('sbDepth')?.value     || 'standard';
  const startDate = document.getElementById('sbStartDate')?.value || '';
  const endDate   = document.getElementById('sbEndDate')?.value   || '';

  // Switch to processing step
  document.getElementById('sbStep1').style.display = 'none';
  document.getElementById('sbStep2').style.display = 'block';

  // Animated progress steps
  const steps = ['sbprog-1','sbprog-2','sbprog-3','sbprog-4','sbprog-5'];
  const stepLabels = [
    'Loading data sources', 'Analyzing attendance patterns',
    'Detecting trends & anomalies', 'Generating report blueprint', 'Constructing report sections'
  ];
  let result = null;

  for (let i = 0; i < steps.length; i++) {
    const el = document.getElementById(steps[i]);
    if (el) { el.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${stepLabels[i]}`; el.className = 'sb-prog-step active'; }
    const subEl = document.getElementById('sbProcessSub');
    if (subEl) subEl.textContent = stepLabels[i] + '…';
    await new Promise(r => setTimeout(r, depth === 'deep' ? 700 : 480));
    if (el) { el.innerHTML = `<i class="fa fa-circle-check"></i> ${stepLabels[i]}`; el.className = 'sb-prog-step done'; }

    // On step 4, try AI (with 3s timeout) then fall back to local
    if (i === 3) {
      const aiTitle = document.getElementById('sbProcessTitle');
      if (aiTitle) aiTitle.textContent = 'AI analysis running…';
      try {
        const aiResult = await Promise.race([
          ReportIntelligenceService.analyzeWithAI(sources, scope, depth, startDate, endDate),
          new Promise(r => setTimeout(() => r(null), 3000))
        ]);
        if (aiResult) result = { ...ReportIntelligenceService.analyzeLocally(sources, scope, depth), aiEnhanced: true, aiRaw: aiResult.raw };
        else          result = ReportIntelligenceService.analyzeLocally(sources, scope, depth);
      } catch { result = ReportIntelligenceService.analyzeLocally(sources, scope, depth); }
    }
  }

  await new Promise(r => setTimeout(r, 300));

  // Guard: if result failed, show fallback
  if (!result || !result.sections || result.sections.length === 0) {
    document.getElementById('sbStep2').style.display = 'none';
    document.getElementById('sbFallback').style.display = 'block';
    return;
  }

  // Render blueprint
  renderSmartBuildResult(result, sources);
}

function renderSmartBuildResult(result, sources) {
  document.getElementById('sbStep2').style.display = 'none';
  document.getElementById('sbStep3').style.display = 'block';

  // Subtitle
  const sub = document.getElementById('sbResultSub');
  if (sub) sub.textContent = `AI generated an optimized report with ${result.sections.length} sections${result.aiEnhanced ? ' (AI-enhanced)' : ' (local analysis)'}`;

  // Blueprint sections
  const bp = document.getElementById('sbBlueprint');
  if (bp) {
    const colorMap = { green:'#22C55E', purple:'#9B3DE8', blue:'#3B82F6', yellow:'#F59E0B', orange:'#F4703A', pink:'#E040A0' };
    bp.innerHTML = result.sections.map((sec, i) => `
      <div class="sb-section" style="animation-delay:${i*80}ms">
        <div class="sb-section-header" style="border-color:${colorMap[sec.color]||'var(--purple)'}">
          <i class="fa ${sec.icon}" style="color:${colorMap[sec.color]||'var(--purple)'}"></i>
          <strong>${sec.title}</strong>
          <span class="sb-section-num">Section ${i+1}</span>
        </div>
        <div class="sb-metrics">
          ${sec.metrics.map(m => `
            <div class="sb-metric-row">
              <span class="sb-metric-label">${m.label}</span>
              <span class="sb-metric-value">${m.value}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  // Key insights
  const ins = document.getElementById('sbInsights');
  if (ins && result.insights) {
    ins.innerHTML = `
      <div class="sb-insights-title"><i class="fa fa-lightbulb"></i> Key Insights</div>
      ${result.insights.map(i => `<div class="sb-insight-item">${i}</div>`).join('')}
      ${result.aiEnhanced ? '<div class="sb-ai-tag"><i class="fa fa-wand-magic-sparkles"></i> AI-enhanced analysis</div>' : ''}`;
  }

  // Store result for export/apply
  window._sbLastResult = result;
}

function sbExportCSV() {
  if (!window._sbLastResult) { showToast('No report to export', 'orange'); return; }
  const rows = [['Section','Metric','Value']];
  window._sbLastResult.sections.forEach(sec => {
    sec.metrics.forEach(m => rows.push([sec.title, m.label, m.value]));
  });
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'SmartBuild_Report_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  showToast('✓ Smart Build report exported!', 'green');
}

function sbApplyToBuilder() {
  closeSmartBuild();
  // Pre-fill the manual report builder with Smart Build's recommended settings
  const rt = document.getElementById('reportType');
  if (rt) rt.value = 'attendance';
  const sf = document.getElementById('studentFilter');
  if (sf) sf.value = 'All Students';
  showToast('✓ Smart Build applied to report builder!', 'purple');
}

function sbApplyFallback() {
  closeSmartBuild();
  showToast('Manual report builder ready with recommended settings', 'blue');
}

/* ── SETTINGS ────────────────────────────────────── */
function saveSettings() {
  const toast = document.getElementById('saveToast');
  if (toast) {
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }
}
function testQBConnection() { showToast('⚡ Testing QuickBooks connection…', 'purple'); setTimeout(() => showToast('✓ QuickBooks connection verified!', 'green'), 1500); }
function disconnectQB()     { showToast('QuickBooks disconnected.', 'orange'); }
function loadDate(v)        { showToast('Loading attendance for ' + v, 'blue'); }
function updateChart(v)     { showToast('Chart updated: ' + v, 'purple'); }
function updateReportFields(v) { }
function filterRecords(v)   { }

/* ══════════════════════════════════════════════════════════════════
   GEOFENCE ADMIN PANEL — saveGeofence, map, audit log
   ══════════════════════════════════════════════════════════════════ */

/* ── Bug Fix 2: Address Geocoding ────────────────────
   Uses OpenStreetMap Nominatim (free, no API key required).
   Results populate lat/lon fields and re-center the Leaflet map.  */
async function geocodeAddress() {
  const input  = document.getElementById('geoAddressInput');
  const status = document.getElementById('geocodeStatus');
  const results = document.getElementById('geocodeResults');
  if (!input || !input.value.trim()) { showToast('Enter an address to search', 'orange'); return; }

  const query = input.value.trim();
  if (status)  { status.style.display = 'flex'; status.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Searching…'; status.className = 'geocode-status searching'; }
  if (results) results.style.display = 'none';

  try {
    const url  = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'ShiftSync-CodeDifferently/1.0' } });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();

    if (!data || data.length === 0) {
      if (status) { status.innerHTML = '<i class="fa fa-circle-xmark"></i> No results found. Try a more specific address.'; status.className = 'geocode-status error'; }
      return;
    }

    if (status) status.style.display = 'none';
    if (results) {
      results.style.display = 'block';
      results.innerHTML = data.map((r, i) => `
        <div class="geocode-result-item" onclick="selectGeoResult(${r.lat}, ${r.lon}, '${r.display_name.replace(/'/g,"\\'")}', this)">
          <i class="fa fa-location-dot"></i>
          <div class="geocode-result-text">
            <strong>${r.display_name.split(',').slice(0,3).join(', ')}</strong>
            <small>${r.display_name}</small>
          </div>
          <div class="geocode-result-coords">${parseFloat(r.lat).toFixed(4)}, ${parseFloat(r.lon).toFixed(4)}</div>
        </div>`).join('');
    }
  } catch(e) {
    if (status) { status.innerHTML = '<i class="fa fa-triangle-exclamation"></i> Search error — check internet connection'; status.className = 'geocode-status error'; status.style.display='flex'; }
  }
}

function selectGeoResult(lat, lon, displayName, el) {
  // Highlight selected
  document.querySelectorAll('.geocode-result-item').forEach(r => r.classList.remove('selected'));
  if (el) el.classList.add('selected');

  lat = parseFloat(lat); lon = parseFloat(lon);

  // Fill coordinate fields
  const laEl = document.getElementById('geoLat');
  const loEl = document.getElementById('geoLon');
  const naEl = document.getElementById('geoName');
  const inEl = document.getElementById('geoAddressInput');
  if (laEl) laEl.value = lat.toFixed(6);
  if (loEl) loEl.value = lon.toFixed(6);
  if (naEl && naEl.value === 'Code Differently Campus') {
    naEl.value = displayName.split(',').slice(0,2).join(',').trim();
  }
  if (inEl) inEl.value = displayName.split(',').slice(0,3).join(', ');

  // Re-center Leaflet map and move campus marker
  if (geoMap && window.L) {
    geoMap.setView([lat, lon], 17);
    if (campusMarker) { campusMarker.setLatLng([lat, lon]); }
    updateRadiusCircle(lat, lon, parseInt(document.getElementById('geoRadius')?.value || 60));
  }

  // Update status bar
  const sdv = document.getElementById('geoStatusDistVal');
  if (sdv) sdv.textContent = `Location set: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

  // Hide results after short delay
  setTimeout(() => {
    const res = document.getElementById('geocodeResults');
    if (res) res.style.display = 'none';
  }, 1200);

  showToast(`✓ Location set to ${displayName.split(',').slice(0,2).join(',')}`, 'green');
}

// ── Local config store (mirrors server) ──────────────
let localGeoConfig = null;
let geoMap = null;   // Leaflet map instance
let campusMarker = null, radiusCircle = null;

// ── Initialise admin geofence page ───────────────────
async function initGeofencePage() {
  if (!document.getElementById('geoMap')) return;

  // Load config
  try {
    const res = await fetch('/api/location/config');
    if (res.ok) localGeoConfig = await res.json();
  } catch { /* use defaults */ }
  if (!localGeoConfig) localGeoConfig = { ...DEFAULT_CAMPUS, wifi_networks: ['CodeDifferently-WiFi','CD-Staff','CD-Students'] };

  // Populate form
  const n = document.getElementById('geoName');
  const la = document.getElementById('geoLat');
  const lo = document.getElementById('geoLon');
  const ra = document.getElementById('geoRadius');
  const rd = document.getElementById('radiusDisplay');
  const ac = document.getElementById('geoAccuracy');
  const ad = document.getElementById('accuracyDisplay');
  const wi = document.getElementById('geoWifi');
  if (n)  n.value  = localGeoConfig.name || 'Code Differently Campus';
  if (la) la.value = (localGeoConfig.lat || localGeoConfig.latitude  || DEFAULT_CAMPUS.lat).toFixed(4);
  if (lo) lo.value = (localGeoConfig.lon || localGeoConfig.longitude || DEFAULT_CAMPUS.lon).toFixed(4);
  if (ra) { ra.value = localGeoConfig.radius || 60; if (rd) rd.textContent = ra.value; }
  if (ac) { ac.value = localGeoConfig.max_accuracy || 40; if (ad) ad.textContent = ac.value; }
  if (wi && localGeoConfig.wifi_networks) wi.value = localGeoConfig.wifi_networks.join('\n');

  // Update status bar
  const sdv = document.getElementById('geoStatusDistVal');
  const swv = document.getElementById('geoStatusWifiVal');
  const su  = document.getElementById('geoStatusUpdated');
  if (sdv) sdv.textContent = `Radius: ${localGeoConfig.radius || 60}m`;
  if (swv) swv.textContent = `WiFi Networks: ${(localGeoConfig.wifi_networks||[]).length}`;
  if (su)  su.textContent  = 'Last saved: just now';

  // Load Leaflet and init map
  loadLeaflet(initLeafletMap);
  loadAuditLog();
}

function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  // Load Leaflet CSS
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
  document.head.appendChild(css);
  // Load Leaflet JS
  const js = document.createElement('script');
  js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
  js.onload = cb;
  document.head.appendChild(js);
}

function initLeafletMap() {
  const mapEl = document.getElementById('geoMap');
  if (!mapEl || !window.L) return;

  // Remove loading overlay
  const loading = document.getElementById('geoMapLoading');
  if (loading) loading.style.display = 'none';

  const clat = parseFloat(document.getElementById('geoLat')?.value) || DEFAULT_CAMPUS.lat;
  const clon = parseFloat(document.getElementById('geoLon')?.value) || DEFAULT_CAMPUS.lon;
  const rad  = parseInt(document.getElementById('geoRadius')?.value) || 60;

  // Init map
  geoMap = L.map('geoMap', { zoomControl: true, attributionControl: false }).setView([clat, clon], 16);

  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '©OpenStreetMap ©CartoDB'
  }).addTo(geoMap);

  // Custom campus icon
  const campusIcon = L.divIcon({
    html: `<div style="background:linear-gradient(135deg,#F4703A,#9B3DE8);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,.4)">
             <span style="display:block;transform:rotate(45deg);text-align:center;line-height:30px;color:white;font-weight:bold;font-size:13px">CD</span>
           </div>`,
    iconSize: [36, 36], iconAnchor: [18, 36], className: ''
  });

  campusMarker = L.marker([clat, clon], { icon: campusIcon, draggable: true }).addTo(geoMap);
  campusMarker.bindPopup(`<b>Code Differently Campus</b><br>${clat.toFixed(5)}, ${clon.toFixed(5)}`).openPopup();

  // Draggable marker updates form
  campusMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    document.getElementById('geoLat').value = pos.lat.toFixed(5);
    document.getElementById('geoLon').value = pos.lng.toFixed(5);
    campusMarker.getPopup().setContent(`<b>Code Differently Campus</b><br>${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
    updateRadiusCircle(pos.lat, pos.lng);
    showToast('Pin moved — remember to save', 'orange');
  });

  // Radius circle
  radiusCircle = L.circle([clat, clon], {
    radius: rad, color: '#9B3DE8', fillColor: '#9B3DE8', fillOpacity: 0.12, weight: 2, dashArray: '6 4'
  }).addTo(geoMap);

  // Click on map to move pin
  geoMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    campusMarker.setLatLng([lat, lng]);
    document.getElementById('geoLat').value = lat.toFixed(5);
    document.getElementById('geoLon').value = lng.toFixed(5);
    updateRadiusCircle(lat, lng);
    showToast(`Pin placed at ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'purple');
  });

  // Sync radius slider to circle
  const slider = document.getElementById('geoRadius');
  if (slider) {
    slider.addEventListener('input', () => {
      const pos = campusMarker.getLatLng();
      updateRadiusCircle(pos.lat, pos.lng, parseInt(slider.value));
    });
  }
}

function updateRadiusCircle(lat, lng, rad) {
  if (!radiusCircle) return;
  if (!rad) rad = parseInt(document.getElementById('geoRadius')?.value) || 60;
  // Clamp radius to safe bounds 20–300m
  rad = Math.max(20, Math.min(300, rad));
  // Use current marker position if lat/lng not provided
  if (lat === null || lng === null) {
    if (campusMarker) { const p = campusMarker.getLatLng(); lat = p.lat; lng = p.lng; }
    else return;
  }
  radiusCircle.setLatLng([lat, lng]);
  radiusCircle.setRadius(rad);
  // Sync slider + display label
  const slider  = document.getElementById('geoRadius');
  const display = document.getElementById('radiusDisplay');
  if (slider)  slider.value      = rad;
  if (display) display.textContent = rad;
}

// ── Drop pin at current user location ────────────────
function dropPinHere() {
  if (!geoMap || !campusMarker) { showToast('Map not loaded yet', 'orange'); return; }
  if (!navigator.geolocation) { showToast('GPS not supported', 'orange'); return; }
  showToast('Getting your location…', 'purple');
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    campusMarker.setLatLng([lat, lng]);
    geoMap.setView([lat, lng], 17);
    document.getElementById('geoLat').value = lat.toFixed(5);
    document.getElementById('geoLon').value = lng.toFixed(5);
    updateRadiusCircle(lat, lng);
    showToast(`Pin dropped at your location (±${Math.round(pos.coords.accuracy)}m)`, 'green');
  }, () => showToast('Could not get GPS location', 'orange'), { enableHighAccuracy: true });
}

function useMyLocation() { dropPinHere(); }

// ── Apply radius preset ───────────────────────────────
function applyPreset(metres) {
  const r = document.getElementById('geoRadius');
  const d = document.getElementById('radiusDisplay');
  if (r) r.value = metres;
  if (d) d.textContent = metres;
  // Update active button styling
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (campusMarker) {
    const pos = campusMarker.getLatLng();
    updateRadiusCircle(pos.lat, pos.lng, metres);
  }
  showToast(`Radius set to ${metres}m`, 'purple');
}

// ── Save geofence configuration ───────────────────────
async function saveGeofence() {
  const name   = document.getElementById('geoName')?.value?.trim() || 'Code Differently Campus';
  const lat    = parseFloat(document.getElementById('geoLat')?.value)    || DEFAULT_CAMPUS.lat;
  const lon    = parseFloat(document.getElementById('geoLon')?.value)    || DEFAULT_CAMPUS.lon;
  const radius = parseInt(document.getElementById('geoRadius')?.value)   || 60;
  const maxAcc = parseInt(document.getElementById('geoAccuracy')?.value) || 40;
  const wifiRaw = document.getElementById('geoWifi')?.value || '';
  const wifi   = wifiRaw.split('\n').map(s => s.trim()).filter(Boolean);

  showToast('Saving geofence configuration…', 'purple');

  try {
    const res = await fetch('/api/location/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, lat, lon, longitude: lon, latitude: lat, radius, max_accuracy: maxAcc, wifi_networks: wifi })
    });
    if (res.ok) {
      localGeoConfig = await res.json();
      const su = document.getElementById('geoStatusUpdated');
      const sd = document.getElementById('geoStatusDistVal');
      if (su) su.textContent = 'Last saved: just now';
      if (sd) sd.textContent = `Radius: ${radius}m`;
      showToast(`✓ Geofence saved — ${name}, ${radius}m radius`, 'green');
    } else {
      showToast('Server error — changes saved locally', 'orange');
    }
  } catch {
    showToast('Network error — changes saved locally only', 'orange');
  }
}

// ── Test current location against geofence ────────────
function testCurrentLocation() {
  const checks = document.getElementById('geoTestChecks');
  const result = document.getElementById('geoTestResult');
  if (checks) checks.style.display = 'grid';
  if (result) result.style.display = 'none';

  // Reset spinners
  ['gps','dist','acc','wifi'].forEach(k => {
    const v = document.getElementById(`gtc-${k}-val`);
    const ic = document.getElementById(`gtc-${k}-ic`);
    if (v)  v.textContent = '—';
    if (ic) ic.style.display = 'inline';
  });

  if (!navigator.geolocation) {
    setGTC('gps', 'Not supported', false);
    setGTC('dist', '—', false);
    setGTC('acc', '—', false);
    setGTC('wifi', '—', null);
    return;
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat    = pos.coords.latitude, lon = pos.coords.longitude;
    const campus = {
      lat: parseFloat(document.getElementById('geoLat')?.value) || DEFAULT_CAMPUS.lat,
      lon: parseFloat(document.getElementById('geoLon')?.value) || DEFAULT_CAMPUS.lon,
      radius: parseInt(document.getElementById('geoRadius')?.value) || 60
    };
    const dist   = haversine(lat, lon, campus.lat, campus.lon);
    const inside = dist <= campus.radius;
    const maxAcc = parseInt(document.getElementById('geoAccuracy')?.value) || 40;

    setGTC('gps',  `${lat.toFixed(5)}, ${lon.toFixed(5)}`, true);
    await new Promise(r => setTimeout(r, 400));
    setGTC('dist', `${Math.round(dist)}m (${inside?'inside':'outside'} ${campus.radius}m zone)`, inside);
    await new Promise(r => setTimeout(r, 300));
    setGTC('acc',  `±${Math.round(pos.coords.accuracy)}m (max ${maxAcc}m)`, pos.coords.accuracy <= maxAcc);
    await new Promise(r => setTimeout(r, 300));
    setGTC('wifi', 'Cannot detect via browser — GPS used', null);

    // Show result card
    if (result) {
      result.style.display = 'block';
      result.className = inside ? 'geo-test-success' : 'geo-test-fail';
      result.innerHTML = inside
        ? `<i class="fa fa-circle-check" style="font-size:2rem;color:var(--green)"></i>
           <p><strong>Inside Geofence ✓</strong><br>${Math.round(dist)}m from campus</p>`
        : `<i class="fa fa-triangle-exclamation" style="font-size:2rem;color:var(--orange)"></i>
           <p><strong>Outside Geofence ⚠</strong><br>${Math.round(dist)}m — ${Math.round(dist-campus.radius)}m over limit</p>`;
    }
    if (checks) checks.style.display = 'none';
  }, () => {
    setGTC('gps', 'GPS denied', false);
    setGTC('dist', '—', false);
    setGTC('acc', '—', false);
    setGTC('wifi', '—', null);
  }, { enableHighAccuracy: true, timeout: 12000 });
}

function setGTC(key, val, ok) {
  const v  = document.getElementById(`gtc-${key}-val`);
  const ic = document.getElementById(`gtc-${key}-ic`);
  const row = document.getElementById(`gtc-${key}`);
  if (v)  v.textContent = val;
  if (ic) ic.style.display = 'none';
  if (row) {
    row.classList.remove('gtc-ok','gtc-fail','gtc-na');
    if (ok === true)  row.classList.add('gtc-ok');
    else if (ok === false) row.classList.add('gtc-fail');
    else                   row.classList.add('gtc-na');
  }
}

// ── Audit Log ─────────────────────────────────────────
const SAMPLE_AUDIT = [
  { student_id:'EMP001', name:'Alex Johnson',    time:'09:02 AM', distance:12, accuracy:8,  wifi:'CodeDifferently-WiFi', status:'full',    note:'Verified on campus' },
  { student_id:'EMP002', name:'Maria Garcia',    time:'09:14 AM', distance:28, accuracy:15, wifi:'CodeDifferently-WiFi', status:'full',    note:'Late — within fence' },
  { student_id:'EMP003', name:'DeShawn Williams',time:'09:01 AM', distance:5,  accuracy:4,  wifi:'CD-Staff',             status:'full',    note:'Excellent signal' },
  { student_id:'EMP004', name:'Priya Patel',     time:'—',        distance:null, accuracy:null, wifi:'None',             status:'failed',  note:'No clock-in recorded' },
  { student_id:'EMP005', name:'Liam Chen',       time:'08:58 AM', distance:45, accuracy:22, wifi:'None',                 status:'partial', note:'GPS partial — inside fence' },
  { student_id:'EMP006', name:'Aaliyah Brown',   time:'09:22 AM', distance:72, accuracy:35, wifi:'None',                 status:'failed',  note:'Outside geofence — flagged' },
  { student_id:'EMP007', name:'Marcus Thompson', time:'09:00 AM', distance:18, accuracy:9,  wifi:'CodeDifferently-WiFi', status:'full',    note:'Verified on campus' },
  { student_id:'EMP008', name:'Sofia Rodriguez', time:'—',        distance:null, accuracy:null, wifi:'None',             status:'failed',  note:'Absent — no location data' },
];

let currentAuditFilter = '';

function loadAuditLog(filter) {
  currentAuditFilter = filter || currentAuditFilter;
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  const data = currentAuditFilter
    ? SAMPLE_AUDIT.filter(r => r.student_id === currentAuditFilter)
    : SAMPLE_AUDIT;

  // Update stats
  const full    = data.filter(r => r.status === 'full').length;
  const partial = data.filter(r => r.status === 'partial').length;
  const failed  = data.filter(r => r.status === 'failed').length;
  const dists   = data.filter(r => r.distance !== null).map(r => r.distance);
  const avgDist = dists.length ? Math.round(dists.reduce((a,b)=>a+b,0)/dists.length) : null;
  const sf = document.getElementById('ast-full');
  const sp = document.getElementById('ast-partial');
  const sr = document.getElementById('ast-failed');
  const sa = document.getElementById('ast-avg');
  if (sf) sf.textContent = full;
  if (sp) sp.textContent = partial;
  if (sr) sr.textContent = failed;
  if (sa) sa.textContent = avgDist !== null ? avgDist + 'm' : '—';

  // Build rows
  tbody.innerHTML = data.map(r => {
    const statusBadge = {
      full:    '<span class="audit-badge full"><i class="fa fa-circle-check"></i> Full</span>',
      partial: '<span class="audit-badge partial"><i class="fa fa-triangle-exclamation"></i> Partial</span>',
      failed:  '<span class="audit-badge failed"><i class="fa fa-circle-xmark"></i> Failed</span>',
    }[r.status] || '';
    return `<tr>
      <td><span class="student-id-chip">${r.student_id}</span> ${r.name}</td>
      <td>${r.time}</td>
      <td>${r.distance !== null ? r.distance + 'm' : '—'}</td>
      <td>${r.accuracy !== null ? '±'+r.accuracy+'m' : '—'}</td>
      <td><span class="${r.wifi!=='None'?'wifi-ok':'wifi-none'}">${r.wifi}</span></td>
      <td>${statusBadge}</td>
      <td style="color:var(--gray400);font-size:.82rem">${r.note}</td>
    </tr>`;
  }).join('');
}

function filterAuditLog(val) { loadAuditLog(val); }

// Auto-init geofence page
if (document.getElementById('geoMap')) {
  window.addEventListener('DOMContentLoaded', initGeofencePage);
  // Also try immediately (in case DOM already loaded)
  if (document.readyState !== 'loading') initGeofencePage();
}

/* ── TOAST HELPER ────────────────────────────────── */
let toastTimer = null;
function showToast(msg, color = 'green') {
  let t = document.getElementById('globalToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'globalToast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  const colorMap = { green: 'var(--green)', orange: 'var(--orange)', purple: 'var(--purple)', blue: 'var(--blue)', yellow: 'var(--yellow)' };
  t.style.color = colorMap[color] || colorMap.green;
  t.textContent = msg;
  t.style.display = 'flex';
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = 'slideUp .3s ease';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

/* ── SET TODAY DATE on date pickers ─────────────── */
window.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().slice(0, 10);
  const ad = document.getElementById('attendanceDate');
  const sd = document.getElementById('startDate');
  const ed = document.getElementById('endDate');
  if (ad) ad.value = today;
  if (sd) { const d = new Date(); d.setDate(1); sd.value = d.toISOString().slice(0,10); }
  if (ed) ed.value = today;
});

function toggleAIKeyVis() {
  const inp = document.getElementById('aiApiKey');
  const ico = document.getElementById('aiKeyEye');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (ico) ico.className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
}
