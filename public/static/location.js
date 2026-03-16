/* ═══════════════════════════════════════════════════════════════
   location.js — Intelligent Location Verification Frontend
   Non-destructive — works alongside existing app.js
   ═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────────
const GEO = {
  coords:        null,       // { latitude, longitude, accuracy }
  schoolConfig:  null,       // fetched from /api/location/config
  watchId:       null,       // navigator.geolocation watch
  map:           null,       // Leaflet map instance
  adminMap:      null,       // Admin geofence map
  schoolMarker:  null,
  userMarker:    null,
  fenceCircle:   null,
  verifyResult:  null,       // last verification result
  proximityTimer: null,
}

// ── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSchoolConfig()

  if (document.getElementById('clockBtn'))   initStudentPage()
  if (document.getElementById('geoMap'))     initGeofencePage()
  if (document.getElementById('auditTable')) loadAuditLog()
})

// ── Load school config from API ───────────────────────────────────
async function loadSchoolConfig() {
  try {
    const res  = await fetch('/api/location/config')
    GEO.schoolConfig = await res.json()
  } catch {
    GEO.schoolConfig = {
      latitude: 39.7392, longitude: -75.5398,
      radius: 60, max_accuracy: 40,
      name: 'Code Differently Campus',
      allowed_wifi_networks: ['CodeDifferently-WiFi','CD-Staff','CD-Students'],
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   STUDENT PAGE — Geofence-aware Clock In
   ═══════════════════════════════════════════════════════════════ */
function initStudentPage() {
  const btn      = document.getElementById('clockBtn')
  const gpsText  = document.getElementById('gpsText')
  const banner   = document.getElementById('geoBanner')

  if (banner) banner.style.display = 'block'

  setBannerState('scanning', 'Scanning for campus location…', '')

  if (!navigator.geolocation) {
    setBannerState('outside', 'GPS not supported', 'Cannot verify location on this device')
    setGPSStatus('error', 'GPS not supported on this browser')
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-play"></i> <span>Clock In (No GPS)</span>'; }
    return
  }

  // Start continuous watch
  GEO.watchId = navigator.geolocation.watchPosition(
    onLocationUpdate,
    onLocationError,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  )
}

function onLocationUpdate(pos) {
  GEO.coords = {
    latitude:  pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy:  pos.coords.accuracy,
  }

  const school = GEO.schoolConfig
  const dist   = haversineClient(
    pos.coords.latitude, pos.coords.longitude,
    school.latitude,     school.longitude
  )
  const inside = dist <= school.radius
  const acc    = Math.round(pos.coords.accuracy)
  const dm     = Math.round(dist)

  // Update GPS status line
  setGPSStatus(
    inside ? 'ok' : 'warn',
    `${inside ? '✓ On campus' : `${dm}m from campus`} · GPS ±${acc}m`
  )

  // Update proximity banner
  if (inside) {
    setBannerState('inside', `You are on campus (${dm}m)`, `GPS ±${acc}m · Ready to clock in`)
    const pct = Math.max(0, 100 - (dm / school.radius) * 100)
    setDistanceFill(pct)
  } else {
    setBannerState('outside', `You are ${dm}m from campus`, `Must be within ${school.radius}m to clock in`)
    setDistanceFill(0)
  }

  // Update badge
  const badge = document.getElementById('mapDistBadge')
  if (badge) badge.textContent = `${dm}m from campus`

  // Enable/re-enable clock button
  const btn = document.getElementById('clockBtn')
  if (btn && !isClockedIn) {
    btn.disabled = false
    btn.innerHTML = `<i class="fa fa-play" id="clockIcon"></i><span id="clockBtnText">Clock In</span>`
  }

  // Render / update mini map
  renderMiniMap(pos.coords.latitude, pos.coords.longitude)
}

function onLocationError(err) {
  const msgs = {
    1: 'Location permission denied — please allow GPS access',
    2: 'Location unavailable — GPS signal lost',
    3: 'GPS timed out — please move outdoors',
  }
  setGPSStatus('error', msgs[err.code] || 'GPS error')
  setBannerState('outside', 'Location error', msgs[err.code] || 'Cannot verify location')

  // Still allow clock-in without GPS (partial)
  const btn = document.getElementById('clockBtn')
  if (btn && !isClockedIn) {
    btn.disabled = false
    btn.innerHTML = '<i class="fa fa-play" id="clockIcon"></i><span id="clockBtnText">Clock In (No GPS)</span>'
  }
}

