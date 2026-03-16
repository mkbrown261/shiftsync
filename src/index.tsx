import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Serve static files
app.use('/static/*', serveStatic({ root: './' }))

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect Differently — Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <style>
    :root {
      --cd-navy: #1E1B2E;
      --cd-navy-light: #2A263D;
      --cd-orange: #F4703A;
      --cd-pink: #E040A0;
      --cd-purple: #9B3DE8;
      --cd-accent: #7C4DFF;
    }
    body { background: var(--cd-navy); font-family: 'Inter', system-ui, sans-serif; }
    .gradient-text {
      background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .logo-icon {
      width: 48px; height: 48px;
      background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
    }
    .gradient-btn {
      background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8);
      transition: opacity 0.2s, transform 0.1s;
    }
    .gradient-btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .role-card {
      border: 2px solid transparent;
      transition: all 0.2s;
      cursor: pointer;
    }
    .role-card:hover, .role-card.active {
      border-color: #9B3DE8;
      background: rgba(155,61,232,0.15);
    }
    .input-field {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.15);
      color: white;
      transition: border-color 0.2s;
    }
    .input-field:focus {
      outline: none;
      border-color: #9B3DE8;
      background: rgba(155,61,232,0.1);
    }
    .input-field::placeholder { color: rgba(255,255,255,0.4); }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); }
    .snowflake {
      display: inline-block;
      font-size: 28px;
      background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-10">
      <div class="flex items-center justify-center gap-3 mb-3">
        <span class="snowflake">✳</span>
        <div>
          <span class="text-3xl font-bold text-white">Connect</span>
          <span class="text-3xl font-light text-gray-400"> Differently</span>
        </div>
      </div>
      <p class="text-gray-500 text-sm">Attendance & Time Tracking Platform</p>
    </div>

    <!-- Login Card -->
    <div class="card rounded-2xl p-8">
      <h2 class="text-white text-xl font-semibold mb-6 text-center">Sign In</h2>

      <!-- Role Selector -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="role-card active rounded-xl p-3 text-center" onclick="selectRole('student', this)">
          <i class="fas fa-user-graduate text-2xl mb-1 gradient-text"></i>
          <p class="text-white text-xs font-medium">Student</p>
        </div>
        <div class="role-card rounded-xl p-3 text-center" onclick="selectRole('instructor', this)">
          <i class="fas fa-chalkboard-teacher text-2xl mb-1 gradient-text"></i>
          <p class="text-white text-xs font-medium">Instructor</p>
        </div>
        <div class="role-card rounded-xl p-3 text-center" onclick="selectRole('admin', this)">
          <i class="fas fa-shield-alt text-2xl mb-1 gradient-text"></i>
          <p class="text-white text-xs font-medium">Admin</p>
        </div>
      </div>

      <!-- Form -->
      <form onsubmit="handleLogin(event)">
        <div class="mb-4">
          <label class="text-gray-400 text-sm mb-2 block">Email</label>
          <input type="email" id="email" placeholder="you@codedifferently.org"
            class="input-field w-full rounded-xl px-4 py-3 text-sm" required/>
        </div>
        <div class="mb-6">
          <label class="text-gray-400 text-sm mb-2 block">Password</label>
          <div class="relative">
            <input type="password" id="password" placeholder="••••••••"
              class="input-field w-full rounded-xl px-4 py-3 text-sm pr-10" required/>
            <button type="button" onclick="togglePwd()" class="absolute right-3 top-3 text-gray-500 hover:text-gray-300">
              <i class="fas fa-eye text-sm"></i>
            </button>
          </div>
        </div>
        <button type="submit" class="gradient-btn w-full py-3 rounded-xl text-white font-semibold text-sm">
          Sign In
        </button>
      </form>

      <p class="text-center text-gray-500 text-xs mt-4">
        <a href="#" class="text-purple-400 hover:text-purple-300">Forgot password?</a>
      </p>
    </div>

    <!-- Demo shortcuts -->
    <div class="mt-4 card rounded-xl p-4">
      <p class="text-gray-500 text-xs text-center mb-3">Quick Demo Access</p>
      <div class="grid grid-cols-3 gap-2">
        <a href="/student" class="text-center py-2 rounded-lg bg-purple-900/40 text-purple-300 text-xs hover:bg-purple-900/60 transition">
          <i class="fas fa-user-graduate block mb-1"></i>Student
        </a>
        <a href="/instructor" class="text-center py-2 rounded-lg bg-pink-900/40 text-pink-300 text-xs hover:bg-pink-900/60 transition">
          <i class="fas fa-chalkboard-teacher block mb-1"></i>Instructor
        </a>
        <a href="/admin" class="text-center py-2 rounded-lg bg-orange-900/40 text-orange-300 text-xs hover:bg-orange-900/60 transition">
          <i class="fas fa-shield-alt block mb-1"></i>Admin
        </a>
      </div>
    </div>
  </div>

  <script>
    let selectedRole = 'student';
    function selectRole(role, el) {
      selectedRole = role;
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    }
    function togglePwd() {
      const p = document.getElementById('password');
      p.type = p.type === 'password' ? 'text' : 'password';
    }
    function handleLogin(e) {
      e.preventDefault();
      const routes = { student: '/student', instructor: '/instructor', admin: '/admin' };
      window.location.href = routes[selectedRole];
    }
  </script>
</body>
</html>`)
})

// ─── STUDENT CLOCK-IN PAGE ─────────────────────────────────────────────────────
app.get('/student', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect Differently — Student</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { background: #1E1B2E; font-family: system-ui, sans-serif; }
    .gradient-text { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .gradient-btn { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); transition: all 0.2s; }
    .gradient-btn:hover { opacity: 0.9; transform: scale(1.02); }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; }
    .nav-link { color: rgba(255,255,255,0.5); transition: color 0.2s; }
    .nav-link:hover, .nav-link.active { color: white; }
    .clock-ring {
      width: 200px; height: 200px;
      border-radius: 50%;
      background: conic-gradient(from 0deg, #F4703A, #E040A0, #9B3DE8, #F4703A);
      padding: 4px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .clock-ring:hover { transform: scale(1.05); box-shadow: 0 0 40px rgba(155,61,232,0.5); }
    .clock-inner {
      width: 100%; height: 100%;
      border-radius: 50%;
      background: #1E1B2E;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
    }
    .badge-green { background: rgba(34,197,94,0.2); color: #4ade80; }
    .badge-yellow { background: rgba(234,179,8,0.2); color: #facc15; }
    .badge-red { background: rgba(239,68,68,0.2); color: #f87171; }
    .tab-btn { padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; transition: all 0.2s; color: rgba(255,255,255,0.5); }
    .tab-btn.active { background: rgba(155,61,232,0.3); color: white; }
    .snowflake { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  </style>
</head>
<body class="min-h-screen">
  <!-- Nav -->
  <nav class="flex items-center justify-between px-6 py-4 border-b border-white/10">
    <div class="flex items-center gap-2">
      <span class="snowflake text-xl font-bold">✳</span>
      <span class="text-white font-semibold text-sm">Connect <span class="text-gray-400 font-light">Differently</span></span>
    </div>
    <div class="flex items-center gap-5 text-sm">
      <span class="nav-link active cursor-pointer" onclick="showTab('clock')"><i class="fas fa-clock mr-1"></i>Clock</span>
      <span class="nav-link cursor-pointer" onclick="showTab('history')"><i class="fas fa-list mr-1"></i>History</span>
      <span class="nav-link cursor-pointer" onclick="showTab('profile')"><i class="fas fa-user mr-1"></i>Profile</span>
    </div>
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-full gradient-btn flex items-center justify-center text-white text-xs font-bold">JD</div>
      <a href="/" class="text-gray-500 hover:text-white text-sm"><i class="fas fa-sign-out-alt"></i></a>
    </div>
  </nav>

  <!-- CLOCK TAB -->
  <div id="tab-clock" class="max-w-2xl mx-auto px-4 py-8">
    <div class="text-center mb-8">
      <h1 class="text-white text-2xl font-bold mb-1">Good morning, <span class="gradient-text">Jordan</span></h1>
      <p class="text-gray-500 text-sm" id="live-date"></p>
    </div>

    <!-- Today's Shift Info -->
    <div class="card p-4 mb-6 flex items-center justify-between">
      <div>
        <p class="text-gray-400 text-xs mb-1">Today's Shift</p>
        <p class="text-white font-semibold">Web Development Cohort</p>
        <p class="text-gray-400 text-xs mt-1"><i class="fas fa-map-marker-alt mr-1 text-purple-400"></i>Building A — Room 201</p>
      </div>
      <div class="text-right">
        <p class="text-gray-400 text-xs mb-1">Scheduled</p>
        <p class="text-white font-semibold">9:00 AM – 3:00 PM</p>
        <span class="status-badge badge-green mt-1"><span class="w-1.5 h-1.5 bg-green-400 rounded-full"></span>Active</span>
      </div>
    </div>

    <!-- Clock Button -->
    <div class="flex flex-col items-center mb-8">
      <div class="clock-ring mb-6" onclick="toggleClock()" id="clock-ring">
        <div class="clock-inner">
          <i class="fas fa-fingerprint text-3xl text-white mb-2" id="clock-icon"></i>
          <p class="text-white font-bold text-lg" id="clock-action">TAP TO CLOCK IN</p>
          <p class="text-gray-400 text-xs" id="clock-time"></p>
        </div>
      </div>
      <div id="status-display" class="text-center hidden">
        <span class="status-badge badge-green"><i class="fas fa-check-circle mr-1"></i><span id="status-text">Clocked In</span></span>
        <p class="text-gray-400 text-xs mt-2" id="duration-text">0h 0m elapsed</p>
      </div>
    </div>

    <!-- GPS Status -->
    <div class="card p-4 mb-6" id="gps-card">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-900/40 flex items-center justify-center">
            <i class="fas fa-location-arrow text-purple-400"></i>
          </div>
          <div>
            <p class="text-white text-sm font-medium">Location Verification</p>
            <p class="text-gray-400 text-xs" id="gps-status">Waiting for clock-in...</p>
          </div>
        </div>
        <span class="status-badge badge-yellow" id="gps-badge"><i class="fas fa-clock mr-1"></i>Pending</span>
      </div>
    </div>

    <!-- Quick Stats -->
    <div class="grid grid-cols-3 gap-3">
      <div class="card p-4 text-center">
        <p class="text-2xl font-bold text-white">47.5</p>
        <p class="text-gray-400 text-xs mt-1">Hours This Month</p>
      </div>
      <div class="card p-4 text-center">
        <p class="text-2xl font-bold text-yellow-400">2</p>
        <p class="text-gray-400 text-xs mt-1">Lates</p>
      </div>
      <div class="card p-4 text-center">
        <p class="text-2xl font-bold text-green-400">✓</p>
        <p class="text-gray-400 text-xs mt-1">Stipend Eligible</p>
      </div>
    </div>
  </div>

  <!-- HISTORY TAB -->
  <div id="tab-history" class="max-w-2xl mx-auto px-4 py-8 hidden">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-white text-xl font-bold">Attendance History</h2>
      <select class="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-2">
        <option>March 2025</option>
        <option>February 2025</option>
      </select>
    </div>
    <div class="space-y-3">
      ${generateAttendanceRows()}
    </div>
  </div>

  <!-- PROFILE TAB -->
  <div id="tab-profile" class="max-w-2xl mx-auto px-4 py-8 hidden">
    <div class="card p-6 mb-6">
      <div class="flex items-center gap-4 mb-6">
        <div class="w-16 h-16 rounded-2xl gradient-btn flex items-center justify-center text-white text-2xl font-bold">JD</div>
        <div>
          <h2 class="text-white text-xl font-bold">Jordan Davis</h2>
          <p class="text-gray-400 text-sm">Web Development Cohort · Cohort 12</p>
          <span class="status-badge badge-green mt-1"><i class="fas fa-star mr-1"></i>Stipend Eligible</span>
        </div>
      </div>
      <!-- Stats -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white/5 rounded-xl p-4">
          <p class="text-gray-400 text-xs mb-1">Total Hours</p>
          <p class="text-white text-2xl font-bold">147.5<span class="text-gray-400 text-sm font-normal"> hrs</span></p>
          <div class="w-full bg-white/10 rounded-full h-1.5 mt-2">
            <div class="h-1.5 rounded-full" style="width:82%;background:linear-gradient(90deg,#F4703A,#9B3DE8)"></div>
          </div>
        </div>
        <div class="bg-white/5 rounded-xl p-4">
          <p class="text-gray-400 text-xs mb-1">Attendance Rate</p>
          <p class="text-white text-2xl font-bold">92<span class="text-gray-400 text-sm font-normal">%</span></p>
          <div class="w-full bg-white/10 rounded-full h-1.5 mt-2">
            <div class="h-1.5 rounded-full bg-green-500" style="width:92%"></div>
          </div>
        </div>
        <div class="bg-white/5 rounded-xl p-4">
          <p class="text-gray-400 text-xs mb-1">Lates (This Month)</p>
          <p class="text-yellow-400 text-2xl font-bold">2 <span class="text-gray-400 text-sm font-normal">/ 3 allowed</span></p>
        </div>
        <div class="bg-white/5 rounded-xl p-4">
          <p class="text-gray-400 text-xs mb-1">Absences</p>
          <p class="text-white text-2xl font-bold">3 <span class="text-gray-400 text-sm font-normal">total</span></p>
        </div>
      </div>
    </div>
    <!-- Standing Chart -->
    <div class="card p-6">
      <h3 class="text-white font-semibold mb-4">Monthly Hours Trend</h3>
      <canvas id="hoursChart" height="120"></canvas>
    </div>
  </div>

  <script>
    let isClockedIn = false;
    let clockInTime = null;
    let timerInterval = null;

    function showTab(tab) {
      ['clock','history','profile'].forEach(t => {
        document.getElementById('tab-' + t).classList.add('hidden');
      });
      document.getElementById('tab-' + tab).classList.remove('hidden');
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      if (tab === 'profile') initChart();
    }

    function updateLiveClock() {
      const now = new Date();
      document.getElementById('live-date').textContent =
        now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}) +
        ' · ' + now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      document.getElementById('clock-time').textContent =
        now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    function toggleClock() {
      if (!isClockedIn) {
        clockIn();
      } else {
        clockOut();
      }
    }

    function clockIn() {
      isClockedIn = true;
      clockInTime = new Date();
      document.getElementById('clock-action').textContent = 'TAP TO CLOCK OUT';
      document.getElementById('clock-icon').className = 'fas fa-stop-circle text-3xl text-red-400 mb-2';
      document.getElementById('status-display').classList.remove('hidden');
      document.getElementById('gps-status').textContent = 'Verifying location...';

      // Simulate GPS verification
      setTimeout(() => {
        document.getElementById('gps-status').textContent = 'Verified · Code Differently HQ';
        document.getElementById('gps-badge').className = 'status-badge badge-green';
        document.getElementById('gps-badge').innerHTML = '<i class="fas fa-check-circle mr-1"></i>Verified';
      }, 2000);

      timerInterval = setInterval(updateElapsed, 1000);

      // Pulse animation
      document.getElementById('clock-ring').style.animation = 'none';
      showToast('✅ Clocked in successfully!', 'green');
    }

    function clockOut() {
      isClockedIn = false;
      clearInterval(timerInterval);
      document.getElementById('clock-action').textContent = 'TAP TO CLOCK IN';
      document.getElementById('clock-icon').className = 'fas fa-fingerprint text-3xl text-white mb-2';
      document.getElementById('status-display').classList.add('hidden');
      document.getElementById('gps-status').textContent = 'Waiting for clock-in...';
      document.getElementById('gps-badge').className = 'status-badge badge-yellow';
      document.getElementById('gps-badge').innerHTML = '<i class="fas fa-clock mr-1"></i>Pending';
      showToast('👋 Clocked out. Great work today!', 'purple');
    }

    function updateElapsed() {
      if (!clockInTime) return;
      const elapsed = Math.floor((new Date() - clockInTime) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      document.getElementById('duration-text').textContent =
        h + 'h ' + m + 'm ' + s + 's elapsed';
    }

    function showToast(msg, color) {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:' +
        (color === 'green' ? '#065f46' : '#3b0764') +
        ';color:white;padding:12px 24px;border-radius:12px;font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    function initChart() {
      const ctx = document.getElementById('hoursChart');
      if (!ctx || ctx.dataset.init) return;
      ctx.dataset.init = '1';
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Oct','Nov','Dec','Jan','Feb','Mar'],
          datasets: [{
            label: 'Hours',
            data: [38, 42, 35, 48, 44, 47.5],
            borderColor: '#9B3DE8',
            backgroundColor: 'rgba(155,61,232,0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#9B3DE8'
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }
  </script>
</body>
</html>`)
})

