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

function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtnText');
  const spin = document.getElementById('loginSpinner');
  if (btn) btn.style.display = 'none';
  if (spin) spin.style.display = 'inline-flex';
  setTimeout(() => {
    const dest = { student: '/student', instructor: '/instructor', admin: '/admin' };
    window.location.href = dest[currentRole] || '/student';
  }, 800);
}

function togglePw() {
  const inp = document.getElementById('pwInput');
  const ico = document.getElementById('eyeIcon');
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (ico) { ico.className = show ? 'fa fa-eye-slash' : 'fa fa-eye'; }
}

/* ── CLOCK IN / OUT ─────────────────────────────── */
let isClockedIn = false;
let clockInTime = null;
let gpsCoords = null;

// Attempt GPS on student page load
if (document.getElementById('clockBtn')) {
  const gpsText = document.getElementById('gpsText');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsCoords = pos.coords;
        if (gpsText) {
          gpsText.textContent = `Location verified ✓ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
          gpsText.parentElement.classList.add('gps-ok');
        }
      },
      () => {
        if (gpsText) {
          gpsText.textContent = 'Location unavailable — manual check required';
          gpsText.parentElement.classList.add('gps-err');
        }
      }
    );
  } else {
    if (gpsText) gpsText.textContent = 'GPS not supported on this device';
  }
}

function handleClock() {
  const btn = document.getElementById('clockBtn');
  const icon = document.getElementById('clockIcon');
  const btnText = document.getElementById('clockBtnText');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.getElementById('clockStatusText');
  const badge = document.getElementById('statusBadge');
  const log = document.getElementById('todayLog');

  if (!isClockedIn) {
    // CLOCK IN
    isClockedIn = true;
    clockInTime = new Date();
    const timeStr = clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    btn.className = 'btn-clock btn-clockout';
    icon.className = 'fa fa-stop';
    btnText.textContent = 'Clock Out';
    statusDot.className = 'status-dot dot-active';
    statusText.textContent = 'Clocked In';
    if (badge) badge.innerHTML = '<span class="badge badge-present">● Clocked In</span>';

    // Add to timeline
    if (log) {
      log.innerHTML = `
        <div class="timeline-item">
          <div class="tl-icon"><i class="fa fa-play"></i></div>
          <div class="tl-info">
            <div class="tl-label">Clocked In</div>
            <div class="tl-time">${timeStr}</div>
            <div class="tl-loc"><i class="fa fa-location-dot"></i> ${gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : 'Location captured'}</div>
          </div>
        </div>`;
    }
    showToast('✓ Clocked in at ' + timeStr, 'green');
  } else {
    // CLOCK OUT
    isClockedIn = false;
    const outTime = new Date();
    const timeStr = outTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const diff = Math.round((outTime - clockInTime) / 60000);
    const hrs = Math.floor(diff / 60), mins = diff % 60;

    btn.className = 'btn-clock btn-clockin';
    icon.className = 'fa fa-play';
    btnText.textContent = 'Clock In';
    statusDot.className = 'status-dot dot-out';
    statusText.textContent = 'Shift Complete';
    if (badge) badge.innerHTML = '<span class="badge badge-late">Clocked Out</span>';

    const clockInStr = clockInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (log) {
      log.innerHTML = `
        <div class="timeline-item">
          <div class="tl-icon"><i class="fa fa-play"></i></div>
          <div class="tl-info">
            <div class="tl-label">Clocked In</div>
            <div class="tl-time">${clockInStr}</div>
            <div class="tl-loc"><i class="fa fa-location-dot"></i> ${gpsCoords ? `${gpsCoords.latitude.toFixed(4)}, ${gpsCoords.longitude.toFixed(4)}` : 'Location captured'}</div>
          </div>
        </div>
        <div class="timeline-item" style="border-left-color:var(--orange)">
          <div class="tl-icon" style="background:rgba(244,112,58,.1);color:var(--orange)"><i class="fa fa-stop"></i></div>
          <div class="tl-info">
            <div class="tl-label">Clocked Out</div>
            <div class="tl-time">${timeStr}</div>
            <div class="tl-loc"><i class="fa fa-clock"></i> Total: ${hrs}h ${mins}m</div>
          </div>
        </div>`;
    }
    showToast(`✓ Clocked out — ${hrs}h ${mins}m today`, 'orange');
  }
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

/* ── QB SYNC ─────────────────────────────────────── */
function syncQuickBooks() {
  const status = document.getElementById('qbSyncStatus');
  if (!status) return;
  status.style.display = 'block';
  status.innerHTML = '<i class="fa fa-spinner fa-spin"></i> AI reviewing entries…';
  status.style.color = 'var(--yellow)';
  setTimeout(() => {
    status.innerHTML = '<i class="fa fa-robot"></i> AI check passed — 5 Present, 2 Late flagged for review…';
    setTimeout(() => {
      status.innerHTML = '<i class="fa fa-circle-check"></i> ✓ Synced to QuickBooks — 7 payroll entries created';
      status.style.color = 'var(--green)';
    }, 1800);
  }, 1200);
}

function previewQB() {
  showToast('Opening QuickBooks preview…', 'purple');
}

function syncQBFromAdmin() {
  showToast('⚡ Syncing payroll to QuickBooks…', 'purple');
  setTimeout(() => showToast('✓ 36 payroll entries synced to QuickBooks!', 'green'), 2000);
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