// ── Override handleClock to add verification layer ────────────────
const _originalHandleClock = typeof handleClock !== 'undefined' ? handleClock : null

// Redefined clock handler with location layer
async function handleClock() {
  if (isClockedIn) {
    // Clock OUT — no location check needed
    performClockOut()
    return
  }

  // Clock IN — run verification first
  if (!GEO.coords) {
    // No GPS — ask user to confirm manual override
    showLocationPanel()
    simulateVerificationNoGPS()
    return
  }

  showLocationPanel()
  await runLocationVerification()
}

// ── Location Verification Panel ───────────────────────────────────
function showLocationPanel() {
  const panel = document.getElementById('locationPanel')
  if (!panel) return
  panel.style.display = 'block'
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Reset all checks
  ;['gps','dist','acc','wifi'].forEach(k => {
    setCheckState(k, 'pending', '—')
  })
  document.getElementById('lvResult').style.display = 'none'
  document.getElementById('lvTitle').textContent = 'Verifying Location…'
  document.getElementById('lvSub').textContent   = 'Running security checks'
}

function closeLocationPanel() {
  const p = document.getElementById('locationPanel')
  if (p) p.style.display = 'none'
}

async function runLocationVerification() {
  const school  = GEO.schoolConfig
  const coords  = GEO.coords
  const acc     = Math.round(coords.accuracy)
  const dist    = Math.round(haversineClient(
    coords.latitude, coords.longitude,
    school.latitude,  school.longitude
  ))

  // Animate each check with staggered delay
  await delay(300)
  setCheckState('gps',  'pass',  `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`)

  await delay(400)
  const accPass = acc <= school.max_accuracy
  setCheckState('acc', accPass ? 'pass' : 'fail', `±${acc}m ${accPass ? '✓' : `(max ${school.max_accuracy}m)`}`)

  await delay(500)
  const inFence = dist <= school.radius
  setCheckState('dist', inFence ? 'pass' : 'fail', `${dist}m ${inFence ? '✓ within fence' : `✗ outside ${school.radius}m`}`)

  await delay(300)
  setCheckState('wifi', 'warn', 'WiFi detection limited on web')

  // Call backend verification API
  let result
  try {
    const res = await fetch('/api/location/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: 'EMP001',
        session_id: 'sess-' + Date.now(),
        latitude:   coords.latitude,
        longitude:  coords.longitude,
        accuracy:   coords.accuracy,
        wifi_ssid:  null,
      })
    })
    result = await res.json()
    GEO.verifyResult = result
  } catch (e) {
    result = { allowed: false, status: 'failed', message: 'Verification service error: ' + e.message }
  }

  showVerificationResult(result)
}

function simulateVerificationNoGPS() {
  setTimeout(() => setCheckState('gps', 'fail', 'No GPS signal'), 300)
  setTimeout(() => setCheckState('acc', 'fail', 'No accuracy data'), 600)
  setTimeout(() => setCheckState('dist', 'fail', 'Cannot calculate distance'), 900)
  setTimeout(() => setCheckState('wifi', 'warn', 'Cannot verify'), 1100)
  setTimeout(() => {
    showVerificationResult({
      allowed: false,
      status: 'failed',
      message: '📡 GPS signal required to clock in. Please enable location access.',
      gps_verified: false,
      wifi_verified: false,
    })
  }, 1400)
}