function generateAttendanceRows(): string {
  const data = [
    { date: 'Mon, Mar 10', in: '8:58 AM', out: '3:02 PM', hours: '6h 4m', status: 'present' },
    { date: 'Tue, Mar 11', in: '9:12 AM', out: '3:00 PM', hours: '5h 48m', status: 'late' },
    { date: 'Wed, Mar 12', in: '—', out: '—', hours: '0h', status: 'absent' },
    { date: 'Thu, Mar 13', in: '8:55 AM', out: '3:01 PM', hours: '6h 6m', status: 'present' },
    { date: 'Fri, Mar 14', in: '9:01 AM', out: '3:00 PM', hours: '5h 59m', status: 'present' },
    { date: 'Mon, Mar 17', in: '8:52 AM', out: '3:03 PM', hours: '6h 11m', status: 'present' },
    { date: 'Tue, Mar 18', in: '9:18 AM', out: '3:00 PM', hours: '5h 42m', status: 'late' },
  ]
  return data.map(r => {
    const badge = r.status === 'present'
      ? '<span class="status-badge badge-green"><i class="fas fa-check mr-1"></i>Present</span>'
      : r.status === 'late'
      ? '<span class="status-badge badge-yellow"><i class="fas fa-clock mr-1"></i>Late</span>'
      : '<span class="status-badge badge-red"><i class="fas fa-times mr-1"></i>Absent</span>'
    return `<div class="card p-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
          <i class="fas fa-calendar text-purple-400 text-sm"></i>
        </div>
        <div>
          <p class="text-white text-sm font-medium">${r.date}</p>
          <p class="text-gray-400 text-xs">${r.in} → ${r.out} · ${r.hours}</p>
        </div>
      </div>
      ${badge}
    </div>`
  }).join('')
}