function showVerificationResult(result) {
  const el    = document.getElementById('lvResult')
  const icon  = document.getElementById('lvResultIcon')
  const msg   = document.getElementById('lvResultMsg')
  const acts  = document.getElementById('lvResultActions')
  const title = document.getElementById('lvTitle')
  const sub   = document.getElementById('lvSub')

  if (!el) return
  el.style.display = 'block'

  if (result.allowed && result.status === 'full') {
    el.className = 'lv-result result-pass'
    icon.innerHTML = '<i class="fa fa-circle-check"></i>'
    msg.textContent = result.message || '✓ Location fully verified'
    title.textContent = 'Location Verified ✓'
    sub.textContent   = 'GPS + Campus WiFi confirmed'
    acts.innerHTML = `
      <button class="btn-primary" onclick="confirmClockIn()">
        <i class="fa fa-check"></i> Confirm Clock In
      </button>
      <button class="btn-secondary" onclick="closeLocationPanel()">Cancel</button>`
  } else if (result.allowed && result.status === 'partial') {
    el.className = 'lv-result result-warn'
    icon.innerHTML = '<i class="fa fa-triangle-exclamation"></i>'
    msg.textContent = result.message || '⚠️ Partial verification — GPS only'
    title.textContent = 'Partial Verification'
    sub.textContent   = 'GPS verified, campus WiFi not detected'
    acts.innerHTML = `
      <button class="btn-primary" onclick="confirmClockIn()">
        <i class="fa fa-check"></i> Clock In (GPS Verified)
      </button>
      <button class="btn-secondary" onclick="closeLocationPanel()">Cancel</button>`
  } else {
    el.className = 'lv-result result-fail'
    icon.innerHTML = '<i class="fa fa-circle-xmark"></i>'
    msg.textContent = result.message || '✗ Location verification failed'
    title.textContent = 'Clock In Rejected'
    sub.textContent   = result.rejection_reason || 'You must be on campus to clock in'
    acts.innerHTML = `
      <button class="btn-secondary" onclick="closeLocationPanel()">
        <i class="fa fa-xmark"></i> Dismiss
      </button>
      <button class="btn-qb-outline" onclick="retryLocation()">
        <i class="fa fa-rotate-right"></i> Retry
      </button>`
  }
}

function confirmClockIn() {
  closeLocationPanel()
  performClockIn(GEO.verifyResult)
}

function retryLocation() {
  closeLocationPanel()
  if (GEO.coords) {
    showLocationPanel()
    runLocationVerification()
  } else {
    setGPSStatus('error', 'Still no GPS — move to a window or outside')
  }
}

// ── Actual clock-in logic (called after verification) ─────────────
function performClockIn(verifyResult) {
  isClockedIn = true
  clockInTime  = new Date()
  const timeStr = clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const btn        = document.getElementById('clockBtn')
  const statusDot  = document.querySelector('.status-dot')
  const statusText = document.getElementById('clockStatusText')
  const badge      = document.getElementById('statusBadge')
  const vBadge     = document.getElementById('verifyBadge')
  const log        = document.getElementById('todayLog')

  if (btn) { btn.className = 'btn-clock btn-clockout'; btn.innerHTML = '<i class="fa fa-stop"></i><span>Clock Out</span>'; }
  if (statusDot)  { statusDot.className  = 'status-dot dot-active'; }
  if (statusText) { statusText.textContent = 'Clocked In'; }
  if (badge)      { badge.innerHTML = '<span class="badge badge-present">● Clocked In</span>'; }
  if (vBadge && verifyResult?.status === 'full')    { vBadge.style.display = 'inline-flex'; }

  const verifyIcon = verifyResult?.gps_verified
    ? `<span style="color:var(--green);font-size:11px"><i class="fa fa-shield-halved"></i> GPS Verified ${verifyResult.distance_from_school}m</span>`
    : `<span style="color:var(--yellow);font-size:11px"><i class="fa fa-triangle-exclamation"></i> Location Unverified</span>`

  if (log) {
    log.innerHTML = `
      <div class="timeline-item">
        <div class="tl-icon"><i class="fa fa-play"></i></div>
        <div class="tl-info">
          <div class="tl-label">Clocked In</div>
          <div class="tl-time">${timeStr}</div>
          <div class="tl-loc">${verifyIcon}</div>
          ${GEO.coords ? `<div class="tl-loc"><i class="fa fa-location-dot"></i> ${GEO.coords.latitude.toFixed(5)}, ${GEO.coords.longitude.toFixed(5)}</div>` : ''}
        </div>
      </div>`
  }

  const status = verifyResult?.status || 'unknown'
  showToast(
    status === 'full'    ? `✓ Clocked in at ${timeStr} — location fully verified` :
    status === 'partial' ? `✓ Clocked in at ${timeStr} — GPS verified (partial)` :
    `Clocked in at ${timeStr}`,
    status === 'full' ? 'green' : 'yellow'
  )
}

function performClockOut() {
  isClockedIn   = false
  const outTime = new Date()
  const timeStr = outTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const diff    = clockInTime ? Math.round((outTime - clockInTime) / 60000) : 0
  const hrs     = Math.floor(diff / 60), mins = diff % 60

  const btn        = document.getElementById('clockBtn')
  const statusDot  = document.querySelector('.status-dot')
  const statusText = document.getElementById('clockStatusText')
  const badge      = document.getElementById('statusBadge')
  const log        = document.getElementById('todayLog')
  const inStr      = clockInTime ? clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'

  if (btn)        { btn.className = 'btn-clock btn-clockin'; btn.innerHTML = '<i class="fa fa-play"></i><span>Clock In</span>'; }
  if (statusDot)  { statusDot.className  = 'status-dot dot-out'; }
  if (statusText) { statusText.textContent = 'Shift Complete'; }
  if (badge)      { badge.innerHTML = '<span class="badge badge-late">Clocked Out</span>'; }

  if (log) {
    log.innerHTML = `
      <div class="timeline-item">
        <div class="tl-icon"><i class="fa fa-play"></i></div>
        <div class="tl-info">
          <div class="tl-label">Clocked In</div>
          <div class="tl-time">${inStr}</div>
          <div class="tl-loc"><i class="fa fa-shield-halved" style="color:var(--green)"></i> Location verified</div>
        </div>
      </div>
      <div class="timeline-item" style="border-left-color:var(--orange)">
        <div class="tl-icon" style="background:rgba(244,112,58,.1);color:var(--orange)"><i class="fa fa-stop"></i></div>
        <div class="tl-info">
          <div class="tl-label">Clocked Out</div>
          <div class="tl-time">${timeStr}</div>
          <div class="tl-loc"><i class="fa fa-clock"></i> Total: ${hrs}h ${mins}m</div>
        </div>
      </div>`
  }

  showToast(`✓ Clocked out — ${hrs}h ${mins}m logged`, 'orange')
}

// ── Mini Map (Leaflet) ────────────────────────────────────────────
function renderMiniMap(userLat, userLon) {
  const container = document.getElementById('miniMap')
  if (!container || !GEO.schoolConfig) return

  const school = GEO.schoolConfig
  const placeholder = container.querySelector('.mini-map-placeholder')
  if (placeholder) placeholder.remove()

  if (!window.L) {
    // Load Leaflet
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => renderMiniMapLeaflet(container, userLat, userLon, school)
    document.head.appendChild(script)
  } else {
    renderMiniMapLeaflet(container, userLat, userLon, school)
  }
}