// ─── INSTRUCTOR PAGE ───────────────────────────────────────────────────────────
app.get('/instructor', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect Differently — Instructor</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <style>
    body { background: #1E1B2E; font-family: system-ui, sans-serif; }
    .gradient-text { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .gradient-btn { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; }
    .status-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500; }
    .badge-green { background:rgba(34,197,94,0.2); color:#4ade80; }
    .badge-yellow { background:rgba(234,179,8,0.2); color:#facc15; }
    .badge-red { background:rgba(239,68,68,0.2); color:#f87171; }
    .badge-blue { background:rgba(59,130,246,0.2); color:#60a5fa; }
    .select-status {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: white;
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 13px;
      cursor: pointer;
    }
    .student-row { transition: background 0.15s; }
    .student-row:hover { background: rgba(255,255,255,0.04); }
    .confirm-btn { background: linear-gradient(135deg, #F4703A, #9B3DE8); padding: 5px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; color: white; cursor: pointer; transition: opacity 0.2s; }
    .confirm-btn:hover { opacity: 0.85; }
    .snowflake { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .search-input { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); color: white; border-radius: 10px; padding: 8px 14px 8px 36px; font-size: 13px; width: 220px; }
    .search-input::placeholder { color: rgba(255,255,255,0.3); }
    .search-input:focus { outline: none; border-color: #9B3DE8; }
    .qb-confirm-badge { background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; border-radius: 6px; font-size: 11px; padding: 2px 8px; }
  </style>
</head>
<body class="min-h-screen">
  <!-- Nav -->
  <nav class="flex items-center justify-between px-6 py-4 border-b border-white/10">
    <div class="flex items-center gap-2">
      <span class="snowflake text-xl font-bold">✳</span>
      <span class="text-white font-semibold text-sm">Connect <span class="text-gray-400 font-light">Differently</span></span>
    </div>
    <span class="gradient-text font-semibold text-sm"><i class="fas fa-chalkboard-teacher mr-2"></i>Instructor View</span>
    <div class="flex items-center gap-3">
      <span class="text-gray-400 text-sm">Prof. Martinez</span>
      <div class="w-8 h-8 rounded-full gradient-btn flex items-center justify-center text-white text-xs font-bold">PM</div>
      <a href="/" class="text-gray-500 hover:text-white text-sm ml-2"><i class="fas fa-sign-out-alt"></i></a>
    </div>
  </nav>

  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-white text-2xl font-bold">Attendance Verification</h1>
        <p class="text-gray-400 text-sm mt-1"><i class="fas fa-calendar mr-1"></i>Wednesday, March 19, 2025 · Web Development Cohort 12</p>
      </div>
      <div class="flex gap-3">
        <button onclick="markAllPresent()" class="gradient-btn px-4 py-2 rounded-xl text-white text-sm font-semibold">
          <i class="fas fa-check-double mr-2"></i>Mark All Present
        </button>
        <button onclick="confirmAllQB()" class="bg-green-700 hover:bg-green-600 px-4 py-2 rounded-xl text-white text-sm font-semibold transition">
          <i class="fas fa-file-invoice-dollar mr-2"></i>Send to QuickBooks
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="card p-4 text-center">
        <p class="text-3xl font-bold text-white" id="count-total">18</p>
        <p class="text-gray-400 text-xs mt-1">Total Students</p>
      </div>
      <div class="card p-4 text-center">
        <p class="text-3xl font-bold text-green-400" id="count-present">12</p>
        <p class="text-gray-400 text-xs mt-1">Present</p>
      </div>
      <div class="card p-4 text-center">
        <p class="text-3xl font-bold text-yellow-400" id="count-late">3</p>
        <p class="text-gray-400 text-xs mt-1">Late</p>
      </div>
      <div class="card p-4 text-center">
        <p class="text-3xl font-bold text-red-400" id="count-absent">3</p>
        <p class="text-gray-400 text-xs mt-1">Absent / Unverified</p>
      </div>
    </div>

    <!-- Attendance Table -->
    <div class="card overflow-hidden">
      <!-- Table Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div class="relative">
          <i class="fas fa-search absolute left-3 top-2.5 text-gray-500 text-sm"></i>
          <input type="text" placeholder="Search students..." class="search-input" oninput="filterStudents(this.value)"/>
        </div>
        <div class="flex items-center gap-3">
          <select class="select-status text-xs" onchange="filterByStatus(this.value)">
            <option value="all">All Statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="unverified">Unverified</option>
          </select>
          <span class="text-gray-400 text-xs"><span id="qb-confirmed">0</span> / 18 QB Confirmed</span>
        </div>
      </div>
      <!-- Column Headers -->
      <div class="grid grid-cols-12 gap-2 px-5 py-3 text-xs text-gray-500 border-b border-white/5">
        <div class="col-span-3">Student</div>
        <div class="col-span-2">Clock In</div>
        <div class="col-span-2">Clock Out</div>
        <div class="col-span-1">Hours</div>
        <div class="col-span-2">Status</div>
        <div class="col-span-2 text-right">QB Confirm</div>
      </div>
      <!-- Rows -->
      <div id="student-table"></div>
    </div>

    <!-- Late Threshold Banner -->
    <div class="card p-4 mt-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <i class="fas fa-clock text-yellow-400 text-lg"></i>
        <div>
          <p class="text-white text-sm font-medium">Late Threshold: <span class="text-yellow-400">10 minutes</span> after shift start</p>
          <p class="text-gray-400 text-xs">Students clocking in after 9:10 AM are automatically flagged as Late</p>
        </div>
      </div>
      <a href="/settings" class="text-purple-400 text-xs hover:text-purple-300">Configure <i class="fas fa-arrow-right ml-1"></i></a>
    </div>
  </div>

  <script>
    const students = [
      { id:1, name:'Jordan Davis', initials:'JD', clockIn:'8:58 AM', clockOut:'3:02 PM', hours:'6h 4m', status:'present', qb:false },
      { id:2, name:'Alex Rivera', initials:'AR', clockIn:'9:14 AM', clockOut:'3:00 PM', hours:'5h 46m', status:'late', qb:false },
      { id:3, name:'Sam Lee', initials:'SL', clockIn:'—', clockOut:'—', hours:'0h', status:'absent', qb:false },
      { id:4, name:'Morgan Chen', initials:'MC', clockIn:'8:53 AM', clockOut:'3:01 PM', hours:'6h 8m', status:'present', qb:false },
      { id:5, name:'Taylor Kim', initials:'TK', clockIn:'9:22 AM', clockOut:'3:00 PM', hours:'5h 38m', status:'late', qb:false },
      { id:6, name:'Casey Brown', initials:'CB', clockIn:'8:59 AM', clockOut:'3:03 PM', hours:'6h 4m', status:'present', qb:false },
      { id:7, name:'Riley Johnson', initials:'RJ', clockIn:'—', clockOut:'—', hours:'0h', status:'absent', qb:false },
      { id:8, name:'Avery Wilson', initials:'AW', clockIn:'9:01 AM', clockOut:'3:00 PM', hours:'5h 59m', status:'present', qb:false },
      { id:9, name:'Drew Martinez', initials:'DM', clockIn:'8:55 AM', clockOut:'3:02 PM', hours:'6h 7m', status:'present', qb:false },
      { id:10, name:'Peyton Garcia', initials:'PG', clockIn:'9:18 AM', clockOut:'—', hours:'—', status:'late', qb:false },
      { id:11, name:'Quinn Thompson', initials:'QT', clockIn:'8:57 AM', clockOut:'3:01 PM', hours:'6h 4m', status:'present', qb:false },
      { id:12, name:'Skylar Adams', initials:'SA', clockIn:'—', clockOut:'—', hours:'0h', status:'absent', qb:false },
      { id:13, name:'Blake Harris', initials:'BH', clockIn:'9:00 AM', clockOut:'3:00 PM', hours:'6h', status:'present', qb:false },
      { id:14, name:'Cameron White', initials:'CW', clockIn:'8:51 AM', clockOut:'3:04 PM', hours:'6h 13m', status:'present', qb:false },
      { id:15, name:'Finley Clark', initials:'FC', clockIn:'9:03 AM', clockOut:'3:00 PM', hours:'5h 57m', status:'present', qb:false },
      { id:16, name:'Parker Lewis', initials:'PL', clockIn:'8:58 AM', clockOut:'3:01 PM', hours:'6h 3m', status:'present', qb:false },
      { id:17, name:'Reese Young', initials:'RY', clockIn:'9:08 AM', clockOut:'3:00 PM', hours:'5h 52m', status:'present', qb:false },
      { id:18, name:'Dakota Scott', initials:'DS', clockIn:'8:56 AM', clockOut:'3:02 PM', hours:'6h 6m', status:'present', qb:false },
    ];

    function renderTable(data) {
      const html = data.map(s => {
        const statusColors = { present:'badge-green', late:'badge-yellow', absent:'badge-red', unverified:'badge-blue' };
        const statusIcons = { present:'fa-check', late:'fa-clock', absent:'fa-times', unverified:'fa-question' };
        const qbHtml = s.qb
          ? '<span class="qb-confirm-badge"><i class="fas fa-check mr-1"></i>Confirmed</span>'
          : '<button class="confirm-btn" onclick="confirmQB('+s.id+')"><i class="fas fa-check mr-1"></i>Confirm</button>';
        return \`<div class="student-row grid grid-cols-12 gap-2 px-5 py-3.5 border-b border-white/5 items-center" id="row-\${s.id}">
          <div class="col-span-3 flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold" style="background:linear-gradient(135deg,#F4703A,#9B3DE8)">\${s.initials}</div>
            <span class="text-white text-sm font-medium">\${s.name}</span>
          </div>
          <div class="col-span-2 text-gray-300 text-sm">\${s.clockIn}</div>
          <div class="col-span-2 text-gray-300 text-sm">\${s.clockOut}</div>
          <div class="col-span-1 text-gray-300 text-sm">\${s.hours}</div>
          <div class="col-span-2">
            <select class="select-status" onchange="updateStatus(\${s.id}, this.value)">
              <option value="present" \${s.status==='present'?'selected':''}>✓ Present</option>
              <option value="late" \${s.status==='late'?'selected':''}>⏰ Late</option>
              <option value="absent" \${s.status==='absent'?'selected':''}>✗ Absent</option>
            </select>
          </div>
          <div class="col-span-2 text-right">\${qbHtml}</div>
        </div>\`;
      }).join('');
      document.getElementById('student-table').innerHTML = html;
    }

    function updateStatus(id, newStatus) {
      const s = students.find(x => x.id === id);
      if (s) s.status = newStatus;
      updateCounts();
    }

    function updateCounts() {
      document.getElementById('count-present').textContent = students.filter(s=>s.status==='present').length;
      document.getElementById('count-late').textContent = students.filter(s=>s.status==='late').length;
      document.getElementById('count-absent').textContent = students.filter(s=>s.status==='absent').length;
      document.getElementById('qb-confirmed').textContent = students.filter(s=>s.qb).length;
    }

    function confirmQB(id) {
      const s = students.find(x=>x.id===id);
      if (s) { s.qb = true; }
      renderTable(students);
      updateCounts();
      showToast('✅ Attendance sent to QuickBooks for ' + (s ? s.name : ''));
    }

    function confirmAllQB() {
      students.forEach(s => { s.qb = true; });
      renderTable(students);
      updateCounts();
      showToast('✅ All attendance records sent to QuickBooks!');
    }

    function markAllPresent() {
      students.forEach(s => { if (s.clockIn !== '—') s.status = 'present'; });
      renderTable(students);
      updateCounts();
    }

    function filterStudents(q) {
      const filtered = q ? students.filter(s => s.name.toLowerCase().includes(q.toLowerCase())) : students;
      renderTable(filtered);
    }

    function filterByStatus(status) {
      const filtered = status === 'all' ? students : students.filter(s => s.status === status);
      renderTable(filtered);
    }

    function showToast(msg) {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#065f46;color:white;padding:12px 24px;border-radius:12px;font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(()=>t.remove(), 3000);
    }

    renderTable(students);
    updateCounts();
  </script>
</body>
</html>`)
})

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
app.get('/admin', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect Differently — Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { background: #1E1B2E; font-family: system-ui, sans-serif; }
    .gradient-text { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .gradient-btn { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); transition: all 0.2s; }
    .gradient-btn:hover { opacity: 0.9; }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; }
    .sidebar { background: rgba(255,255,255,0.03); border-right: 1px solid rgba(255,255,255,0.08); }
    .nav-item { display:flex; align-items:center; gap:10px; padding:10px 16px; border-radius:10px; color:rgba(255,255,255,0.5); cursor:pointer; transition:all 0.2s; font-size:14px; }
    .nav-item:hover, .nav-item.active { background:rgba(155,61,232,0.2); color:white; }
    .nav-item.active { border-left: 3px solid #9B3DE8; }
    .stat-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; }
    .status-badge { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:500; }
    .badge-green { background:rgba(34,197,94,0.2); color:#4ade80; }
    .badge-yellow { background:rgba(234,179,8,0.2); color:#facc15; }
    .badge-red { background:rgba(239,68,68,0.2); color:#f87171; }
    .metric-up { color: #4ade80; font-size: 11px; }
    .metric-down { color: #f87171; font-size: 11px; }
    .snowflake { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .input-field { background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:white; border-radius:10px; padding:8px 14px; font-size:13px; }
    .input-field:focus { outline:none; border-color:#9B3DE8; }
    .input-field::placeholder { color:rgba(255,255,255,0.3); }
    .qb-integration-card { background: linear-gradient(135deg, rgba(244,112,58,0.1), rgba(155,61,232,0.1)); border: 1px solid rgba(155,61,232,0.3); border-radius: 16px; }
  </style>
</head>
<body class="min-h-screen flex">
  <!-- Sidebar -->
  <div class="sidebar w-60 min-h-screen p-4 flex flex-col">
    <div class="flex items-center gap-2 mb-8 px-2">
      <span class="snowflake text-xl font-bold">✳</span>
      <div>
        <span class="text-white font-semibold text-sm">Connect</span>
        <span class="text-gray-400 font-light text-sm"> Differently</span>
      </div>
    </div>

    <nav class="space-y-1 flex-1">
      <div class="nav-item active" onclick="switchTab('dashboard', this)"><i class="fas fa-tachometer-alt w-4"></i>Dashboard</div>
      <div class="nav-item" onclick="switchTab('students', this)"><i class="fas fa-users w-4"></i>Students</div>
      <div class="nav-item" onclick="switchTab('reports', this)"><i class="fas fa-chart-bar w-4"></i>Reports</div>
      <div class="nav-item" onclick="switchTab('stipend', this)"><i class="fas fa-dollar-sign w-4"></i>Stipend</div>
      <div class="nav-item" onclick="switchTab('quickbooks', this)"><i class="fas fa-file-invoice-dollar w-4"></i>QuickBooks</div>
      <div class="nav-item" onclick="switchTab('settings', this)"><i class="fas fa-cog w-4"></i>Settings</div>
    </nav>

    <div class="mt-auto pt-4 border-t border-white/10">
      <div class="flex items-center gap-3 px-2 mb-3">
        <div class="w-8 h-8 rounded-full gradient-btn flex items-center justify-center text-white text-xs font-bold">CA</div>
        <div>
          <p class="text-white text-xs font-medium">Cristina A.</p>
          <p class="text-gray-500 text-xs">Administrator</p>
        </div>
      </div>
      <a href="/" class="nav-item text-red-400 hover:text-red-300"><i class="fas fa-sign-out-alt w-4"></i>Sign Out</a>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 overflow-auto">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
      <div>
        <h1 class="text-white font-bold text-lg" id="page-title">Admin Dashboard</h1>
        <p class="text-gray-400 text-xs mt-0.5">Wednesday, March 19, 2025</p>
      </div>
      <div class="flex items-center gap-3">
        <button class="relative text-gray-400 hover:text-white">
          <i class="fas fa-bell text-lg"></i>
          <span class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">3</span>
        </button>
        <button onclick="switchTab('quickbooks', document.querySelector('.nav-item:nth-child(5)'))" class="gradient-btn px-4 py-2 rounded-xl text-white text-sm font-semibold">
          <i class="fas fa-sync-alt mr-2"></i>Sync QB
        </button>
      </div>
    </div>

    <!-- DASHBOARD TAB -->
    <div class="tab-content active p-6" id="tab-dashboard">
      <!-- KPI Grid -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-purple-900/40 flex items-center justify-center"><i class="fas fa-users text-purple-400"></i></div>
            <span class="metric-up"><i class="fas fa-arrow-up mr-1"></i>+2 this week</span>
          </div>
          <p class="text-3xl font-bold text-white">48</p>
          <p class="text-gray-400 text-xs mt-1">Active Students</p>
        </div>
        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-green-900/40 flex items-center justify-center"><i class="fas fa-clock text-green-400"></i></div>
            <span class="metric-up"><i class="fas fa-arrow-up mr-1"></i>+12%</span>
          </div>
          <p class="text-3xl font-bold text-white">1,847</p>
          <p class="text-gray-400 text-xs mt-1">Total Hours This Month</p>
        </div>
        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-yellow-900/40 flex items-center justify-center"><i class="fas fa-exclamation-triangle text-yellow-400"></i></div>
            <span class="metric-down"><i class="fas fa-arrow-up mr-1"></i>+3</span>
          </div>
          <p class="text-3xl font-bold text-yellow-400">7</p>
          <p class="text-gray-400 text-xs mt-1">Late Alerts Pending</p>
        </div>
        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-orange-900/40 flex items-center justify-center"><i class="fas fa-dollar-sign text-orange-400"></i></div>
            <span class="metric-up">94% eligible</span>
          </div>
          <p class="text-3xl font-bold text-green-400">45</p>
          <p class="text-gray-400 text-xs mt-1">Stipend Eligible</p>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card p-5 col-span-2">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-white font-semibold">Weekly Attendance Rate</h3>
            <select class="bg-white/10 border border-white/20 text-gray-300 text-xs rounded-lg px-2 py-1">
              <option>Last 6 Weeks</option>
            </select>
          </div>
          <canvas id="attendanceChart" height="100"></canvas>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4">Today's Status</h3>
          <canvas id="statusChart" height="180"></canvas>
          <div class="mt-3 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-green-400"></span><span class="text-gray-400">Present</span></span>
              <span class="text-white font-medium">34 (71%)</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-yellow-400"></span><span class="text-gray-400">Late</span></span>
              <span class="text-white font-medium">8 (17%)</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-red-400"></span><span class="text-gray-400">Absent</span></span>
              <span class="text-white font-medium">6 (12%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Alerts + Top Students -->
      <div class="grid grid-cols-2 gap-4">
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-bell text-yellow-400 mr-2"></i>Recent Alerts</h3>
          <div class="space-y-3">
            ${[
              {name:'Alex Rivera', msg:'3rd late this month', time:'Today 9:14 AM', color:'yellow'},
              {name:'Taylor Kim', msg:'Missed 2 consecutive days', time:'Yesterday', color:'red'},
              {name:'Sam Lee', msg:'Stipend at risk — 4 absences', time:'Mar 18', color:'red'},
              {name:'Peyton Garcia', msg:'2nd late this week', time:'Today 9:18 AM', color:'yellow'},
            ].map(a => `<div class="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
              <i class="fas fa-exclamation-circle text-${a.color}-400 mt-0.5"></i>
              <div class="flex-1">
                <p class="text-white text-xs font-medium">${a.name}</p>
                <p class="text-gray-400 text-xs">${a.msg}</p>
              </div>
              <span class="text-gray-500 text-xs">${a.time}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-star text-purple-400 mr-2"></i>Top Attendance</h3>
          <div class="space-y-3">
            ${[
              {name:'Dakota Scott', rate:'100%', hrs:'62h', rank:1},
              {name:'Cameron White', rate:'98%', hrs:'59h', rank:2},
              {name:'Quinn Thompson', rate:'96%', hrs:'58h', rank:3},
              {name:'Parker Lewis', rate:'95%', hrs:'57h', rank:4},
            ].map((s,i) => `<div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i===0?'gradient-btn text-white':i===1?'bg-gray-600 text-gray-200':i===2?'bg-yellow-900 text-yellow-300':'bg-white/10 text-gray-400'}">${s.rank}</span>
              <div class="flex-1">
                <p class="text-white text-xs font-medium">${s.name}</p>
                <div class="w-full bg-white/10 rounded-full h-1 mt-1">
                  <div class="h-1 rounded-full" style="width:${s.rate};background:linear-gradient(90deg,#F4703A,#9B3DE8)"></div>
                </div>
              </div>
              <div class="text-right">
                <p class="text-green-400 text-xs font-bold">${s.rate}</p>
                <p class="text-gray-500 text-xs">${s.hrs}</p>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- STUDENTS TAB -->
    <div class="tab-content p-6" id="tab-students">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-white text-xl font-bold">All Students</h2>
        <button class="gradient-btn px-4 py-2 rounded-xl text-white text-sm font-semibold"><i class="fas fa-plus mr-2"></i>Add Student</button>
      </div>
      <div class="card overflow-hidden">
        <div class="grid grid-cols-6 gap-2 px-5 py-3 text-xs text-gray-500 border-b border-white/10 bg-white/3">
          <div class="col-span-2">Student</div><div>Cohort</div><div>Hours</div><div>Standing</div><div>Stipend</div>
        </div>
        ${[
          {n:'Jordan Davis',i:'JD',c:'Web Dev 12',h:'147.5',s:'Good',e:true},
          {n:'Alex Rivera',i:'AR',c:'Web Dev 12',h:'132.0',s:'Warning',e:true},
          {n:'Sam Lee',i:'SL',c:'Web Dev 12',h:'98.0',s:'At Risk',e:false},
          {n:'Morgan Chen',i:'MC',c:'Cybersecurity 5',h:'155.0',s:'Good',e:true},
          {n:'Taylor Kim',i:'TK',c:'Web Dev 12',h:'128.5',s:'Warning',e:true},
          {n:'Casey Brown',i:'CB',c:'Data Science 3',h:'161.0',s:'Excellent',e:true},
          {n:'Riley Johnson',i:'RJ',c:'Web Dev 12',h:'87.0',s:'At Risk',e:false},
          {n:'Avery Wilson',i:'AW',c:'Cybersecurity 5',h:'149.0',s:'Good',e:true},
        ].map(s => {
          const sc = s.s==='Excellent'?'badge-green':s.s==='Good'?'badge-green':s.s==='Warning'?'badge-yellow':'badge-red';
          return `<div class="grid grid-cols-6 gap-2 px-5 py-3 border-b border-white/5 hover:bg-white/3 items-center cursor-pointer" onclick="viewStudent()">
            <div class="col-span-2 flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold" style="background:linear-gradient(135deg,#F4703A,#9B3DE8)">${s.i}</div>
              <span class="text-white text-sm">${s.n}</span>
            </div>
            <div class="text-gray-400 text-sm">${s.c}</div>
            <div class="text-white text-sm font-medium">${s.h}h</div>
            <div><span class="status-badge ${sc}">${s.s}</span></div>
            <div>${s.e?'<span class="status-badge badge-green"><i class="fas fa-check mr-1"></i>Eligible</span>':'<span class="status-badge badge-red"><i class="fas fa-times mr-1"></i>Ineligible</span>'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- REPORTS TAB -->
    <div class="tab-content p-6" id="tab-reports">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-white text-xl font-bold">Reports & Export</h2>
      </div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-filter text-purple-400 mr-2"></i>Generate Report</h3>
          <div class="space-y-3">
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Report Type</label>
              <select class="input-field w-full">
                <option>Attendance Summary</option>
                <option>Hours Report</option>
                <option>Stipend Eligibility</option>
                <option>Late/Absence Report</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-gray-400 text-xs mb-1 block">From Date</label>
                <input type="date" class="input-field w-full" value="2025-03-01"/>
              </div>
              <div>
                <label class="text-gray-400 text-xs mb-1 block">To Date</label>
                <input type="date" class="input-field w-full" value="2025-03-19"/>
              </div>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Cohort</label>
              <select class="input-field w-full">
                <option>All Cohorts</option>
                <option>Web Dev 12</option>
                <option>Cybersecurity 5</option>
                <option>Data Science 3</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-2">
              <button onclick="exportCSV()" class="gradient-btn py-2.5 rounded-xl text-white text-sm font-semibold"><i class="fas fa-file-csv mr-2"></i>Export CSV</button>
              <button onclick="exportSheets()" class="bg-green-700 hover:bg-green-600 py-2.5 rounded-xl text-white text-sm font-semibold transition"><i class="fas fa-table mr-2"></i>Google Sheets</button>
            </div>
          </div>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-history text-orange-400 mr-2"></i>Recent Exports</h3>
          <div class="space-y-3">
            ${[
              {name:'March Attendance Report.csv', date:'Mar 18, 2025', size:'24 KB'},
              {name:'Stipend Eligibility Feb.csv', date:'Feb 28, 2025', size:'18 KB'},
              {name:'Hours Summary Q1.csv', date:'Mar 01, 2025', size:'31 KB'},
            ].map(f => `<div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <i class="fas fa-file-csv text-green-400 text-lg"></i>
              <div class="flex-1">
                <p class="text-white text-xs font-medium">${f.name}</p>
                <p class="text-gray-500 text-xs">${f.date} · ${f.size}</p>
              </div>
              <button class="text-gray-400 hover:text-white text-sm"><i class="fas fa-download"></i></button>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <!-- Report Preview -->
      <div class="card p-5">
        <h3 class="text-white font-semibold mb-4">Report Preview — March 1–19, 2025</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 text-xs border-b border-white/10">
                <th class="text-left pb-3">Student</th><th class="text-left pb-3">Cohort</th><th class="text-left pb-3">Days Present</th><th class="text-left pb-3">Days Late</th><th class="text-left pb-3">Absences</th><th class="text-left pb-3">Total Hours</th><th class="text-left pb-3">Stipend</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${[
                ['Jordan Davis','Web Dev 12','12','2','1','47.5','Eligible'],
                ['Alex Rivera','Web Dev 12','11','3','1','43.0','Eligible'],
                ['Sam Lee','Web Dev 12','8','0','7','32.0','Ineligible'],
                ['Morgan Chen','Cyber 5','14','1','0','56.0','Eligible'],
                ['Taylor Kim','Web Dev 12','10','3','2','38.5','Eligible'],
              ].map(r => `<tr class="hover:bg-white/3">
                ${r.map((v,i) => `<td class="py-3 ${i===0?'text-white font-medium':i===6?'<span class=badge-green>':'text-gray-300'}">${i===6?`<span class="status-badge ${v==='Eligible'?'badge-green':'badge-red'}">${v}</span>`:v}</td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- STIPEND TAB -->
    <div class="tab-content p-6" id="tab-stipend">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-white text-xl font-bold">Stipend Eligibility</h2>
        <button class="gradient-btn px-4 py-2 rounded-xl text-white text-sm font-semibold"><i class="fas fa-file-export mr-2"></i>Export Stipend List</button>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="card p-5 border-green-500/30">
          <p class="text-4xl font-bold text-green-400">45</p>
          <p class="text-gray-400 text-sm mt-1">Eligible for Stipend</p>
          <p class="text-gray-500 text-xs mt-1">94% of active students</p>
        </div>
        <div class="card p-5 border-red-500/30">
          <p class="text-4xl font-bold text-red-400">3</p>
          <p class="text-gray-400 text-sm mt-1">Not Eligible</p>
          <p class="text-gray-500 text-xs mt-1">Below attendance threshold</p>
        </div>
        <div class="card p-5">
          <p class="text-4xl font-bold text-white">80%</p>
          <p class="text-gray-400 text-sm mt-1">Required Attendance Rate</p>
          <p class="text-gray-500 text-xs mt-1">Configurable in Settings</p>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="text-white font-semibold mb-4">Eligibility Breakdown</h3>
        <div class="space-y-3">
          ${[
            {n:'Jordan Davis',i:'JD',r:'92%',s:'Eligible',hrs:'147.5'},
            {n:'Morgan Chen',i:'MC',r:'98%',s:'Eligible',hrs:'155.0'},
            {n:'Casey Brown',i:'CB',r:'100%',s:'Eligible',hrs:'161.0'},
            {n:'Sam Lee',i:'SL',r:'61%',s:'Ineligible',hrs:'98.0'},
            {n:'Riley Johnson',i:'RJ',r:'54%',s:'Ineligible',hrs:'87.0'},
          ].map(s => `<div class="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold" style="background:linear-gradient(135deg,#F4703A,#9B3DE8)">${s.i}</div>
            <div class="flex-1">
              <p class="text-white text-sm font-medium">${s.n}</p>
              <div class="w-full bg-white/10 rounded-full h-1.5 mt-1">
                <div class="h-1.5 rounded-full ${s.s==='Eligible'?'bg-green-500':'bg-red-500'}" style="width:${s.r}"></div>
              </div>
            </div>
            <span class="text-gray-400 text-sm">${s.hrs}h</span>
            <span class="text-gray-400 text-sm">${s.r}</span>
            <span class="status-badge ${s.s==='Eligible'?'badge-green':'badge-red'}">${s.s}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- QUICKBOOKS TAB -->
    <div class="tab-content p-6" id="tab-quickbooks">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-white text-xl font-bold"><i class="fas fa-file-invoice-dollar text-green-400 mr-2"></i>QuickBooks Integration</h2>
        <span class="status-badge badge-green text-sm px-3 py-1.5"><i class="fas fa-circle mr-1 text-xs"></i>Connected</span>
      </div>

      <!-- QB AI Assistant -->
      <div class="qb-integration-card p-6 mb-6">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-xl gradient-btn flex items-center justify-center flex-shrink-0">
            <i class="fas fa-robot text-white text-xl"></i>
          </div>
          <div class="flex-1">
            <h3 class="text-white font-semibold text-lg">AI-Powered QB Entry Assistant</h3>
            <p class="text-gray-400 text-sm mt-1 mb-4">Automatically maps attendance records to QuickBooks payroll entries. AI reviews each student's hours, verifies instructor confirmation, and prepares batch entries for your review.</p>
            <div class="grid grid-cols-3 gap-3 mb-4">
              <div class="bg-white/10 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-white">42</p>
                <p class="text-gray-400 text-xs">Ready to Sync</p>
              </div>
              <div class="bg-white/10 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-yellow-400">6</p>
                <p class="text-gray-400 text-xs">Needs Review</p>
              </div>
              <div class="bg-white/10 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-green-400">187</p>
                <p class="text-gray-400 text-xs">Synced This Month</p>
              </div>
            </div>
            <div class="flex gap-3">
              <button onclick="runAISync()" class="gradient-btn px-5 py-2.5 rounded-xl text-white text-sm font-semibold"><i class="fas fa-magic mr-2"></i>Run AI Sync</button>
              <button class="bg-white/10 hover:bg-white/20 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition"><i class="fas fa-eye mr-2"></i>Review Entries</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Entries -->
      <div class="card p-5 mb-4">
        <h3 class="text-white font-semibold mb-4">Pending QB Entries — Today</h3>
        <div class="space-y-3" id="qb-entries">
          ${[
            {n:'Jordan Davis',hrs:'6h 4m',type:'Stipend Payment',amt:'$28.50',status:'ready'},
            {n:'Morgan Chen',hrs:'6h 8m',type:'Stipend Payment',amt:'$28.50',status:'ready'},
            {n:'Alex Rivera',hrs:'5h 46m',type:'Stipend Payment (Late)',amt:'$27.00',status:'review'},
            {n:'Casey Brown',hrs:'6h 4m',type:'Stipend Payment',amt:'$28.50',status:'ready'},
            {n:'Sam Lee',hrs:'0h',type:'No Payment — Absent',amt:'$0.00',status:'absent'},
          ].map((e,i) => `<div class="flex items-center gap-4 p-4 bg-white/5 rounded-xl" id="qb-entry-${i}">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold" style="background:linear-gradient(135deg,#F4703A,#9B3DE8)">${e.n.split(' ').map(x=>x[0]).join('')}</div>
            <div class="flex-1">
              <p class="text-white text-sm font-medium">${e.n}</p>
              <p class="text-gray-400 text-xs">${e.type} · ${e.hrs}</p>
            </div>
            <span class="text-white font-semibold">${e.amt}</span>
            <span class="status-badge ${e.status==='ready'?'badge-green':e.status==='review'?'badge-yellow':'badge-red'}">${e.status==='ready'?'Ready':e.status==='review'?'Review':'Skip'}</span>
            ${e.status!=='absent'?`<button onclick="confirmEntry(${i})" class="bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition"><i class="fas fa-check mr-1"></i>Confirm</button>`:'<div class="w-20"></div>'}
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- SETTINGS TAB -->
    <div class="tab-content p-6" id="tab-settings">
      <h2 class="text-white text-xl font-bold mb-6">System Settings</h2>
      <div class="grid grid-cols-2 gap-6">
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-clock text-yellow-400 mr-2"></i>Late & Absence Thresholds</h3>
          <div class="space-y-4">
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Late Threshold (minutes after shift start)</label>
              <div class="flex items-center gap-3">
                <input type="range" min="5" max="30" value="10" class="flex-1 accent-purple-500" oninput="this.nextElementSibling.textContent=this.value+' min'"/>
                <span class="text-white text-sm font-semibold w-16 text-center">10 min</span>
              </div>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Lates Before Alert Email</label>
              <input type="number" value="3" min="1" max="10" class="input-field w-full"/>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Minimum Attendance Rate for Stipend</label>
              <div class="flex items-center gap-3">
                <input type="range" min="50" max="100" value="80" class="flex-1 accent-purple-500" oninput="this.nextElementSibling.textContent=this.value+'%'"/>
                <span class="text-white text-sm font-semibold w-16 text-center">80%</span>
              </div>
            </div>
          </div>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-envelope text-purple-400 mr-2"></i>Email Alerts Configuration</h3>
          <div class="space-y-4">
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Alert Recipients</label>
              <input type="email" value="cristina@codedifferently.org" class="input-field w-full"/>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">CC Instructors</label>
              <div class="flex items-center gap-2">
                <input type="checkbox" checked class="accent-purple-500"/>
                <span class="text-gray-300 text-sm">Copy instructor on student alerts</span>
              </div>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Alert Triggers</label>
              <div class="space-y-2">
                ${['Late threshold exceeded','2+ consecutive absences','Stipend at risk','Weekly summary digest'].map(t => `<div class="flex items-center gap-2"><input type="checkbox" checked class="accent-purple-500"/><span class="text-gray-300 text-sm">${t}</span></div>`).join('')}
              </div>
            </div>
            <button class="gradient-btn w-full py-2.5 rounded-xl text-white text-sm font-semibold mt-2">Save Alert Settings</button>
          </div>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-map-marker-alt text-orange-400 mr-2"></i>GPS & Location</h3>
          <div class="space-y-3">
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Campus Location (lat, lng)</label>
              <input type="text" value="39.2904, -76.6122" class="input-field w-full"/>
            </div>
            <div>
              <label class="text-gray-400 text-xs mb-1 block">Allowed Radius (meters)</label>
              <input type="number" value="200" class="input-field w-full"/>
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" checked class="accent-purple-500"/>
              <span class="text-gray-300 text-sm">Require GPS verification on clock-in</span>
            </div>
          </div>
        </div>
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4"><i class="fas fa-link text-green-400 mr-2"></i>Integrations</h3>
          <div class="space-y-3">
            ${[
              {name:'QuickBooks Online',icon:'fa-file-invoice-dollar',color:'green',status:'Connected'},
              {name:'Google Sheets',icon:'fa-table',color:'blue',status:'Connected'},
              {name:'SendGrid Email',icon:'fa-envelope',color:'blue',status:'Active'},
              {name:'Google Maps API',icon:'fa-map',color:'red',status:'Active'},
            ].map(i => `<div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
              <i class="fas ${i.icon} text-${i.color}-400 w-5"></i>
              <span class="text-white text-sm flex-1">${i.name}</span>
              <span class="status-badge badge-green text-xs">${i.status}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function switchTab(tab, el) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('active');
      if (el) el.classList.add('active');
      const titles = {dashboard:'Admin Dashboard',students:'Students',reports:'Reports & Export',stipend:'Stipend Eligibility',quickbooks:'QuickBooks Integration',settings:'Settings'};
      document.getElementById('page-title').textContent = titles[tab] || 'Admin';
      if (tab === 'dashboard') initCharts();
    }

    function initCharts() {
      if (window.chartsInit) return;
      window.chartsInit = true;
      new Chart(document.getElementById('attendanceChart'), {
        type: 'bar',
        data: {
          labels: ['Feb 3','Feb 10','Feb 17','Feb 24','Mar 3','Mar 10','Mar 17'],
          datasets: [
            { label:'Present', data:[38,40,35,42,39,44,34], backgroundColor:'rgba(74,222,128,0.7)', borderRadius:4 },
            { label:'Late', data:[5,4,7,3,6,3,8], backgroundColor:'rgba(250,204,21,0.7)', borderRadius:4 },
            { label:'Absent', data:[5,4,6,3,3,1,6], backgroundColor:'rgba(248,113,113,0.7)', borderRadius:4 }
          ]
        },
        options: {
          plugins: { legend: { labels: { color:'#9ca3af', font:{size:11} } } },
          scales: {
            x: { stacked:true, ticks:{color:'#6b7280'}, grid:{color:'rgba(255,255,255,0.05)'} },
            y: { stacked:true, ticks:{color:'#6b7280'}, grid:{color:'rgba(255,255,255,0.05)'} }
          }
        }
      });
      new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
          labels:['Present','Late','Absent'],
          datasets:[{ data:[34,8,6], backgroundColor:['#4ade80','#facc15','#f87171'], borderWidth:0 }]
        },
        options: { plugins:{legend:{display:false}}, cutout:'70%' }
      });
    }

    function runAISync() {
      const btn = event.target;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>AI Processing...';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-check mr-2"></i>Sync Complete!';
        btn.classList.remove('gradient-btn');
        btn.classList.add('bg-green-700');
        showToast('✅ AI sync complete — 42 entries prepared for QuickBooks');
      }, 2500);
    }

    function confirmEntry(i) {
      const row = document.getElementById('qb-entry-' + i);
      if (row) {
        row.style.opacity = '0.5';
        const btn = row.querySelector('button');
        if (btn) btn.innerHTML = '<i class="fas fa-check mr-1"></i>Done';
      }
    }

    function viewStudent() {
      window.location.href = '/student-profile';
    }

    function exportCSV() { showToast('📊 CSV export started — file will download shortly'); }
    function exportSheets() { showToast('📋 Syncing to Google Sheets...'); }

    function showToast(msg) {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e1b2e;border:1px solid #9B3DE8;color:white;padding:12px 24px;border-radius:12px;font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(155,61,232,0.3)';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(()=>t.remove(), 3000);
    }

    initCharts();
  </script>
</body>
</html>`)
})

// ─── STUDENT PROFILE PAGE ─────────────────────────────────────────────────────
app.get('/student-profile', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Connect Differently — Student Profile</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { background: #1E1B2E; font-family: system-ui, sans-serif; }
    .gradient-text { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .gradient-btn { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; }
    .status-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500; }
    .badge-green { background:rgba(34,197,94,0.2); color:#4ade80; }
    .badge-yellow { background:rgba(234,179,8,0.2); color:#facc15; }
    .badge-red { background:rgba(239,68,68,0.2); color:#f87171; }
    .snowflake { background: linear-gradient(135deg, #F4703A, #E040A0, #9B3DE8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .profile-hero { background: linear-gradient(135deg, rgba(244,112,58,0.15), rgba(155,61,232,0.15)); border: 1px solid rgba(155,61,232,0.2); border-radius: 20px; }
    .meter-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.1); overflow: hidden; }
    .meter-fill { height: 100%; border-radius: 4px; transition: width 1s ease; }
  </style>
</head>
<body class="min-h-screen">
  <!-- Nav -->
  <nav class="flex items-center justify-between px-6 py-4 border-b border-white/10">
    <div class="flex items-center gap-3">
      <a href="/admin" class="text-gray-400 hover:text-white mr-2"><i class="fas fa-arrow-left"></i></a>
      <span class="snowflake text-xl font-bold">✳</span>
      <span class="text-white font-semibold text-sm">Connect <span class="text-gray-400 font-light">Differently</span></span>
    </div>
    <div class="flex gap-3">
      <button class="gradient-btn px-4 py-2 rounded-xl text-white text-sm font-semibold"><i class="fas fa-envelope mr-2"></i>Send Alert</button>
      <button class="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-white text-sm font-semibold transition"><i class="fas fa-edit mr-2"></i>Edit</button>
    </div>
  </nav>

  <div class="max-w-5xl mx-auto px-4 py-8">
    <!-- Hero Card -->
    <div class="profile-hero p-6 mb-6">
      <div class="flex items-start gap-6">
        <div class="w-20 h-20 rounded-2xl gradient-btn flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">JD</div>
        <div class="flex-1">
          <div class="flex items-start justify-between">
            <div>
              <h1 class="text-white text-2xl font-bold">Jordan Davis</h1>
              <p class="text-gray-400 text-sm mt-0.5">jordan.davis@student.codedifferently.org</p>
              <div class="flex items-center gap-3 mt-2">
                <span class="text-gray-400 text-sm"><i class="fas fa-code mr-1 text-purple-400"></i>Web Development Cohort 12</span>
                <span class="text-gray-500">·</span>
                <span class="text-gray-400 text-sm"><i class="fas fa-calendar mr-1 text-orange-400"></i>Started Sep 2024</span>
              </div>
            </div>
            <span class="status-badge badge-green text-sm px-4 py-2"><i class="fas fa-star mr-1"></i>Stipend Eligible</span>
          </div>
          <div class="grid grid-cols-4 gap-4 mt-5">
            <div class="bg-white/10 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-white">147.5</p>
              <p class="text-gray-400 text-xs">Total Hours</p>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-green-400">92%</p>
              <p class="text-gray-400 text-xs">Attendance</p>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-yellow-400">2</p>
              <p class="text-gray-400 text-xs">Lates (Month)</p>
            </div>
            <div class="bg-white/10 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-white">3</p>
              <p class="text-gray-400 text-xs">Absences</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6">
      <!-- Left Column -->
      <div class="col-span-2 space-y-6">
        <!-- Monthly Trend -->
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4">Attendance Trend</h3>
          <canvas id="trendChart" height="100"></canvas>
        </div>
        <!-- Recent Records -->
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4">Recent Attendance Records</h3>
          <div class="space-y-2">
            ${[
              {d:'Mon Mar 17',i:'8:52 AM',o:'3:03 PM',h:'6h 11m',s:'present'},
              {d:'Tue Mar 18',i:'9:18 AM',o:'3:00 PM',h:'5h 42m',s:'late'},
              {d:'Wed Mar 19',i:'9:01 AM',o:'—',h:'—',s:'present'},
              {d:'Thu Mar 13',i:'8:55 AM',o:'3:01 PM',h:'6h 6m',s:'present'},
              {d:'Fri Mar 14',i:'9:01 AM',o:'3:00 PM',h:'5h 59m',s:'present'},
              {d:'Mon Mar 10',i:'8:58 AM',o:'3:02 PM',h:'6h 4m',s:'present'},
              {d:'Fri Mar 07',i:'—',o:'—',h:'0h',s:'absent'},
            ].map(r => {
              const b = r.s==='present'?'badge-green':r.s==='late'?'badge-yellow':'badge-red';
              const label = r.s==='present'?'Present':r.s==='late'?'Late':'Absent';
              return `<div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                <i class="fas fa-calendar-day text-purple-400 w-4"></i>
                <span class="text-white text-sm w-28">${r.d}</span>
                <span class="text-gray-400 text-sm flex-1">${r.i} → ${r.o} · ${r.h}</span>
                <span class="status-badge ${b}">${label}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-6">
        <!-- Standing -->
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-4">Current Standing</h3>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">Attendance Rate</span>
                <span class="text-white font-medium">92%</span>
              </div>
              <div class="meter-bar">
                <div class="meter-fill bg-green-500" style="width:92%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">Hours Progress</span>
                <span class="text-white font-medium">147.5 / 180h</span>
              </div>
              <div class="meter-bar">
                <div class="meter-fill" style="width:82%;background:linear-gradient(90deg,#F4703A,#9B3DE8)"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">Late Budget</span>
                <span class="text-yellow-400 font-medium">2 / 3 used</span>
              </div>
              <div class="meter-bar">
                <div class="meter-fill bg-yellow-400" style="width:67%"></div>
              </div>
            </div>
          </div>
          <div class="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-xl">
            <p class="text-green-400 text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Stipend Eligible</p>
            <p class="text-gray-400 text-xs mt-0.5">Meets all requirements for this pay period</p>
          </div>
        </div>

        <!-- QB Sync -->
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-3"><i class="fas fa-file-invoice-dollar text-green-400 mr-2"></i>QuickBooks</h3>
          <div class="space-y-2 text-xs">
            <div class="flex justify-between"><span class="text-gray-400">Last QB Sync</span><span class="text-white">Today 3:05 PM</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Pay Period Hours</span><span class="text-white">47.5h</span></div>
            <div class="flex justify-between"><span class="text-gray-400">Stipend Amount</span><span class="text-green-400 font-semibold">$213.75</span></div>
            <div class="flex justify-between"><span class="text-gray-400">QB Status</span><span class="status-badge badge-green">Synced</span></div>
          </div>
          <button class="w-full mt-4 bg-green-700 hover:bg-green-600 py-2 rounded-xl text-white text-xs font-semibold transition">
            <i class="fas fa-sync mr-1"></i>Re-sync to QB
          </button>
        </div>

        <!-- Alert History -->
        <div class="card p-5">
          <h3 class="text-white font-semibold mb-3"><i class="fas fa-bell text-yellow-400 mr-2"></i>Alert History</h3>
          <div class="space-y-2">
            ${[
              {msg:'2nd late alert sent',d:'Mar 18',c:'yellow'},
              {msg:'1st late alert sent',d:'Mar 11',c:'yellow'},
              {msg:'Stipend confirmed',d:'Feb 28',c:'green'},
            ].map(a => `<div class="flex items-start gap-2 text-xs">
              <i class="fas fa-circle text-${a.c}-400 text-xs mt-0.5"></i>
              <div class="flex-1"><p class="text-gray-300">${a.msg}</p></div>
              <span class="text-gray-500">${a.d}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: ['Sep','Oct','Nov','Dec','Jan','Feb','Mar'],
        datasets: [
          { label:'Hours', data:[32,38,42,35,48,44,47.5], borderColor:'#9B3DE8', backgroundColor:'rgba(155,61,232,0.1)', borderWidth:2, fill:true, tension:0.4, yAxisID:'y' },
          { label:'Attendance %', data:[85,88,92,80,95,91,92], borderColor:'#4ade80', borderWidth:2, fill:false, tension:0.4, yAxisID:'y1' }
        ]
      },
      options: {
        plugins: { legend: { labels: { color:'#9ca3af', font:{size:11} } } },
        scales: {
          x: { ticks:{color:'#6b7280'}, grid:{color:'rgba(255,255,255,0.05)'} },
          y: { ticks:{color:'#6b7280'}, grid:{color:'rgba(255,255,255,0.05)'} },
          y1: { position:'right', ticks:{color:'#6b7280'}, grid:{display:false} }
        }
      }
    });
  </script>
</body>
</html>`)
})

// ─── SETTINGS PAGE ─────────────────────────────────────────────────────────────
app.get('/settings', (c) => {
  return c.redirect('/admin')
})

export default app