function renderMiniMapLeaflet(container, userLat, userLon, school) {
  const L = window.L
  if (!GEO.map) {
    GEO.map = L.map(container, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(GEO.map)

    // School marker
    const schoolIcon = L.divIcon({
      html: '<div style="background:linear-gradient(135deg,#F4703A,#9B3DE8);width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><i class="fa fa-school" style="color:white;font-size:10px"></i></div>',
      className: '', iconAnchor: [12, 12],
    })
    GEO.schoolMarker = L.marker([school.latitude, school.longitude], { icon: schoolIcon })
      .addTo(GEO.map)
      .bindPopup(`<b>${school.name}</b><br>${school.radius}m geofence`)

    // Geofence circle
    GEO.fenceCircle = L.circle([school.latitude, school.longitude], {
      radius: school.radius,
      color: '#9B3DE8', fillColor: '#9B3DE8', fillOpacity: 0.1, weight: 2, dashArray: '6,4',
    }).addTo(GEO.map)

    // User marker
    const userIcon = L.divIcon({
      html: '<div style="background:#3B82F6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
      className: '', iconAnchor: [8, 8],
    })
    GEO.userMarker = L.marker([userLat, userLon], { icon: userIcon }).addTo(GEO.map).bindPopup('Your location')

    GEO.map.fitBounds([
      [school.latitude, school.longitude],
      [userLat, userLon],
    ], { padding: [30, 30] })
  } else {
    GEO.userMarker?.setLatLng([userLat, userLon])
    GEO.map.invalidateSize()
  }
}

/* ═══════════════════════════════════════════════════════════════
   GEOFENCE ADMIN PAGE
   ═══════════════════════════════════════════════════════════════ */
function initGeofencePage() {
  loadAuditLog()
  loadAdminMap()
  updateConfigStatusBar()
}

function loadAdminMap() {
  const container = document.getElementById('geoMap')
  if (!container) return

  const school = GEO.schoolConfig || { latitude: 39.7392, longitude: -75.5398, radius: 60, name: 'Code Differently Campus' }

  const loading = document.getElementById('geoMapLoading')

  const loadLeaflet = () => {
    if (!window.L) {
      const link   = document.createElement('link')
      link.rel  = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      const s = document.createElement('script')
      s.src   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.onload = () => buildAdminMap(container, school, loading)
      document.head.appendChild(s)
    } else {
      buildAdminMap(container, school, loading)
    }
  }
  loadLeaflet()
}

function buildAdminMap(container, school, loadingEl) {
  const L = window.L
  if (loadingEl) loadingEl.remove()

  GEO.adminMap = L.map(container).setView([school.latitude, school.longitude], 16)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(GEO.adminMap)

  // Draggable school pin
  const schoolIcon = L.divIcon({
    html: `<div style="background:linear-gradient(135deg,#F4703A,#9B3DE8);width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.3)"></div>`,
    className: '', iconAnchor: [16, 32],
  })

  GEO.schoolMarker = L.marker([school.latitude, school.longitude], {
    icon: schoolIcon, draggable: true,
  }).addTo(GEO.adminMap).bindPopup('<b>School Location</b><br>Drag to reposition').openPopup()

  GEO.fenceCircle = L.circle([school.latitude, school.longitude], {
    radius: school.radius,
    color: '#9B3DE8', fillColor: '#9B3DE8', fillOpacity: 0.12, weight: 2, dashArray: '6,4',
  }).addTo(GEO.adminMap)

  // Update coords on drag
  GEO.schoolMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng()
    document.getElementById('geoLat').value = pos.lat.toFixed(6)
    document.getElementById('geoLon').value = pos.lng.toFixed(6)
    GEO.fenceCircle.setLatLng([pos.lat, pos.lng])
    showToast('Pin moved — click Save to apply', 'purple')
  })

  // Click map to move pin
  GEO.adminMap.on('click', (e) => {
    GEO.schoolMarker.setLatLng(e.latlng)
    GEO.fenceCircle.setLatLng(e.latlng)
    document.getElementById('geoLat').value = e.latlng.lat.toFixed(6)
    document.getElementById('geoLon').value = e.latlng.lng.toFixed(6)
    showToast('Pin placed — click Save to apply', 'purple')
  })

  // Update circle on radius slider
  document.getElementById('geoRadius')?.addEventListener('input', (e) => {
    GEO.fenceCircle?.setRadius(parseInt(e.target.value))
  })
}

function updateConfigStatusBar() {
  const cfg = GEO.schoolConfig
  if (!cfg) return
  const dv  = document.getElementById('geoStatusDistVal')
  const wv  = document.getElementById('geoStatusWifiVal')
  const uv  = document.getElementById('geoStatusUpdated')
  if (dv) dv.textContent = `Radius: ${cfg.radius}m`
  if (wv) wv.textContent = `WiFi: ${cfg.allowed_wifi_networks?.length || 0} networks`
  if (uv) uv.textContent = cfg.updated_at ? `Updated: ${new Date(cfg.updated_at).toLocaleDateString()}` : '—'
}

async function saveGeofence() {
  const name      = document.getElementById('geoName')?.value?.trim()
  const lat       = parseFloat(document.getElementById('geoLat')?.value)
  const lon       = parseFloat(document.getElementById('geoLon')?.value)
  const radius    = parseInt(document.getElementById('geoRadius')?.value)
  const accuracy  = parseInt(document.getElementById('geoAccuracy')?.value)
  const wifiRaw   = document.getElementById('geoWifi')?.value || ''
  const networks  = wifiRaw.split('\n').map(s => s.trim()).filter(Boolean)

  if (!name || isNaN(lat) || isNaN(lon)) {
    showToast('Name, latitude and longitude are required', 'orange'); return
  }

  try {
    const res = await fetch('/api/location/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, latitude: lat, longitude: lon, radius,
        max_accuracy: accuracy, allowed_wifi_networks: networks,
      })
    })
    const data = await res.json()
    if (data.success) {
      GEO.schoolConfig = data.config
      updateConfigStatusBar()
      // Update map circle
      GEO.fenceCircle?.setRadius(radius)
      GEO.fenceCircle?.setLatLng([lat, lon])
      GEO.schoolMarker?.setLatLng([lat, lon])
      showToast(`✓ Geofence saved — ${name}, ${radius}m radius`, 'green')
    } else throw new Error(data.error)
  } catch (e) { showToast('Save failed: ' + e.message, 'orange') }
}

function applyPreset(r) {
  const slider = document.getElementById('geoRadius')
  const label  = document.getElementById('radiusDisplay')
  if (slider) slider.value = r
  if (label)  label.textContent = r
  GEO.fenceCircle?.setRadius(r)
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'))
  event?.target?.classList.add('active')
}

function useMyLocation() {
  if (!navigator.geolocation) { showToast('GPS not supported', 'orange'); return }
  showToast('Acquiring your location…', 'purple')
  navigator.geolocation.getCurrentPosition((pos) => {
    document.getElementById('geoLat').value = pos.coords.latitude.toFixed(6)
    document.getElementById('geoLon').value = pos.coords.longitude.toFixed(6)
    GEO.adminMap?.setView([pos.coords.latitude, pos.coords.longitude], 17)
    GEO.schoolMarker?.setLatLng([pos.coords.latitude, pos.coords.longitude])
    GEO.fenceCircle?.setLatLng([pos.coords.latitude, pos.coords.longitude])
    showToast(`✓ Location set to ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, 'green')
  }, () => showToast('Could not get location', 'orange'), { enableHighAccuracy: true })
}

function dropPinHere() {
  showToast('Click anywhere on the map to drop the school pin', 'purple')
}

// ── Live Location Test (Admin) ────────────────────────────────────
async function testCurrentLocation() {
  const checks = document.getElementById('geoTestChecks')
  const idle   = document.getElementById('geoTestResult')
  if (checks) checks.style.display = 'grid'
  if (idle)   idle.style.display   = 'none'

  ;['gps','dist','acc','wifi'].forEach(k => {
    const el = document.getElementById(`gtc-${k}-ic`)
    const vl = document.getElementById(`gtc-${k}-val`)
    if (el) el.style.display = 'inline'
    if (vl) vl.textContent   = '—'
    document.getElementById(`gtc-${k}`)?.classList.remove('pass','fail','warn')
  })

  if (!navigator.geolocation) {
    setTestCheck('gps',  'fail', 'Not supported'); return
  }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const school = GEO.schoolConfig
    const dist   = Math.round(haversineClient(
      pos.coords.latitude, pos.coords.longitude,
      school.latitude, school.longitude
    ))
    const acc    = Math.round(pos.coords.accuracy)
    const inside = dist <= school.radius
    const accOk  = acc  <= school.max_accuracy

    await delay(200); setTestCheck('gps', 'pass', `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
    await delay(300); setTestCheck('acc', accOk ? 'pass' : 'fail', `±${acc}m`)
    await delay(400); setTestCheck('dist', inside ? 'pass' : 'fail', `${dist}m ${inside?'✓':'✗'}`)
    await delay(200); setTestCheck('wifi', 'warn', 'Not detectable via web')

    showToast(
      inside
        ? `✓ You are within the geofence (${dist}m from campus)`
        : `✗ Outside geofence — ${dist}m from campus (max ${school.radius}m)`,
      inside ? 'green' : 'orange'
    )
  }, (err) => {
    setTestCheck('gps', 'fail', 'GPS denied/unavailable')
    showToast('Location access denied', 'orange')
  }, { enableHighAccuracy: true, timeout: 10000 })
}

// ── Audit Log ─────────────────────────────────────────────────────
async function loadAuditLog(studentId) {
  const tbody = document.getElementById('auditTableBody')
  if (!tbody) return

  try {
    const url  = '/api/location/verifications' + (studentId ? `?student_id=${studentId}` : '')
    const res  = await fetch(url)
    const data = await res.json()

    // Update stats
    const { stats } = data
    ;[['ast-full',stats.full],['ast-partial',stats.partial],['ast-failed',stats.failed],
      ['ast-avg',stats.avg_distance+'m']].forEach(([id, val]) => {
      const el = document.getElementById(id); if (el) el.textContent = val
    })

    if (!data.records?.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray400);padding:24px">
        No verifications yet — students clock in to generate audit data</td></tr>`
      return
    }

    tbody.innerHTML = data.records.map(r => `
      <tr>
        <td><code style="font-size:12px">${r.student_id}</code></td>
        <td><span class="time-chip">${new Date(r.timestamp).toLocaleTimeString()}</span></td>
        <td>${r.distance_from_school}m</td>
        <td>±${r.gps_accuracy}m</td>
        <td>${r.wifi_verified
          ? '<span style="color:var(--green)"><i class="fa fa-wifi"></i> ✓</span>'
          : '<span style="color:var(--gray400)">—</span>'}</td>
        <td><span class="badge badge-${r.overall_status}">${r.overall_status}</span></td>
        <td style="font-size:12px;color:var(--gray600)">${r.rejection_reason || '—'}</td>
      </tr>`).join('')
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:16px">Error: ${e.message}</td></tr>`
  }
}

function filterAuditLog(val) { loadAuditLog(val || undefined) }

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════ */

// Haversine — client-side copy (backend has authoritative version)
function haversineClient(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const r = d => d * Math.PI / 180
  const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function setBannerState(type, title, sub) {
  const banner  = document.getElementById('geoBanner')
  const pulse   = document.getElementById('geoPulse')
  const t       = document.getElementById('geoBannerTitle')
  const s       = document.getElementById('geoBannerSub')
  const bdg     = document.getElementById('geoBannerBadge')
  if (!banner) return

  const map = {
    inside:  { pulse: 'inside',  badge: '<span class="badge badge-present">On Campus</span>' },
    outside: { pulse: 'outside', badge: '<span class="badge badge-absent">Off Campus</span>' },
    partial: { pulse: 'partial', badge: '<span class="badge badge-late">Partial</span>' },
    scanning:{ pulse: 'scanning',badge: '<span class="badge badge-ready">Scanning…</span>' },
  }
  const cfg = map[type] || map.scanning
  if (pulse) pulse.className = 'geo-pulse ' + cfg.pulse
  if (t)     t.textContent   = title
  if (s)     s.textContent   = sub
  if (bdg)   bdg.innerHTML   = cfg.badge
}

function setDistanceFill(pct) {
  const fill = document.getElementById('geoDistanceFill')
  if (fill) fill.style.width = pct + '%'
}

function setGPSStatus(state, text) {
  const el = document.getElementById('gpsStatus')
  if (!el) return
  const icons = { ok: 'fa-location-dot', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' }
  const icon  = icons[state] || 'fa-satellite-dish'
  el.className = 'gps-status' + (state === 'ok' ? ' gps-ok' : state === 'error' ? ' gps-err' : '')
  el.innerHTML = `<i class="fa ${icon}"></i> <span id="gpsText">${text}</span>`
}

function setCheckState(key, state, val) {
  const row = document.getElementById(`lvc-${key}`)
  const valEl = document.getElementById(`lvc-${key}-val`)
  const stEl  = document.getElementById(`lvc-${key}-st`)
  if (!row) return
  row.className = 'lv-check ' + (state === 'pass' ? 'pass' : state === 'fail' ? 'fail' : state === 'warn' ? 'warn' : '')
  if (valEl) valEl.textContent = val
  if (stEl)  stEl.innerHTML    =
    state === 'pass' ? '<i class="fa fa-check"></i>' :
    state === 'fail' ? '<i class="fa fa-xmark"></i>' :
    state === 'warn' ? '<i class="fa fa-minus"></i>' :
    '<i class="fa fa-spinner fa-spin"></i>'
}

function setTestCheck(key, state, val) {
  const el = document.getElementById(`gtc-${key}`)
  const vl = document.getElementById(`gtc-${key}-val`)
  const ic = document.getElementById(`gtc-${key}-ic`)
  if (el) el.className = 'geo-tc ' + state
  if (vl) vl.textContent = val
  if (ic) ic.style.display = 'none'
}
