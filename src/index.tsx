import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import {
  verifyLocation,
  getSchoolConfig,
  setSchoolConfig,
  getVerifications,
  getVerificationStats,
  haversineDistance,
} from './location-service'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './' }))
app.use('/api/*', cors())

// Favicon — serve inline SVG to avoid 404 noise
app.get('/favicon.ico', (c) => {
  c.header('Content-Type', 'image/svg+xml')
  c.header('Cache-Control', 'public, max-age=86400')
  return c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#1E1B2E"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#F4703A" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="4" fill="#9B3DE8"/>
  </svg>`)
})

// ── Page Routes ──────────────────────────────────────────────────────
app.get('/', (c) => c.redirect('/login'))
app.get('/login', (c) => c.html(loginPage()))
app.get('/student', (c) => c.html(studentPage()))
app.get('/instructor', (c) => c.html(instructorPage()))
app.get('/admin', (c) => c.html(adminPage()))
app.get('/profile', (c) => c.html(profilePage()))
app.get('/reports', (c) => c.html(reportsPage()))
app.get('/settings', (c) => c.html(settingsPage()))
app.get('/geofence', (c) => c.html(geofencePage()))
app.get('/hybrid', (c) => c.html(hybridPage()))
app.get('/admin/users', (c) => c.html(adminUsersPage()))

// ── Logout Route (Auth Fix — non-destructive new route) ──────────────
// Clears no server-side state (stateless app) but exists as a clean
// redirect target so JS can do a full navigation to trigger guard logic.
app.get('/logout', (c) => {
  // Set headers to prevent caching of this response
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  c.header('Pragma', 'no-cache')
  return c.redirect('/login')
})

// ═══════════════════════════════════════════════════════════════════
// AUTH APIs  (Enhancement Layer — non-destructive)
// Prefixed /api/auth/* — no existing routes modified
// ═══════════════════════════════════════════════════════════════════

// POST /api/auth/logout — called by JS before navigation; returns JSON ack
app.post('/api/auth/logout', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, message: 'Session cleared', redirect: '/login' })
})

// POST /api/auth/validate — validate email/password format (no credentials stored server-side)
app.post('/api/auth/validate', async (c) => {
  try {
    const body = await c.req.json() as { email?: string; password?: string }
    const errors: string[] = []
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!body.email || !body.email.trim())           errors.push('Please enter a valid email address.')
    else if (!emailRe.test(body.email.trim()))        errors.push('Please enter a valid email address.')
    if (!body.password || !body.password.trim())      errors.push('Password is required.')
    else if (body.password.length < 6)                errors.push('Password must be at least 6 characters.')
    return c.json({ valid: errors.length === 0, errors })
  } catch {
    return c.json({ valid: false, errors: ['Validation error — please try again.'] }, 400)
  }
})

// POST /api/auth/check-role — verify role matches expected dashboard
app.post('/api/auth/check-role', async (c) => {
  try {
    const body = await c.req.json() as { role?: string; path?: string }
    const roleRoutes: Record<string, string[]> = {
      student:    ['/student', '/profile'],
      instructor: ['/instructor', '/hybrid'],
      admin:      ['/admin', '/admin/users', '/reports', '/settings', '/geofence', '/hybrid'],
    }
    const allowed = roleRoutes[body.role || ''] || []
    const ok = !body.path || allowed.some(r => (body.path || '').startsWith(r))
    return c.json({ allowed: ok, role: body.role, redirect: ok ? null : roleRoutes[body.role || '']?.[0] || '/login' })
  } catch {
    return c.json({ allowed: false, redirect: '/login' }, 400)
  }
})

// ═══════════════════════════════════════════════════════════════════
// ADMIN USER MANAGEMENT APIs  (Enhancement Layer — non-destructive)
// Prefixed /api/admin/* — no existing routes modified
// ═══════════════════════════════════════════════════════════════════

// In-memory student registry (stateless edge — production would use D1)
const STUDENT_REGISTRY: Array<{
  id: string; firstName: string; lastName: string; email: string
  username: string; program: string; cohort: string; enrollDate: string
  studentId: string; status: 'active'|'pending'|'suspended'; firstLogin: boolean
  createdAt: string; createdBy: string
}> = [
  { id:'STU001', firstName:'Alex',    lastName:'Johnson',   email:'alex@codedifferently.org',    username:'alex.johnson',   program:'Web Dev',    cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-001', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU002', firstName:'Maria',   lastName:'Garcia',    email:'maria@codedifferently.org',   username:'maria.garcia',   program:'Web Dev',    cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-002', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU003', firstName:'DeShawn', lastName:'Williams',  email:'deshawn@codedifferently.org', username:'deshawn.w',      program:'Data',       cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-003', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU004', firstName:'Priya',   lastName:'Patel',     email:'priya@codedifferently.org',   username:'priya.patel',    program:'Web Dev',    cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-004', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU005', firstName:'Liam',    lastName:'Chen',      email:'liam@codedifferently.org',    username:'liam.chen',      program:'Design',     cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-005', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU006', firstName:'Aaliyah', lastName:'Brown',     email:'aaliyah@codedifferently.org', username:'aaliyah.brown',  program:'Data',       cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-006', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU007', firstName:'Marcus',  lastName:'Thompson',  email:'marcus@codedifferently.org',  username:'marcus.t',       program:'Web Dev',    cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-007', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU008', firstName:'Sofia',   lastName:'Rodriguez', email:'sofia@codedifferently.org',   username:'sofia.rodriguez', program:'Design',    cohort:'2024', enrollDate:'2024-01-08', studentId:'CD-2024-008', status:'active',  firstLogin:false, createdAt:'2024-01-08T09:00:00Z', createdBy:'admin' },
  { id:'STU009', firstName:'James',   lastName:'Park',      email:'james@codedifferently.org',   username:'james.park',     program:'Data',       cohort:'2024', enrollDate:'2024-01-15', studentId:'CD-2024-009', status:'pending', firstLogin:true,  createdAt:'2024-01-15T09:00:00Z', createdBy:'admin' },
]

// GET /api/admin/students — list all students
app.get('/api/admin/students', (c) => {
  return c.json({ success: true, students: STUDENT_REGISTRY, total: STUDENT_REGISTRY.length })
})

// POST /api/admin/students — create a new student account
app.post('/api/admin/students', async (c) => {
  try {
    const body = await c.req.json() as {
      firstName: string; lastName: string; email: string
      program: string; cohort: string; enrollDate: string
      username?: string; tempPassword?: string; autoGenerate?: boolean
      studentId?: string
    }
    // Validate required fields
    const errors: string[] = []
    if (!body.firstName?.trim()) errors.push('First name is required.')
    if (!body.lastName?.trim())  errors.push('Last name is required.')
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!body.email?.trim() || !emailRe.test(body.email)) errors.push('Valid email is required.')
    if (!body.program?.trim()) errors.push('Program is required.')
    if (!body.cohort?.trim())  errors.push('Cohort is required.')
    if (STUDENT_REGISTRY.some(s => s.email.toLowerCase() === body.email?.toLowerCase())) {
      errors.push('A student with this email already exists.')
    }
    if (errors.length) return c.json({ success: false, errors }, 422)

    // Generate credentials if requested
    const fn    = body.firstName.trim().toLowerCase()
    const ln    = body.lastName.trim().toLowerCase()
    const username  = body.username?.trim() || `${fn}.${ln}`
    const tempPw    = body.autoGenerate
      ? `CD${Math.random().toString(36).slice(2,6).toUpperCase()}${Math.floor(Math.random()*900+100)}!`
      : (body.tempPassword || 'TempPass123!')
    const stuId     = body.studentId?.trim() || `CD-${body.cohort}-${String(STUDENT_REGISTRY.length + 1).padStart(3,'0')}`
    const newId     = `STU${String(STUDENT_REGISTRY.length + 1).padStart(3,'0')}`
    const newStudent = {
      id: newId, firstName: body.firstName.trim(), lastName: body.lastName.trim(),
      email: body.email.trim().toLowerCase(), username, program: body.program.trim(),
      cohort: body.cohort.trim(), enrollDate: body.enrollDate || new Date().toISOString().slice(0,10),
      studentId: stuId, status: 'pending' as const, firstLogin: true,
      createdAt: new Date().toISOString(), createdBy: 'admin'
    }
    STUDENT_REGISTRY.push(newStudent)
    return c.json({
      success: true, student: newStudent,
      credentials: { username, tempPassword: tempPw, mustChangePassword: true },
      message: `Account created for ${body.firstName} ${body.lastName}. Credentials generated.`
    })
  } catch (err: any) {
    return c.json({ success: false, errors: [err.message] }, 400)
  }
})

// PATCH /api/admin/students/:id — update student status
app.patch('/api/admin/students/:id', async (c) => {
  try {
    const id   = c.req.param('id')
    const body = await c.req.json() as { status?: string; firstLogin?: boolean }
    const idx  = STUDENT_REGISTRY.findIndex(s => s.id === id)
    if (idx === -1) return c.json({ success: false, error: 'Student not found' }, 404)
    if (body.status && ['active','pending','suspended'].includes(body.status)) {
      STUDENT_REGISTRY[idx].status = body.status as any
    }
    if (typeof body.firstLogin === 'boolean') STUDENT_REGISTRY[idx].firstLogin = body.firstLogin
    return c.json({ success: true, student: STUDENT_REGISTRY[idx] })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// DELETE /api/admin/students/:id — remove student
app.delete('/api/admin/students/:id', async (c) => {
  const id  = c.req.param('id')
  const idx = STUDENT_REGISTRY.findIndex(s => s.id === id)
  if (idx === -1) return c.json({ success: false, error: 'Student not found' }, 404)
  const removed = STUDENT_REGISTRY.splice(idx, 1)[0]
  return c.json({ success: true, message: `${removed.firstName} ${removed.lastName} removed.` })
})

// POST /api/admin/students/:id/reset-password — reset student password
app.post('/api/admin/students/:id/reset-password', async (c) => {
  const id  = c.req.param('id')
  const idx = STUDENT_REGISTRY.findIndex(s => s.id === id)
  if (idx === -1) return c.json({ success: false, error: 'Student not found' }, 404)
  const newPw = `CD${Math.random().toString(36).slice(2,6).toUpperCase()}${Math.floor(Math.random()*900+100)}!`
  STUDENT_REGISTRY[idx].firstLogin = true
  return c.json({ success: true, tempPassword: newPw, message: 'Password reset. Student must change on next login.' })
})

// POST /api/auth/onboarding — student completes first-login onboarding
app.post('/api/auth/onboarding', async (c) => {
  try {
    const body = await c.req.json() as { studentId?: string; newPassword?: string; confirmPassword?: string }
    const errors: string[] = []
    if (!body.newPassword || body.newPassword.length < 8) errors.push('Password must be at least 8 characters.')
    if (!/[A-Z]/.test(body.newPassword || ''))  errors.push('Password must contain at least one uppercase letter.')
    if (!/[0-9]/.test(body.newPassword || ''))  errors.push('Password must contain at least one number.')
    if (body.newPassword !== body.confirmPassword) errors.push('Passwords do not match.')
    if (errors.length) return c.json({ success: false, errors }, 422)
    // Mark first login complete
    const idx = STUDENT_REGISTRY.findIndex(s => s.id === body.studentId)
    if (idx !== -1) STUDENT_REGISTRY[idx].firstLogin = false
    return c.json({ success: true, message: 'Password updated. Welcome to ConnectDifferently!' })
  } catch (err: any) {
    return c.json({ success: false, errors: [err.message] }, 400)
  }
})

// ═══════════════════════════════════════════════════════════════════
// HYBRID INTELLIGENCE PLATFORM APIs  (Enhancement Layer — non-destructive)
// All routes prefixed /api/hybrid/* — no existing routes modified
// ═══════════════════════════════════════════════════════════════════

// ── Attendance Mode Controller ───────────────────────────────────────
// POST /api/hybrid/session/create  — create a session with mode
app.post('/api/hybrid/session/create', async (c) => {
  try {
    const body = await c.req.json() as {
      class_id: string; session_type: 'physical'|'virtual'|'hybrid'
      start_time: string; instructor_id: string; duration_minutes?: number
      virtual_link?: string; checkpoint_minutes?: number
    }
    const sessionId = `SES-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`
    return c.json({
      success: true,
      session: {
        id: sessionId,
        class_id: body.class_id,
        session_type: body.session_type,
        start_time: body.start_time || new Date().toISOString(),
        instructor_id: body.instructor_id,
        duration_minutes: body.duration_minutes || 480,
        virtual_link: body.virtual_link || null,
        checkpoint_minutes: body.checkpoint_minutes || 20,
        status: 'active',
        created_at: new Date().toISOString()
      },
      message: `${body.session_type} session created. Verification checkpoint at ${body.checkpoint_minutes || 20} min.`
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// GET /api/hybrid/session/:id — get session details + live stats
app.get('/api/hybrid/session/:id', (c) => {
  const id = c.req.param('id')
  return c.json({
    session: {
      id, status: 'active', session_type: 'hybrid',
      start_time: new Date(Date.now() - 25 * 60000).toISOString(),
      checkpoint_reached: true, checkpoint_minutes: 20,
      physical_count: 5, virtual_count: 3, total_enrolled: 8
    }
  })
})

// ── VirtualPresenceService ────────────────────────────────────────────
// POST /api/hybrid/virtual/verify  — verify participants from meeting data
app.post('/api/hybrid/virtual/verify', async (c) => {
  try {
    const body = await c.req.json() as {
      session_id: string; platform: string
      participants?: Array<{email:string; name:string; join_time:string; leave_time?:string; duration_minutes?:number}>
      min_duration_minutes?: number
    }
    const minDur  = body.min_duration_minutes ?? 15
    const roster  = [
      'alex@codedifferently.org','maria@codedifferently.org','deshawn@codedifferently.org',
      'priya@codedifferently.org','liam@codedifferently.org','aaliyah@codedifferently.org',
      'marcus@codedifferently.org','sofia@codedifferently.org'
    ]
    // Use supplied participants or generate sample data
    const participants = body.participants || [
      { email:'alex@codedifferently.org',   name:'Alex Johnson',    join_time:'09:01', duration_minutes: 62 },
      { email:'liam@codedifferently.org',   name:'Liam Chen',       join_time:'08:58', duration_minutes: 65 },
      { email:'deshawn@codedifferently.org',name:'DeShawn Williams', join_time:'09:03', duration_minutes: 60 },
      { email:'maria@codedifferently.org',  name:'Maria Garcia',    join_time:'09:18', duration_minutes: 45 },
      { email:'sofia@codedifferently.org',  name:'Sofia Rodriguez', join_time:'09:02', duration_minutes: 8  }, // too short
      { email:'unknown@gmail.com',          name:'Unknown User',    join_time:'09:05', duration_minutes: 55 }, // not in roster
    ]
    const records = participants.map(p => {
      const inRoster   = roster.includes(p.email)
      const sufficient = (p.duration_minutes || 0) >= minDur
      const late        = p.join_time > '09:10'
      return {
        email: p.email, name: p.name,
        join_time: p.join_time, leave_time: p.leave_time || null,
        duration_minutes: p.duration_minutes || 0,
        matched_student: inRoster,
        sufficient_duration: sufficient,
        status: !inRoster ? 'unmatched' : !sufficient ? 'insufficient_duration' : late ? 'late' : 'present',
        verification_score: inRoster && sufficient ? (late ? 0.75 : 0.97) : 0.2
      }
    })
    const present   = records.filter(r => r.status === 'present' || r.status === 'late')
    const flagged   = records.filter(r => r.status === 'insufficient_duration' || r.status === 'unmatched')
    return c.json({
      success: true, session_id: body.session_id, platform: body.platform,
      min_duration_minutes: minDur,
      summary: {
        total_participants: participants.length, present_count: present.length,
        late_count: records.filter(r=>r.status==='late').length,
        flagged_count: flagged.length, unmatched_count: records.filter(r=>r.status==='unmatched').length
      },
      records, verified_at: new Date().toISOString()
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// GET /api/hybrid/virtual/platforms — list supported platforms
app.get('/api/hybrid/virtual/platforms', (c) => {
  return c.json({
    platforms: [
      { id:'google_meet', name:'Google Meet', status:'integrated', icon:'fa-video',
        auth_url:'https://accounts.google.com/o/oauth2/auth', scope:'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/admin.reports.readonly',
        api_endpoint:'https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet' },
      { id:'zoom', name:'Zoom', status:'coming_soon', icon:'fa-video' },
      { id:'teams', name:'Microsoft Teams', status:'coming_soon', icon:'fa-microsoft' },
    ]
  })
})

// ── AttendanceIntelligenceEngine ──────────────────────────────────────
// POST /api/hybrid/ai/analyze  — analyze attendance dataset before finalizing
app.post('/api/hybrid/ai/analyze', async (c) => {
  try {
    const body = await c.req.json() as {
      session_id: string; session_type: string
      physical_records?: any[]; virtual_records?: any[]
      apiKey?: string; baseUrl?: string
    }
    // Build merged dataset
    const physical = body.physical_records || [
      { name:'Alex Johnson',    type:'physical', status:'present', time:'09:02', verified:true },
      { name:'Maria Garcia',    type:'physical', status:'late',    time:'09:14', verified:true },
      { name:'DeShawn Williams',type:'physical', status:'present', time:'09:01', verified:true },
      { name:'Priya Patel',     type:'physical', status:'absent',  time:null,   verified:false },
      { name:'Marcus Thompson', type:'physical', status:'present', time:'09:00', verified:true },
    ]
    const virtual = body.virtual_records || [
      { name:'Liam Chen',      type:'virtual', status:'present', duration:65, join:'08:58', verified:true },
      { name:'Aaliyah Brown',  type:'virtual', status:'late',    duration:45, join:'09:22', verified:true },
      { name:'Sofia Rodriguez',type:'virtual', status:'flagged', duration:8,  join:'09:02', verified:false, flag:'insufficient_duration' },
    ]
    const all       = [...physical, ...virtual]
    const present   = all.filter(r => r.status==='present').length
    const late      = all.filter(r => r.status==='late').length
    const absent    = all.filter(r => r.status==='absent').length
    const flagged   = all.filter(r => r.status==='flagged').length
    const total     = all.length

    // Try AI enhancement if key provided
    let aiSummary = null
    if (body.apiKey) {
      try {
        const url = ((body.baseUrl || 'https://www.genspark.ai/api/llm_proxy/v1') as string).replace(/\/$/, '') + '/chat/completions'
        const prompt = `You are AttendanceIntelligenceEngine for Code Differently. Analyze this attendance data and return JSON only.
DATA: ${JSON.stringify({ session_type: body.session_type, total, present, late, absent, flagged, records: all })}
Return: {"summary":"<2 sentence summary>","anomalies":[{"student":"<name>","issue":"<desc>","severity":"warning|error"}],"recommendation":"<action>","confidence":0.0-1.0}`
        const res = await fetch(url, {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${body.apiKey}`},
          body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'user',content:prompt}], temperature:0.2, max_tokens:600 })
        })
        if (res.ok) {
          const d: any = await res.json()
          const raw = (d.choices[0].message.content as string).replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()
          aiSummary = JSON.parse(raw)
        }
      } catch { /* fall through to local analysis */ }
    }
    // Local analysis fallback
    const localSummary = {
      summary: `We detected ${present} students present, ${late} joined late, ${absent} absent, ${flagged} flagged for review.`,
      anomalies: [
        ...virtual.filter((r:any)=>r.flag==='insufficient_duration').map((r:any) => ({ student:r.name, issue:'Virtual session too short (< 15 min)', severity:'warning' })),
        ...physical.filter((r:any)=>r.status==='absent').map((r:any)=>({ student:r.name, issue:'No clock-in recorded — physically absent', severity:'error' })),
        ...all.filter((r:any)=>r.status==='late').map((r:any)=>({ student:r.name, issue:`Late arrival (${r.time||r.join})`, severity:'warning' })),
      ],
      recommendation: flagged > 0 ? `Review ${flagged} flagged record(s) before confirming` : 'Data looks clean — ready to confirm',
      confidence: flagged === 0 ? 0.97 : 0.78
    }
    return c.json({
      success: true, session_id: body.session_id,
      analysis: aiSummary || localSummary,
      ai_enhanced: !!aiSummary,
      proposal: {
        total_students: total, present, late, absent, flagged,
        physical_count: physical.filter((r:any)=>r.status!=='absent').length,
        virtual_count: virtual.filter((r:any)=>r.status!=='flagged').length,
        records: all, ready_to_confirm: flagged === 0
      },
      analyzed_at: new Date().toISOString()
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// POST /api/hybrid/ai/confirm  — instructor confirms the AI proposal
app.post('/api/hybrid/ai/confirm', async (c) => {
  try {
    const body = await c.req.json() as { session_id: string; action: 'confirm'|'modify'|'rerun'; modifications?: any[] }
    return c.json({
      success: true, session_id: body.session_id, action: body.action,
      message: body.action === 'confirm' ? 'Attendance finalized and saved' :
               body.action === 'modify'  ? 'Records updated — please re-confirm' :
               'Re-running verification…',
      finalized_at: body.action === 'confirm' ? new Date().toISOString() : null
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// ── FraudDetectionService ─────────────────────────────────────────────
// POST /api/hybrid/fraud/analyze — scan session for suspicious patterns
app.post('/api/hybrid/fraud/analyze', async (c) => {
  try {
    const body = await c.req.json() as { session_id: string; records?: any[] }
    // Sample fraud analysis (production: ML model or AI)
    const flags = [
      { id:'F001', student_id:'EMP006', student:'Aaliyah Brown',  flag_type:'short_session',
        flag_description:'Virtual session only 8 min — below 15 min threshold',
        severity:'warning', timestamp: new Date().toISOString(), auto_action:'none' },
      { id:'F002', student_id:'EMP009', student:'Unknown User',   flag_type:'unmatched_account',
        flag_description:'Participant email unknown@gmail.com not in student roster',
        severity:'error', timestamp: new Date().toISOString(), auto_action:'excluded' },
      { id:'F003', student_id:'EMP002', student:'Maria Garcia',   flag_type:'late_pattern',
        flag_description:'3rd consecutive late arrival — pattern detected',
        severity:'info', timestamp: new Date().toISOString(), auto_action:'none' },
    ]
    return c.json({
      success: true, session_id: body.session_id,
      total_flags: flags.length,
      flags_by_severity: { error: flags.filter(f=>f.severity==='error').length, warning: flags.filter(f=>f.severity==='warning').length, info: flags.filter(f=>f.severity==='info').length },
      flags, analyzed_at: new Date().toISOString(),
      note: 'Flags are for instructor review only — no automatic penalties applied'
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// GET /api/hybrid/fraud/flags/:session_id — get flags for a session
app.get('/api/hybrid/fraud/flags/:session_id', (c) => {
  const sid = c.req.param('session_id')
  return c.json({ session_id: sid, flags: [], total: 0, message: 'No flags for this session' })
})

// ── Hybrid Merge Engine ───────────────────────────────────────────────
// POST /api/hybrid/merge — merge physical + virtual attendance datasets
app.post('/api/hybrid/merge', async (c) => {
  try {
    const body = await c.req.json() as { session_id: string; physical: any[]; virtual: any[] }
    const merged = new Map<string, any>()
    // Physical records take priority for in-person status
    for (const r of (body.physical || [])) {
      merged.set(r.name, { ...r, attendance_source: 'physical' })
    }
    // Virtual records fill in or supplement
    for (const r of (body.virtual || [])) {
      if (!merged.has(r.name)) {
        merged.set(r.name, { ...r, attendance_source: 'virtual' })
      } else {
        const existing = merged.get(r.name)!
        // If physical absent but virtual present, use virtual
        if (existing.status === 'absent' && (r.status === 'present' || r.status === 'late')) {
          merged.set(r.name, { ...r, attendance_source: 'virtual_override', physical_status: existing.status })
        }
      }
    }
    const records  = Array.from(merged.values())
    const present  = records.filter(r=>r.status==='present').length
    const late     = records.filter(r=>r.status==='late').length
    const absent   = records.filter(r=>r.status==='absent').length
    const flagged  = records.filter(r=>r.status==='flagged').length
    return c.json({
      success: true, session_id: body.session_id,
      merged_records: records,
      summary: { total: records.length, present, late, absent, flagged,
        physical_only: records.filter(r=>r.attendance_source==='physical').length,
        virtual_only:  records.filter(r=>r.attendance_source==='virtual').length,
        virtual_override: records.filter(r=>r.attendance_source==='virtual_override').length
      },
      merged_at: new Date().toISOString()
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// ── Smart Attendance AI Assistant ─────────────────────────────────
// POST /api/hybrid/smart-assistant  — real-time analysis + suggestions
app.post('/api/hybrid/smart-assistant', async (c) => {
  try {
    const body = await c.req.json() as {
      query: string; session_type?: string
      physical_records?: any[]; virtual_records?: any[]
      apiKey?: string; baseUrl?: string
    }
    const phys    = body.physical_records || []
    const virt    = body.virtual_records  || []
    const all     = [...phys, ...virt]
    const present = all.filter(r => r.status === 'present').length
    const late    = all.filter(r => r.status === 'late').length
    const absent  = all.filter(r => r.status === 'absent').length
    const flagged = all.filter(r => r.status === 'flagged' || r.status === 'insufficient_duration').length

    // Attempt AI
    let reply = ''
    if (body.apiKey) {
      try {
        const url = ((body.baseUrl || 'https://www.genspark.ai/api/llm_proxy/v1') as string).replace(/\/$/, '') + '/chat/completions'
        const systemPrompt = `You are a Smart Attendance AI Assistant for Code Differently. Provide concise 2-3 sentence insights. Always note recommendations require instructor approval.`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${body.apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Data: ${JSON.stringify({ session_type: body.session_type, present, late, absent, flagged, records: all })}\n\nQuestion: ${body.query}` }
            ],
            temperature: 0.3, max_tokens: 300
          })
        })
        if (res.ok) {
          const d: any = await res.json()
          reply = d.choices?.[0]?.message?.content || ''
        }
      } catch { /* fall through */ }
    }

    // Local fallback
    if (!reply) {
      const q = body.query.toLowerCase()
      if (q.includes('summar'))         reply = `Session has ${present} present, ${late} late, ${absent} absent, ${flagged} flagged. Attendance rate: ${Math.round(present/(all.length||1)*100)}%. ${flagged > 0 ? 'Review flagged records before confirming.' : 'Ready to confirm.'}`
      else if (q.includes('miss'))      reply = `${absent} student(s) have no clock-in record. Recommend contacting them or marking as excused if appropriate.`
      else if (q.includes('stipend'))   reply = `Students with lates or absences: ${all.filter(r=>r.status==='late'||r.status==='absent').map((r:any)=>r.name).join(', ') || 'none'}. Monitor weekly to assess stipend impact.`
      else if (q.includes('virtual'))   reply = `Physical: ${phys.filter((r:any)=>r.status!=='absent').length}/${phys.length} attended. Virtual: ${virt.filter((r:any)=>r.status==='present'||r.status==='late').length}/${virt.length} attended. Virtual sessions have slightly higher late rate.`
      else if (q.includes('fraud'))     reply = `${flagged} records flagged for review. All flags are informational only — no automatic penalties applied. Instructor must review and decide.`
      else                              reply = `Current session (${body.session_type || 'hybrid'}): ${present} present, ${late} late, ${absent} absent. Ask me about summaries, missing entries, stipend risk, or virtual vs physical.`
    }

    return c.json({ success: true, reply, ai_enhanced: !!body.apiKey, timestamp: new Date().toISOString() })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400)
  }
})

// ── Hybrid Report Intelligence — metrics endpoint ────────────────
// GET /api/hybrid/report-metrics — aggregated metrics for ReportIntelligenceService
app.get('/api/hybrid/report-metrics', (c) => {
  return c.json({
    success: true,
    metrics: {
      physical_pct: 68, virtual_pct: 32,
      late_rate: 14, early_departure_rate: 8,
      fraud_flags: 3, attendance_trend: +4.2,
      by_mode: {
        physical: { attendance_rate: 91.2, late_rate: 12.4, stipend_eligible: 5, total: 8 },
        virtual:  { attendance_rate: 87.5, late_rate: 17.1, stipend_eligible: 4, total: 6 }
      },
      insights: [
        { type: 'warning', message: 'Virtual participants show 17% higher late rate — consider join reminders' },
        { type: 'alert',   message: '3 fraud flags detected in virtual sessions — review before stipend decisions' },
        { type: 'info',    message: 'Average virtual session duration (-14 min vs physical) — monitor engagement' }
      ]
    },
    generated_at: new Date().toISOString()
  })
})

// GET /api/hybrid/data-schema — return extension table schemas (read-only docs)
app.get('/api/hybrid/data-schema', (c) => {
  return c.json({
    extension_tables: {
      AttendanceSession: {
        description: 'Tracks each class session with mode configuration',
        fields: { id:'string PK', class_id:'string', session_type:'physical|virtual|hybrid',
          start_time:'ISO datetime', verification_checkpoint:'integer (minutes)', status:'active|completed|cancelled',
          virtual_link:'string|null', instructor_id:'string', duration_minutes:'integer' }
      },
      VirtualPresenceRecord: {
        description: 'Logs each virtual participant\'s presence signals',
        fields: { id:'string PK', student_id:'string FK', session_id:'string FK',
          email:'string', join_time:'ISO datetime', leave_time:'ISO datetime|null',
          presence_duration:'integer (minutes)', platform:'google_meet|zoom|teams',
          verification_score:'float 0-1', status:'present|late|absent|flagged' }
      },
      FraudFlag: {
        description: 'Records suspicious attendance patterns for instructor review',
        fields: { id:'string PK', student_id:'string FK', session_id:'string FK',
          flag_type:'short_session|unmatched_account|late_pattern|location_spoof|duplicate_login',
          flag_description:'string', severity:'info|warning|error',
          timestamp:'ISO datetime', resolved:'boolean', resolved_by:'string|null' }
      }
    },
    note: 'These tables extend the existing attendance system. Core tables remain unchanged.'
  })
})

// ═══════════════════════════════════════════════════════════════════
// LOCATION VERIFICATION API  (Enhancement Layer — non-destructive)
// ═══════════════════════════════════════════════════════════════════

// ── POST /api/location/verify ────────────────────────────────────────
// The interception layer: called by student BEFORE attendance is recorded.
// Returns {allowed, status, distance, message, verification_id}
app.post('/api/location/verify', async (c) => {
  try {
    const body = await c.req.json() as {
      student_id: string
      session_id: string
      latitude: number
      longitude: number
      accuracy: number
      wifi_ssid?: string | null
    }

    // Validate required fields
    if (
      typeof body.latitude  !== 'number' ||
      typeof body.longitude !== 'number' ||
      typeof body.accuracy  !== 'number'
    ) {
      return c.json({ allowed: false, error: 'Missing or invalid GPS coordinates' }, 400)
    }

    const result = verifyLocation({
      student_id:  body.student_id  || 'anonymous',
      session_id:  body.session_id  || 'session-' + Date.now(),
      latitude:    body.latitude,
      longitude:   body.longitude,
      accuracy:    body.accuracy,
      wifi_ssid:   body.wifi_ssid   || null,
    })

    return c.json({
      allowed:              result.allowed,
      status:               result.status,
      distance_from_school: result.distance_from_school,
      gps_verified:         result.gps_verified,
      wifi_verified:        result.wifi_verified,
      rejection_reason:     result.rejection_reason,
      verification_id:      result.verification_id,
      school_name:          result.school_name,
      message:              result.message,
      school_config: {
        radius:    getSchoolConfig().radius,
        latitude:  getSchoolConfig().latitude,
        longitude: getSchoolConfig().longitude,
      },
    })
  } catch (err: any) {
    return c.json({ allowed: false, error: err.message }, 500)
  }
})

// ── GET /api/location/config ─────────────────────────────────────────
// Returns current geofence configuration (safe for client — no secrets)
app.get('/api/location/config', (c) => {
  const cfg = getSchoolConfig()
  return c.json({
    id:                    cfg.id,
    name:                  cfg.name,
    latitude:              cfg.latitude,
    longitude:             cfg.longitude,
    radius:                cfg.radius,
    max_accuracy:          cfg.max_accuracy,
    allowed_wifi_networks: cfg.allowed_wifi_networks,
    updated_at:            cfg.updated_at,
  })
})

// ── POST /api/location/config ────────────────────────────────────────
// Admin-only: update the geofence configuration
app.post('/api/location/config', async (c) => {
  try {
    const body = await c.req.json() as {
      name: string
      latitude: number
      longitude: number
      radius: number
      max_accuracy?: number
      allowed_wifi_networks?: string[]
    }

    if (!body.name || typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      return c.json({ success: false, error: 'name, latitude, and longitude are required' }, 400)
    }

    const updated = setSchoolConfig({
      name:                  body.name,
      latitude:              body.latitude,
      longitude:             body.longitude,
      radius:                body.radius || 60,
      max_accuracy:          body.max_accuracy || 40,
      allowed_wifi_networks: body.allowed_wifi_networks || [],
    })

    return c.json({ success: true, config: updated })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── GET /api/location/verifications ──────────────────────────────────
// Admin/Instructor: audit trail of all verification attempts
app.get('/api/location/verifications', (c) => {
  const studentId = c.req.query('student_id') || undefined
  const limit     = parseInt(c.req.query('limit') || '50')
  const records   = getVerifications(studentId, limit)
  const stats     = getVerificationStats()
  return c.json({ stats, records })
})

// ── GET /api/location/distance ────────────────────────────────────────
// Utility: calculate distance from a point to the configured school
app.get('/api/location/distance', (c) => {
  const lat = parseFloat(c.req.query('lat') || '')
  const lon = parseFloat(c.req.query('lon') || '')
  if (isNaN(lat) || isNaN(lon)) {
    return c.json({ error: 'lat and lon query params required' }, 400)
  }
  const school   = getSchoolConfig()
  const distance = haversineDistance(lat, lon, school.latitude, school.longitude)
  return c.json({
    distance_meters: Math.round(distance),
    inside_geofence: distance <= school.radius,
    radius:          school.radius,
    school:          school.name,
  })
})

// ═══════════════════════════════════════════════════════════════════
// AI + QUICKBOOKS API ROUTES
// ═══════════════════════════════════════════════════════════════════

// Helper: call OpenAI with the environment-injected key
async function callOpenAI(env: Bindings, messages: Array<{role: string, content: string}>) {
  // Support runtime env override so a fresh token can be passed via X-AI-Key header or env
  const apiKey  = env.OPENAI_API_KEY || (globalThis as any).__OPENAI_API_KEY__
  const baseUrl = ((env.OPENAI_BASE_URL || 'https://api.openai.com/v1') as string).replace(/\/$/, '')
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages,
      temperature: 0.2,
      max_tokens: 1500
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${err}`)
  }
  const data: any = await res.json()
  return data.choices[0].message.content as string
}

// ── POST /api/ai/review-payroll ───────────────────────────────────
// AI reviews attendance records for anomalies before QB sync
app.post('/api/ai/review-payroll', async (c) => {
  try {
    const body = await c.req.json() as { records: any[], date?: string }
    const { records, date } = body

    const systemPrompt = `You are a payroll compliance AI assistant for Code Differently, an educational organization.
Your job is to review student attendance records before they are sent to QuickBooks.
You flag anomalies, verify hours are reasonable, check stipend eligibility, and produce clean QB-ready payroll entries.
Always respond with valid JSON only. No markdown, no explanation outside the JSON.`

    const userPrompt = `Review these attendance records for ${date || 'today'} and produce QuickBooks payroll entries.

ATTENDANCE DATA:
${JSON.stringify(records, null, 2)}

RULES:
- Standard shift: 9:00 AM – 5:00 PM (8 hours)
- Late threshold: more than 10 minutes after 9:00 AM
- Stipend eligible: attendance >= 85%, lates <= 3/month, absences <= 2/month
- QB Payroll Item: STUDENT-STIPEND-2024
- Flag anomalies: hours > 10, duplicate entries, absent but hours logged

Respond with this exact JSON structure:
{
  "reviewed_at": "<ISO timestamp>",
  "total_records": <number>,
  "anomalies": [{ "student": "<name>", "issue": "<description>", "severity": "warning|error" }],
  "qb_entries": [
    {
      "employee_name": "<name>",
      "payroll_item": "STUDENT-STIPEND-2024",
      "hours": <number>,
      "status": "present|late|absent",
      "stipend_eligible": true|false,
      "qb_time_activity": {
        "TxnDate": "<YYYY-MM-DD>",
        "NameOf": "<name>",
        "ItemRef": { "value": "STUDENT-STIPEND-2024" },
        "Hours": <number>,
        "Minutes": <number>,
        "Description": "<auto-generated note>"
      }
    }
  ],
  "summary": {
    "eligible_count": <number>,
    "ineligible_count": <number>,
    "total_hours": <number>,
    "anomaly_count": <number>,
    "ai_recommendation": "<1-2 sentence summary>"
  }
}`

    const aiResponse = await callOpenAI(c.env, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ])

    let parsed: any
    try {
      parsed = JSON.parse(aiResponse)
    } catch {
      // strip markdown fences if model wrapped in them
      const clean = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    }

    return c.json({ success: true, data: parsed })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── POST /api/ai/generate-qb-entry ───────────────────────────────
// Generate a single QB time-activity entry from one attendance record
app.post('/api/ai/generate-qb-entry', async (c) => {
  try {
    const body = await c.req.json() as { student: string, clockIn: string, clockOut: string, status: string, date: string }

    const systemPrompt = `You are a QuickBooks payroll entry generator for Code Differently.
Generate a precise QuickBooks Time Activity JSON entry. Respond with JSON only.`

    const userPrompt = `Generate a QuickBooks time activity entry for:
Student: ${body.student}
Date: ${body.date}
Clock In: ${body.clockIn}
Clock Out: ${body.clockOut}
Status: ${body.status}

Return JSON matching the QuickBooks TimeActivity object format with fields:
TxnDate, NameOf, ItemRef (value: "STUDENT-STIPEND-2024"), Hours, Minutes, BillableStatus ("NotBillable"), Description, TaxCodeRef.`

    const aiResponse = await callOpenAI(c.env, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ])

    const clean = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return c.json({ success: true, entry: JSON.parse(clean) })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── POST /api/ai/stipend-check ────────────────────────────────────
// AI evaluates full student record and returns stipend decision + reasoning
app.post('/api/ai/stipend-check', async (c) => {
  try {
    const body = await c.req.json() as { student: string, totalHours: number, attendancePct: number, lates: number, absences: number }

    const systemPrompt = `You are a stipend eligibility evaluator for Code Differently educational programs.
Be fair, thorough, and explain your reasoning clearly. Respond with JSON only.`

    const userPrompt = `Evaluate stipend eligibility for this student:

Name: ${body.student}
Total Hours This Month: ${body.totalHours}
Attendance Rate: ${body.attendancePct}%
Late Arrivals: ${body.lates}
Absences: ${body.absences}

ELIGIBILITY RULES:
- Minimum attendance: 85%
- Maximum late arrivals: 3 per month
- Maximum absences: 2 per month

Return JSON:
{
  "student": "<name>",
  "eligible": true|false,
  "status": "eligible|at-risk|ineligible",
  "score": <0-100>,
  "reasons": ["<reason1>", "<reason2>"],
  "recommendation": "<action for admin>",
  "qb_action": "include|exclude|flag-for-review"
}`

    const aiResponse = await callOpenAI(c.env, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ])

    const clean = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return c.json({ success: true, result: JSON.parse(clean) })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── POST /api/qb/payroll/sync ─────────────────────────────────────
// Simulates final QB sync after AI review (real QB OAuth would go here)
app.post('/api/qb/payroll/sync', async (c) => {
  try {
    const body = await c.req.json() as { entries: any[], confirmed: boolean }
    if (!body.confirmed) {
      return c.json({ success: false, error: 'Entries must be AI-reviewed and confirmed before sync' }, 400)
    }
    // In production: POST to QB API https://quickbooks.api.intuit.com/v3/company/{realmId}/timeactivity
    const results = body.entries.map((e: any, i: number) => ({
      id: `QB-${Date.now()}-${i}`,
      employee: e.employee_name || e.NameOf,
      hours: e.hours || e.Hours,
      status: 'synced',
      qb_txn_id: `TXN-${Math.random().toString(36).slice(2,10).toUpperCase()}`
    }))
    return c.json({ success: true, synced: results.length, transactions: results })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── GET /api/qb/auth/connect ──────────────────────────────────────
app.get('/api/qb/auth/connect', (c) => {
  // Real: redirect to https://appcenter.intuit.com/connect/oauth2 with client_id, scope, redirect_uri
  return c.json({
    message: 'QuickBooks OAuth2 Connect',
    oauth_url: 'https://appcenter.intuit.com/connect/oauth2',
    required_params: { client_id: 'YOUR_QB_CLIENT_ID', scope: 'com.intuit.quickbooks.accounting', redirect_uri: '/api/qb/auth/callback' },
    docs: 'https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0'
  })
})

// ── GET /api/qb/employees ─────────────────────────────────────────
app.get('/api/qb/employees', (c) => {
  return c.json({
    employees: [
      { id: 'EMP001', name: 'Alex Johnson',       qb_id: 'QB-EMP-001', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP002', name: 'Maria Garcia',        qb_id: 'QB-EMP-002', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP003', name: 'DeShawn Williams',    qb_id: 'QB-EMP-003', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP004', name: 'Priya Patel',         qb_id: 'QB-EMP-004', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP005', name: 'Liam Chen',           qb_id: 'QB-EMP-005', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP006', name: 'Aaliyah Brown',       qb_id: 'QB-EMP-006', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP007', name: 'Marcus Thompson',     qb_id: 'QB-EMP-007', payroll_item: 'STUDENT-STIPEND-2024' },
      { id: 'EMP008', name: 'Sofia Rodriguez',     qb_id: 'QB-EMP-008', payroll_item: 'STUDENT-STIPEND-2024' },
    ]
  })
})

// ── POST /api/ai/test-key ─────────────────────────────────────────
// Validate an OpenAI-compatible API key from the frontend settings UI
app.post('/api/ai/test-key', async (c) => {
  try {
    const { apiKey, baseUrl } = await c.req.json() as { apiKey: string, baseUrl?: string }
    const url = ((baseUrl || 'https://api.openai.com/v1') as string).replace(/\/$/, '') + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-5-mini', messages: [{ role: 'user', content: 'Reply with the single word: connected' }], max_tokens: 10 })
    })
    if (!res.ok) {
      const err = await res.text()
      return c.json({ success: false, error: `API returned ${res.status}: ${err}` })
    }
    const data: any = await res.json()
    return c.json({ success: true, message: 'API key is valid ✓', response: data.choices[0].message.content })
  } catch (err: any) {
    return c.json({ success: false, error: err.message })
  }
})

// ── POST /api/ai/run-with-key ─────────────────────────────────────
// Accept key+payload from frontend; run AI review without storing key server-side
app.post('/api/ai/run-with-key', async (c) => {
  try {
    const { apiKey, baseUrl, records, date } = await c.req.json() as {
      apiKey: string, baseUrl?: string, records: any[], date?: string
    }
    const url = ((baseUrl || 'https://api.openai.com/v1') as string).replace(/\/$/, '') + '/chat/completions'

    const systemPrompt = `You are a payroll compliance AI for Code Differently. Review attendance and produce QuickBooks payroll entries. Respond with valid JSON only — no markdown.`
    const userPrompt = `Review attendance for ${date || 'today'} and generate QuickBooks payroll entries.

RECORDS:
${JSON.stringify(records, null, 2)}

RULES: shift 9AM–5PM, late > 10 min, stipend requires ≥85% attendance, ≤3 lates, ≤2 absences, QB item: STUDENT-STIPEND-2024.

Return JSON:
{
  "reviewed_at": "<ISO>",
  "total_records": <n>,
  "anomalies": [{"student":"<name>","issue":"<desc>","severity":"warning|error"}],
  "qb_entries": [{"employee_name":"<name>","hours":<n>,"status":"present|late|absent","stipend_eligible":<bool>,"qb_time_activity":{"TxnDate":"<YYYY-MM-DD>","NameOf":"<name>","ItemRef":{"value":"STUDENT-STIPEND-2024"},"Hours":<n>,"Minutes":<n>,"Description":"<note>"}}],
  "summary": {"eligible_count":<n>,"ineligible_count":<n>,"total_hours":<n>,"anomaly_count":<n>,"ai_recommendation":"<text>"}
}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-5-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.2, max_tokens: 2000 })
    })
    if (!res.ok) {
      const err = await res.text()
      return c.json({ success: false, error: `AI API ${res.status}: ${err}` }, 500)
    }
    const data: any = await res.json()
    const raw = data.choices[0].message.content as string
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return c.json({ success: true, data: JSON.parse(clean) })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// ── Shared shell ─────────────────────────────────────────────────────
function shell(title: string, body: string, role: string = ''): string {
  const nav = role ? `
  <nav class="cd-nav">
    <div class="cd-nav-brand">
      <div class="cd-logo-icon"></div>
      <span class="cd-brand-text">Connect<strong>Differently</strong></span>
    </div>
    <div class="cd-nav-links">
      ${role === 'student' ? `<a href="/student" class="nav-link"><i class="fa fa-clock"></i> Clock In/Out</a>
        <a href="/profile" class="nav-link"><i class="fa fa-user"></i> My Profile</a>` : ''}
      ${role === 'instructor' ? `<a href="/instructor" class="nav-link"><i class="fa fa-list-check"></i> Attendance</a>
        <a href="/hybrid" class="nav-link"><i class="fa fa-layer-group"></i> Hybrid</a>
        <a href="/reports" class="nav-link"><i class="fa fa-chart-bar"></i> Reports</a>` : ''}
      ${role === 'admin' ? `<a href="/admin" class="nav-link"><i class="fa fa-gauge"></i> Dashboard</a>
        <a href="/instructor" class="nav-link"><i class="fa fa-list-check"></i> Attendance</a>
        <a href="/hybrid" class="nav-link"><i class="fa fa-layer-group"></i> Hybrid</a>
        <a href="/reports" class="nav-link"><i class="fa fa-chart-bar"></i> Reports</a>
        <a href="/geofence" class="nav-link"><i class="fa fa-map-location-dot"></i> Geofence</a>
        <a href="/settings" class="nav-link"><i class="fa fa-gear"></i> Settings</a>` : ''}
      <a href="/login" class="nav-link nav-logout"><i class="fa fa-right-from-bracket"></i> Logout</a>
    </div>
    <button class="cd-hamburger" onclick="toggleMenu()"><i class="fa fa-bars"></i></button>
  </nav>
  <div class="cd-mobile-menu" id="mobileMenu">
    ${role === 'student' ? `<a href="/student"><i class="fa fa-clock"></i> Clock In/Out</a>
      <a href="/profile"><i class="fa fa-user"></i> My Profile</a>` : ''}
    ${role === 'instructor' ? `<a href="/instructor"><i class="fa fa-list-check"></i> Attendance</a>
      <a href="/hybrid"><i class="fa fa-layer-group"></i> Hybrid</a>
      <a href="/reports"><i class="fa fa-chart-bar"></i> Reports</a>` : ''}
    ${role === 'admin' ? `<a href="/admin"><i class="fa fa-gauge"></i> Dashboard</a>
      <a href="/admin/users"><i class="fa fa-users-gear"></i> Users</a>
      <a href="/instructor"><i class="fa fa-list-check"></i> Attendance</a>
      <a href="/hybrid"><i class="fa fa-layer-group"></i> Hybrid</a>
      <a href="/reports"><i class="fa fa-chart-bar"></i> Reports</a>
      <a href="/geofence"><i class="fa fa-map-location-dot"></i> Geofence</a>
      <a href="/settings"><i class="fa fa-gear"></i> Settings</a>` : ''}
    <a href="#" onclick="performLogout(event)"><i class="fa fa-right-from-bracket"></i> Logout</a>
  </div>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — ConnectDifferently</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.ico"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css"/>
  <link rel="stylesheet" href="/static/style.css"/>
</head>
<body>
${nav}
<main class="${role ? 'cd-main' : ''}">
${body}
</main>
<script src="/static/app.js"></script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════
function loginPage(): string {
  const body = `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-logo">
      <div class="cd-logo-icon lg"></div>
      <h1>Connect<strong>Differently</strong></h1>
      <p class="login-sub">ShiftSync — Time &amp; Attendance</p>
    </div>

    <div class="role-tabs">
      <button class="role-tab active" onclick="switchRole('student',this)"><i class="fa fa-graduation-cap"></i> Student</button>
      <button class="role-tab" onclick="switchRole('instructor',this)"><i class="fa fa-chalkboard-teacher"></i> Instructor</button>
      <button class="role-tab" onclick="switchRole('admin',this)"><i class="fa fa-shield"></i> Admin</button>
    </div>

    <form class="login-form" id="loginForm" onsubmit="handleLogin(event)">
      <div class="form-group">
        <label><i class="fa fa-envelope"></i> Email Address</label>
        <input type="email" id="emailInput" placeholder="you@codedifferently.org" required/>
      </div>
      <div class="form-group">
        <label><i class="fa fa-lock"></i> Password</label>
        <div class="pw-wrap">
          <input type="password" id="pwInput" placeholder="••••••••" required/>
          <button type="button" class="pw-toggle" onclick="togglePw()"><i class="fa fa-eye" id="eyeIcon"></i></button>
        </div>
      </div>
      <button type="submit" class="btn-primary btn-full">
        <span id="loginBtnText"><i class="fa fa-right-to-bracket"></i> Sign In</span>
        <span id="loginSpinner" style="display:none"><i class="fa fa-spinner fa-spin"></i> Signing in…</span>
      </button>
    </form>

    <p class="login-hint">Demo: use any email + password<br/>
      <span class="hint-chip" onclick="demoLogin('student')">Student Demo</span>
      <span class="hint-chip" onclick="demoLogin('instructor')">Instructor Demo</span>
      <span class="hint-chip" onclick="demoLogin('admin')">Admin Demo</span>
    </p>
  </div>
  <div class="login-bg-art">
    <div class="orb orb1"></div>
    <div class="orb orb2"></div>
    <div class="orb orb3"></div>
  </div>
</div>`
  return shell('Login', body)
}

// ═══════════════════════════════════════════════════════════════════
// STUDENT CLOCK-IN PAGE  (Enhanced with Location Verification)
// ═══════════════════════════════════════════════════════════════════
function studentPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2>Good morning, <span id="studentName">Alex Johnson</span> 👋</h2>
    <p class="page-sub">Today is <span id="todayDate"></span></p>
  </div>
  <div class="header-badge" id="statusBadge">
    <span class="badge badge-ready">Ready to Clock In</span>
  </div>
</div>

<!-- ── Geofence Proximity Banner ─────────────────────────────── -->
<div class="geo-banner" id="geoBanner" style="display:none">
  <div class="geo-banner-inner">
    <div class="geo-pulse" id="geoPulse"></div>
    <div class="geo-banner-text">
      <strong id="geoBannerTitle">Checking location…</strong>
      <span id="geoBannerSub"></span>
    </div>
    <div class="geo-banner-badge" id="geoBannerBadge"></div>
  </div>
  <div class="geo-distance-bar">
    <div class="geo-distance-fill" id="geoDistanceFill" style="width:0%"></div>
  </div>
</div>

<!-- ── Location Verification Panel (shows on clock-in attempt) ── -->
<div class="location-verify-panel" id="locationPanel" style="display:none">
  <div class="lv-header">
    <i class="fa fa-shield-halved lv-shield" id="lvShield"></i>
    <div>
      <strong id="lvTitle">Verifying Location…</strong>
      <p id="lvSub">Please wait</p>
    </div>
    <button class="lv-close" onclick="closeLocationPanel()"><i class="fa fa-xmark"></i></button>
  </div>

  <div class="lv-checks">
    <div class="lv-check" id="lvc-gps">
      <div class="lvc-icon"><i class="fa fa-satellite-dish"></i></div>
      <div class="lvc-info">
        <strong>GPS Position</strong>
        <span id="lvc-gps-val">Acquiring…</span>
      </div>
      <div class="lvc-status" id="lvc-gps-st"><i class="fa fa-spinner fa-spin"></i></div>
    </div>
    <div class="lv-check" id="lvc-dist">
      <div class="lvc-icon"><i class="fa fa-ruler"></i></div>
      <div class="lvc-info">
        <strong>Distance from Campus</strong>
        <span id="lvc-dist-val">Calculating…</span>
      </div>
      <div class="lvc-status" id="lvc-dist-st"><i class="fa fa-spinner fa-spin"></i></div>
    </div>
    <div class="lv-check" id="lvc-acc">
      <div class="lvc-icon"><i class="fa fa-crosshairs"></i></div>
      <div class="lvc-info">
        <strong>GPS Accuracy</strong>
        <span id="lvc-acc-val">Checking…</span>
      </div>
      <div class="lvc-status" id="lvc-acc-st"><i class="fa fa-spinner fa-spin"></i></div>
    </div>
    <div class="lv-check" id="lvc-wifi">
      <div class="lvc-icon"><i class="fa fa-wifi"></i></div>
      <div class="lvc-info">
        <strong>Campus WiFi</strong>
        <span id="lvc-wifi-val">Scanning…</span>
      </div>
      <div class="lvc-status" id="lvc-wifi-st"><i class="fa fa-spinner fa-spin"></i></div>
    </div>
  </div>

  <div class="lv-result" id="lvResult" style="display:none">
    <div class="lv-result-icon" id="lvResultIcon"></div>
    <div class="lv-result-message" id="lvResultMsg"></div>
    <div class="lv-result-actions" id="lvResultActions"></div>
  </div>
</div>

<!-- ── Clock Widget ───────────────────────────────────────────── -->
<div class="clock-widget-wrap">
  <div class="clock-widget" id="clockWidget">
    <div class="clock-time" id="liveTime">00:00:00</div>
    <div class="clock-date" id="liveDate"></div>
    <div class="clock-shift">
      <i class="fa fa-calendar-day"></i>
      Shift: <strong>9:00 AM – 5:00 PM</strong>
    </div>
    <div class="clock-status" id="clockStatus">
      <div class="status-dot dot-idle"></div>
      <span id="clockStatusText">Not Clocked In</span>
    </div>
    <!-- Clock button — disabled until GPS ready -->
    <button class="btn-clock btn-clockin" id="clockBtn" onclick="handleClock()" disabled>
      <i class="fa fa-location-dot" id="clockIcon"></i>
      <span id="clockBtnText">Acquiring Location…</span>
    </button>
    <div class="gps-status" id="gpsStatus">
      <i class="fa fa-satellite-dish fa-spin"></i>
      <span id="gpsText">Initializing GPS…</span>
    </div>
  </div>
</div>

<!-- ── Map Mini Preview ───────────────────────────────────────── -->
<div class="card mt-16" id="mapCard">
  <div class="card-header">
    <h3><i class="fa fa-map-location-dot"></i> Campus Proximity Map</h3>
    <span class="badge badge-ready" id="mapDistBadge">—</span>
  </div>
  <div id="miniMap" class="mini-map">
    <div class="mini-map-placeholder">
      <i class="fa fa-satellite-dish fa-spin"></i>
      <p>Loading map…</p>
    </div>
  </div>
  <div class="map-legend">
    <span class="map-legend-item"><span class="map-dot campus"></span> Code Differently Campus</span>
    <span class="map-legend-item"><span class="map-dot you"></span> Your Location</span>
    <span class="map-legend-item"><span class="map-dot fence"></span> 60m Geofence</span>
  </div>
</div>

<!-- ── Today's Activity Log ──────────────────────────────────── -->
<div class="card mt-16">
  <div class="card-header">
    <h3><i class="fa fa-history"></i> Today's Activity</h3>
    <span class="badge badge-ai" id="verifyBadge" style="display:none">
      <i class="fa fa-shield-halved"></i> Location Verified
    </span>
  </div>
  <div class="timeline" id="todayLog">
    <div class="timeline-empty">
      <i class="fa fa-clock fa-2x"></i>
      <p>No activity yet today</p>
    </div>
  </div>
</div>

<!-- ── Weekly Summary ─────────────────────────────────────────── -->
<div class="grid-2 mt-16">
  <div class="card">
    <div class="stat-icon-wrap purple"><i class="fa fa-clock"></i></div>
    <div class="stat-info">
      <div class="stat-num" id="weekHours">18.5</div>
      <div class="stat-label">Hours This Week</div>
    </div>
  </div>
  <div class="card">
    <div class="stat-icon-wrap orange"><i class="fa fa-calendar-check"></i></div>
    <div class="stat-info">
      <div class="stat-num" id="weekDays">4</div>
      <div class="stat-label">Days Present</div>
    </div>
  </div>
  <div class="card">
    <div class="stat-icon-wrap yellow"><i class="fa fa-triangle-exclamation"></i></div>
    <div class="stat-info">
      <div class="stat-num" id="weekLates">1</div>
      <div class="stat-label">Late Arrivals</div>
    </div>
  </div>
  <div class="card">
    <div class="stat-icon-wrap green"><i class="fa fa-dollar-sign"></i></div>
    <div class="stat-info">
      <div class="stat-num" id="stipendStatus">✓ Eligible</div>
      <div class="stat-label">Stipend Status</div>
    </div>
  </div>
</div>`
  return shell('Clock In', body, 'student')
}

// ═══════════════════════════════════════════════════════════════════
// INSTRUCTOR PAGE
// ═══════════════════════════════════════════════════════════════════
function instructorPage(): string {
  const students = [
    { id: 1, name: 'Alex Johnson', clockIn: '9:02 AM', status: 'present' },
    { id: 2, name: 'Maria Garcia', clockIn: '9:14 AM', status: 'late' },
    { id: 3, name: 'DeShawn Williams', clockIn: '9:01 AM', status: 'present' },
    { id: 4, name: 'Priya Patel', clockIn: '—', status: 'absent' },
    { id: 5, name: 'Liam Chen', clockIn: '8:58 AM', status: 'present' },
    { id: 6, name: 'Aaliyah Brown', clockIn: '9:22 AM', status: 'late' },
    { id: 7, name: 'Marcus Thompson', clockIn: '9:00 AM', status: 'present' },
    { id: 8, name: 'Sofia Rodriguez', clockIn: '—', status: 'absent' },
  ]

  const rows = students.map(s => `
  <tr>
    <td>
      <div class="student-cell">
        <div class="avatar">${s.name.split(' ').map(n => n[0]).join('')}</div>
        <span>${s.name}</span>
      </div>
    </td>
    <td><span class="time-chip">${s.clockIn}</span></td>
    <td>
      <select class="status-select status-${s.status}" onchange="updateStatus(this,${s.id})">
        <option value="present" ${s.status === 'present' ? 'selected' : ''}>✅ Present</option>
        <option value="late" ${s.status === 'late' ? 'selected' : ''}>🕐 Late</option>
        <option value="absent" ${s.status === 'absent' ? 'selected' : ''}>❌ Absent</option>
        <option value="excused">📋 Excused</option>
      </select>
    </td>
    <td>
      <button class="btn-icon btn-confirm" onclick="confirmStudent(${s.id}, this)" title="Confirm Present">
        <i class="fa fa-check"></i>
      </button>
      <button class="btn-icon btn-note" onclick="addNote(${s.id})" title="Add Note">
        <i class="fa fa-sticky-note"></i>
      </button>
    </td>
  </tr>`).join('')

  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-list-check"></i> Attendance Verification</h2>
    <p class="page-sub">Mark students present, late, or absent for today's session</p>
  </div>
  <div class="header-actions">
    <input type="date" class="date-picker" id="attendanceDate" onchange="loadDate(this.value)"/>
    <button class="btn-primary" onclick="saveAll()"><i class="fa fa-save"></i> Save All</button>
  </div>
</div>

<!-- Quick Stats Bar -->
<div class="stats-bar">
  <div class="stats-bar-item green"><i class="fa fa-circle-check"></i><span>5 Present</span></div>
  <div class="stats-bar-item yellow"><i class="fa fa-clock"></i><span>2 Late</span></div>
  <div class="stats-bar-item red"><i class="fa fa-circle-xmark"></i><span>2 Absent</span></div>
  <div class="stats-bar-item blue"><i class="fa fa-users"></i><span>9 Total</span></div>
</div>

<!-- QuickBooks AI Panel -->
<div class="card qb-panel mt-16">
  <div class="qb-header">
    <div class="qb-logo-wrap">
      <i class="fa fa-bolt qb-bolt"></i>
      <span>QuickBooks AI Assistant</span>
    </div>
    <span class="badge badge-ai">AI-Powered</span>
  </div>
  <p class="qb-desc">After verifying attendance, click below to automatically sync today's payroll entries to QuickBooks.</p>
  <div class="qb-actions">
    <button class="btn-qb" onclick="syncQuickBooks()">
      <i class="fa fa-sync"></i> Sync to QuickBooks
    </button>
    <button class="btn-qb-outline" onclick="previewQB()">
      <i class="fa fa-eye"></i> Preview Entries
    </button>
  </div>
  <div id="qbSyncStatus" class="qb-sync-status" style="display:none"></div>
</div>

<!-- Attendance Table -->
<div class="card mt-16">
  <div class="card-header">
    <h3><i class="fa fa-calendar-day"></i> Today's Roster — <span id="rosterDate"></span></h3>
    <div class="search-wrap">
      <i class="fa fa-search"></i>
      <input type="text" placeholder="Search student…" onkeyup="filterStudents(this.value)"/>
    </div>
  </div>
  <div class="table-wrap">
    <table class="cd-table" id="rosterTable">
      <thead>
        <tr>
          <th>Student</th>
          <th>Clock In</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<!-- Note Modal -->
<div class="modal-overlay" id="noteModal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3><i class="fa fa-sticky-note"></i> Add Note</h3>
      <button class="modal-close" onclick="closeModal('noteModal')"><i class="fa fa-xmark"></i></button>
    </div>
    <textarea class="modal-textarea" placeholder="Enter attendance note…" id="noteText"></textarea>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal('noteModal')">Cancel</button>
      <button class="btn-primary" onclick="saveNote()">Save Note</button>
    </div>
  </div>
</div>`
  return shell('Instructor', body, 'instructor')
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function adminPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-gauge"></i> Admin Dashboard</h2>
    <p class="page-sub">Welcome back, <strong>Cristina</strong> — Code Differently</p>
  </div>
  <div class="header-actions">
    <button class="btn-secondary" onclick="window.location='/reports'"><i class="fa fa-file-export"></i> Export Report</button>
    <button class="btn-primary" onclick="window.location='/settings'"><i class="fa fa-gear"></i> Settings</button>
  </div>
</div>

<!-- KPI Cards -->
<div class="kpi-grid">
  <div class="kpi-card kpi-purple">
    <div class="kpi-icon"><i class="fa fa-users"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">42</div>
      <div class="kpi-label">Total Students</div>
      <div class="kpi-delta up"><i class="fa fa-arrow-up"></i> +3 this month</div>
    </div>
  </div>
  <div class="kpi-card kpi-green">
    <div class="kpi-icon"><i class="fa fa-circle-check"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">87%</div>
      <div class="kpi-label">Attendance Rate</div>
      <div class="kpi-delta up"><i class="fa fa-arrow-up"></i> +2% vs last week</div>
    </div>
  </div>
  <div class="kpi-card kpi-orange">
    <div class="kpi-icon"><i class="fa fa-clock"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">1,284</div>
      <div class="kpi-label">Total Hours Logged</div>
      <div class="kpi-delta up"><i class="fa fa-arrow-up"></i> This month</div>
    </div>
  </div>
  <div class="kpi-card kpi-yellow">
    <div class="kpi-icon"><i class="fa fa-triangle-exclamation"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">8</div>
      <div class="kpi-label">Late Alerts Sent</div>
      <div class="kpi-delta down"><i class="fa fa-arrow-up"></i> This week</div>
    </div>
  </div>
  <div class="kpi-card kpi-blue">
    <div class="kpi-icon"><i class="fa fa-dollar-sign"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">36</div>
      <div class="kpi-label">Stipend Eligible</div>
      <div class="kpi-delta up"><i class="fa fa-check"></i> of 42 students</div>
    </div>
  </div>
  <div class="kpi-card kpi-red">
    <div class="kpi-icon"><i class="fa fa-user-xmark"></i></div>
    <div class="kpi-data">
      <div class="kpi-num">6</div>
      <div class="kpi-label">At Risk Students</div>
      <div class="kpi-delta down"><i class="fa fa-exclamation"></i> Needs attention</div>
    </div>
  </div>
</div>

<div class="dashboard-grid mt-24">
  <!-- Attendance Chart -->
  <div class="card dash-chart-card">
    <div class="card-header">
      <h3><i class="fa fa-chart-line"></i> Weekly Attendance Trend</h3>
      <select class="select-sm" onchange="updateChart(this.value)">
        <option>This Week</option>
        <option>Last Week</option>
        <option>This Month</option>
      </select>
    </div>
    <canvas id="attendanceChart" height="200"></canvas>
  </div>

  <!-- Stipend Status Breakdown -->
  <div class="card">
    <div class="card-header">
      <h3><i class="fa fa-chart-pie"></i> Stipend Eligibility</h3>
    </div>
    <canvas id="stipendChart" height="200"></canvas>
    <div class="chart-legend">
      <div class="legend-item"><span class="leg-dot green"></span> Eligible (36)</div>
      <div class="legend-item"><span class="leg-dot yellow"></span> At Risk (4)</div>
      <div class="legend-item"><span class="leg-dot red"></span> Ineligible (2)</div>
    </div>
  </div>

  <!-- Recent Alerts -->
  <div class="card">
    <div class="card-header">
      <h3><i class="fa fa-bell"></i> Recent Alerts</h3>
      <a href="/settings" class="link-sm">Manage</a>
    </div>
    <div class="alert-list">
      <div class="alert-item alert-late">
        <div class="alert-icon"><i class="fa fa-clock"></i></div>
        <div class="alert-body">
          <strong>Maria Garcia</strong>
          <span>3rd late this month — email sent</span>
          <time>Today, 9:14 AM</time>
        </div>
      </div>
      <div class="alert-item alert-absent">
        <div class="alert-icon"><i class="fa fa-user-xmark"></i></div>
        <div class="alert-body">
          <strong>Priya Patel</strong>
          <span>Absent without notice</span>
          <time>Today</time>
        </div>
      </div>
      <div class="alert-item alert-late">
        <div class="alert-icon"><i class="fa fa-clock"></i></div>
        <div class="alert-body">
          <strong>Aaliyah Brown</strong>
          <span>2nd late this month</span>
          <time>Today, 9:22 AM</time>
        </div>
      </div>
      <div class="alert-item alert-risk">
        <div class="alert-icon"><i class="fa fa-triangle-exclamation"></i></div>
        <div class="alert-body">
          <strong>Sofia Rodriguez</strong>
          <span>Stipend eligibility at risk</span>
          <time>Yesterday</time>
        </div>
      </div>
    </div>
  </div>

  <!-- Top Students -->
  <div class="card">
    <div class="card-header">
      <h3><i class="fa fa-star"></i> Top Attendance</h3>
    </div>
    <div class="top-list">
      ${[
        { name: 'Liam Chen', pct: 100, hours: '42h' },
        { name: 'Marcus Thompson', pct: 98, hours: '41h' },
        { name: 'Alex Johnson', pct: 95, hours: '40h' },
        { name: 'DeShawn Williams', pct: 93, hours: '39h' },
        { name: 'James Park', pct: 90, hours: '38h' },
      ].map((s, i) => `
      <div class="top-item">
        <div class="top-rank rank-${i + 1}">${i + 1}</div>
        <div class="avatar sm">${s.name.split(' ').map(n => n[0]).join('')}</div>
        <div class="top-info">
          <strong>${s.name}</strong>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${s.pct}%"></div>
          </div>
        </div>
        <div class="top-stat">${s.pct}% · ${s.hours}</div>
      </div>`).join('')}
    </div>
  </div>
</div>

<!-- QuickBooks Integration Banner -->
<div class="card qb-banner mt-24">
  <div class="qb-banner-left">
    <i class="fa fa-bolt qb-bolt lg"></i>
    <div>
      <h3>QuickBooks AI Integration</h3>
      <p>Automatically sync attendance & payroll data to your QuickBooks account. AI reviews entries before submission.</p>
    </div>
  </div>
  <div class="qb-banner-right">
    <div class="qb-status-dot connected"></div>
    <span class="qb-connected-text">Connected</span>
    <button class="btn-qb" onclick="syncQBFromAdmin()"><i class="fa fa-sync"></i> Sync Payroll</button>
  </div>
</div>`
  return shell('Admin Dashboard', body, 'admin')
}

// ═══════════════════════════════════════════════════════════════════
// STUDENT PROFILE PAGE
// ═══════════════════════════════════════════════════════════════════
function profilePage(): string {
  const records = [
    { date: 'Mon Mar 11', in: '9:01 AM', out: '5:02 PM', hours: '8h 01m', status: 'present' },
    { date: 'Tue Mar 12', in: '9:14 AM', out: '5:00 PM', hours: '7h 46m', status: 'late' },
    { date: 'Wed Mar 13', in: '8:59 AM', out: '5:01 PM', hours: '8h 02m', status: 'present' },
    { date: 'Thu Mar 14', in: '9:00 AM', out: '4:58 PM', hours: '7h 58m', status: 'present' },
    { date: 'Fri Mar 15', in: '—', out: '—', hours: '0h', status: 'absent' },
    { date: 'Mon Mar 18', in: '9:02 AM', out: '5:03 PM', hours: '8h 01m', status: 'present' },
  ]

  const rows = records.map(r => `
  <tr>
    <td>${r.date}</td>
    <td>${r.in}</td>
    <td>${r.out}</td>
    <td>${r.hours}</td>
    <td><span class="badge badge-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
  </tr>`).join('')

  const body = `
<div class="page-header">
  <div class="profile-hero">
    <div class="profile-avatar-lg">AJ</div>
    <div>
      <h2>Alex Johnson</h2>
      <p class="page-sub">Student · Cohort 2024 · alex.johnson@codedifferently.org</p>
      <span class="badge badge-present">✓ Stipend Eligible</span>
    </div>
  </div>
</div>

<!-- Stats Row -->
<div class="profile-stats-grid">
  <div class="profile-stat-card green">
    <i class="fa fa-clock"></i>
    <div class="psc-num">156.5h</div>
    <div class="psc-label">Total Hours</div>
  </div>
  <div class="profile-stat-card blue">
    <i class="fa fa-calendar-check"></i>
    <div class="psc-num">92%</div>
    <div class="psc-label">Attendance Rate</div>
  </div>
  <div class="profile-stat-card yellow">
    <i class="fa fa-clock-rotate-left"></i>
    <div class="psc-num">2</div>
    <div class="psc-label">Late Arrivals</div>
  </div>
  <div class="profile-stat-card red">
    <i class="fa fa-user-xmark"></i>
    <div class="psc-num">1</div>
    <div class="psc-label">Absences</div>
  </div>
</div>

<!-- Stipend Eligibility Card -->
<div class="card stipend-card mt-24">
  <div class="stipend-left">
    <div class="stipend-icon"><i class="fa fa-dollar-sign"></i></div>
    <div>
      <h3>Stipend Status</h3>
      <p>Based on attendance rules configured by admin</p>
    </div>
  </div>
  <div class="stipend-right">
    <div class="stipend-meter">
      <div class="meter-bar" style="width: 92%"></div>
    </div>
    <div class="stipend-details">
      <span class="green-text">✓ Attendance: 92% (min 85%)</span>
      <span class="green-text">✓ Lates: 2 (max 3)</span>
      <span class="green-text">✓ Absences: 1 (max 2)</span>
    </div>
    <span class="badge badge-present badge-lg">ELIGIBLE</span>
  </div>
</div>

<!-- Attendance History -->
<div class="card mt-24">
  <div class="card-header">
    <h3><i class="fa fa-history"></i> Attendance History</h3>
    <div class="filter-row">
      <select class="select-sm" onchange="filterRecords(this.value)">
        <option>This Month</option>
        <option>Last Month</option>
        <option>All Time</option>
      </select>
    </div>
  </div>
  <div class="table-wrap">
    <table class="cd-table">
      <thead>
        <tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`
  return shell('My Profile', body, 'student')
}

// ═══════════════════════════════════════════════════════════════════
// REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════
function reportsPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-chart-bar"></i> Reports &amp; Export</h2>
    <p class="page-sub">Generate attendance reports and export data</p>
  </div>
  <div class="header-actions">
    <button class="btn-smartbuild" onclick="openSmartBuild()">
      <i class="fa fa-wand-magic-sparkles"></i> Smart Build
      <span class="sb-badge">AI</span>
    </button>
  </div>
</div>

<!-- ══ SMART BUILD MODAL (ReportIntelligenceService) ══════════════ -->
<div class="modal-overlay" id="smartBuildModal" style="display:none">
  <div class="modal modal-wide">
    <div class="modal-header sb-modal-header">
      <div class="sb-modal-title">
        <i class="fa fa-wand-magic-sparkles sb-icon-pulse"></i>
        <div>
          <h3>Smart Build</h3>
          <p class="sb-subtitle">AI-assisted report generation</p>
        </div>
      </div>
      <button class="modal-close" onclick="closeSmartBuild()"><i class="fa fa-xmark"></i></button>
    </div>

    <!-- Step 1: Configure -->
    <div id="sbStep1" class="sb-step">
      <div class="sb-step-label"><span class="sb-step-num">1</span> Configure Data Sources</div>
      <div class="sb-sources-grid">
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcAttendance" checked/>
          <i class="fa fa-calendar-check"></i> Attendance Records
        </label>
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcClockin" checked/>
          <i class="fa fa-clock"></i> Clock-In Verification Data
        </label>
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcActivity" checked/>
          <i class="fa fa-chart-line"></i> Student Activity Logs
        </label>
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcGeo" checked/>
          <i class="fa fa-map-location-dot"></i> Geofence Compliance Stats
        </label>
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcStipend" checked/>
          <i class="fa fa-dollar-sign"></i> Stipend Eligibility
        </label>
        <label class="sb-source-check">
          <input type="checkbox" id="sbSrcLate"/>
          <i class="fa fa-triangle-exclamation"></i> Late Arrival Distribution
        </label>
      </div>
      <div class="sb-date-row">
        <div class="form-group">
          <label><i class="fa fa-calendar"></i> Date Range</label>
          <div class="date-range">
            <input type="date" class="form-control" id="sbStartDate"/>
            <span>to</span>
            <input type="date" class="form-control" id="sbEndDate"/>
          </div>
        </div>
        <div class="form-group">
          <label><i class="fa fa-users"></i> Scope</label>
          <select class="form-control" id="sbScope">
            <option value="all">All Students</option>
            <option value="cohort2024">Cohort 2024</option>
            <option value="eligible">Stipend Eligible Only</option>
            <option value="atrisk">At-Risk Only</option>
          </select>
        </div>
        <div class="form-group">
          <label><i class="fa fa-brain"></i> AI Analysis Depth</label>
          <select class="form-control" id="sbDepth">
            <option value="standard">Standard (fast)</option>
            <option value="deep">Deep Analysis</option>
            <option value="summary">Executive Summary</option>
          </select>
        </div>
      </div>
      <div class="sb-hint">
        <i class="fa fa-circle-info"></i>
        Smart Build will analyze selected data sources and automatically construct an optimized report structure with insights.
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeSmartBuild()">Cancel</button>
        <button class="btn-primary" onclick="runSmartBuild()">
          <i class="fa fa-wand-magic-sparkles"></i> Analyze &amp; Build
        </button>
      </div>
    </div>

    <!-- Step 2: AI Processing -->
    <div id="sbStep2" class="sb-step" style="display:none">
      <div class="sb-processing">
        <div class="sb-process-ring"></div>
        <div class="sb-process-text">
          <strong id="sbProcessTitle">Analyzing data sources…</strong>
          <p id="sbProcessSub">ReportIntelligenceService is scanning your attendance data</p>
        </div>
      </div>
      <div class="sb-progress-steps" id="sbProgressSteps">
        <div class="sb-prog-step" id="sbprog-1"><i class="fa fa-spinner fa-spin"></i> Loading data sources</div>
        <div class="sb-prog-step pending" id="sbprog-2"><i class="fa fa-circle"></i> Analyzing attendance patterns</div>
        <div class="sb-prog-step pending" id="sbprog-3"><i class="fa fa-circle"></i> Detecting trends &amp; anomalies</div>
        <div class="sb-prog-step pending" id="sbprog-4"><i class="fa fa-circle"></i> Generating report blueprint</div>
        <div class="sb-prog-step pending" id="sbprog-5"><i class="fa fa-circle"></i> Constructing report sections</div>
      </div>
    </div>

    <!-- Step 3: Blueprint Result -->
    <div id="sbStep3" class="sb-step" style="display:none">
      <div class="sb-result-header">
        <i class="fa fa-circle-check sb-result-icon"></i>
        <div>
          <strong>Smart Build Complete</strong>
          <p id="sbResultSub">AI generated an optimized report with 5 sections</p>
        </div>
      </div>
      <div id="sbBlueprint" class="sb-blueprint"></div>
      <div class="sb-insights-box" id="sbInsights"></div>
      <div class="modal-footer sb-result-footer">
        <button class="btn-secondary" onclick="sbGoBack()"><i class="fa fa-arrow-left"></i> Reconfigure</button>
        <button class="btn-secondary" onclick="sbExportCSV()"><i class="fa fa-file-csv"></i> Export CSV</button>
        <button class="btn-primary" onclick="sbApplyToBuilder()"><i class="fa fa-check"></i> Apply to Report Builder</button>
      </div>
    </div>

    <!-- Fallback: Manual mode if AI fails -->
    <div id="sbFallback" class="sb-step" style="display:none">
      <div class="sb-fallback-msg">
        <i class="fa fa-triangle-exclamation"></i>
        <strong>Smart Build Unavailable</strong>
        <p>AI analysis could not complete. Falling back to manual report generation with recommended settings pre-filled.</p>
        <button class="btn-primary mt-16" onclick="sbApplyFallback()"><i class="fa fa-file-export"></i> Use Manual Builder</button>
      </div>
    </div>
  </div>
</div>

<!-- Report Builder -->
<div class="card report-builder">
  <h3><i class="fa fa-filter"></i> Build Report</h3>
  <div class="report-form">
    <div class="form-group">
      <label>Report Type</label>
      <select class="form-control" id="reportType" onchange="updateReportFields(this.value)">
        <option value="attendance">Attendance Report</option>
        <option value="hours">Hours Summary</option>
        <option value="stipend">Stipend Eligibility</option>
        <option value="late">Late Arrival Report</option>
        <option value="payroll">Payroll Export (QuickBooks)</option>
        <option value="hybrid">Hybrid Mode Analysis</option>
        <option value="fraud">Fraud Flag Report</option>
        <option value="virtual_physical">Virtual vs Physical Participation</option>
      </select>
    </div>
    <div class="form-group">
      <label>Date Range</label>
      <div class="date-range">
        <input type="date" class="form-control" id="startDate"/>
        <span>to</span>
        <input type="date" class="form-control" id="endDate"/>
      </div>
    </div>
    <div class="form-group">
      <label>Students</label>
      <select class="form-control" id="studentFilter">
        <option>All Students</option>
        <option>Cohort 2024</option>
        <option>Cohort 2023</option>
        <option>Stipend Eligible Only</option>
        <option>At-Risk Only</option>
      </select>
    </div>
    <div class="report-actions">
      <button class="btn-secondary" onclick="previewReport()"><i class="fa fa-eye"></i> Preview</button>
      <button class="btn-primary" onclick="generateReport()"><i class="fa fa-file-export"></i> Generate &amp; Export</button>
    </div>
  </div>
</div>

<!-- ReportIntelligenceService — Hybrid Attendance Metrics -->
<div class="card mt-24" id="hybridMetricsPanel">
  <div class="card-header">
    <h3><i class="fa fa-layer-group"></i> ReportIntelligenceService — Hybrid Metrics</h3>
    <div class="header-actions">
      <span class="badge badge-ai">Intelligence</span>
      <button class="btn-secondary btn-sm" onclick="loadHybridMetrics()">
        <i class="fa fa-rotate"></i> Refresh
      </button>
    </div>
  </div>

  <!-- Metric Cards Row -->
  <div class="hm-metric-row" id="hmMetricRow">
    <div class="hm-metric-card">
      <div class="hm-metric-icon green"><i class="fa fa-location-dot"></i></div>
      <div><div class="hm-metric-val" id="hmPhysicalPct">68%</div><div class="hm-metric-lbl">Physical</div></div>
    </div>
    <div class="hm-metric-card">
      <div class="hm-metric-icon blue"><i class="fa fa-video"></i></div>
      <div><div class="hm-metric-val" id="hmVirtualPct">32%</div><div class="hm-metric-lbl">Virtual</div></div>
    </div>
    <div class="hm-metric-card">
      <div class="hm-metric-icon yellow"><i class="fa fa-clock"></i></div>
      <div><div class="hm-metric-val" id="hmLateRate">14%</div><div class="hm-metric-lbl">Late Rate</div></div>
    </div>
    <div class="hm-metric-card">
      <div class="hm-metric-icon orange"><i class="fa fa-person-walking-arrow-right"></i></div>
      <div><div class="hm-metric-val" id="hmEarlyDept">8%</div><div class="hm-metric-lbl">Early Departures</div></div>
    </div>
    <div class="hm-metric-card">
      <div class="hm-metric-icon red"><i class="fa fa-shield-halved"></i></div>
      <div><div class="hm-metric-val" id="hmFraudFlags">3</div><div class="hm-metric-lbl">Fraud Flags</div></div>
    </div>
    <div class="hm-metric-card">
      <div class="hm-metric-icon purple"><i class="fa fa-chart-line"></i></div>
      <div><div class="hm-metric-val" id="hmTrend">+4%</div><div class="hm-metric-lbl">Attendance Trend</div></div>
    </div>
  </div>

  <!-- Trends Table -->
  <div class="table-wrap mt-16">
    <table class="cd-table cd-table-sm">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Physical</th>
          <th>Virtual</th>
          <th>Combined</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody id="hmTrendsBody">
        <tr>
          <td>Attendance Rate</td>
          <td><span class="green-text">91.2%</span></td>
          <td><span class="blue-text">87.5%</span></td>
          <td><span class="green-text">89.8%</span></td>
          <td><span class="green-text"><i class="fa fa-arrow-trend-up"></i> +3.2%</span></td>
        </tr>
        <tr>
          <td>Late Arrival Rate</td>
          <td><span class="yellow-text">12.4%</span></td>
          <td><span class="yellow-text">17.1%</span></td>
          <td><span class="yellow-text">14.3%</span></td>
          <td><span class="red-text"><i class="fa fa-arrow-trend-up"></i> +1.8%</span></td>
        </tr>
        <tr>
          <td>Stipend Eligible</td>
          <td><span class="green-text">5 / 8</span></td>
          <td><span class="blue-text">4 / 6</span></td>
          <td><span class="green-text">9 / 14</span></td>
          <td><span class="gray-text">—</span></td>
        </tr>
        <tr>
          <td>Fraud Flags</td>
          <td><span class="green-text">0</span></td>
          <td><span class="orange-text">3</span></td>
          <td><span class="orange-text">3</span></td>
          <td><span class="orange-text"><i class="fa fa-triangle-exclamation"></i> Review</span></td>
        </tr>
        <tr>
          <td>Avg Session Duration</td>
          <td><span>7h 52m</span></td>
          <td><span>6h 38m</span></td>
          <td><span>7h 22m</span></td>
          <td><span class="red-text"><i class="fa fa-arrow-trend-down"></i> -14m</span></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="hm-insight-row" id="hmInsightRow">
    <div class="hm-insight">
      <i class="fa fa-lightbulb" style="color:var(--yellow)"></i>
      <span>Virtual participants show a <strong>17% higher late rate</strong> — consider adjusting join reminders.</span>
    </div>
    <div class="hm-insight">
      <i class="fa fa-shield-halved" style="color:var(--orange)"></i>
      <span><strong>3 fraud flags</strong> detected in virtual sessions — review before finalizing stipend decisions.</span>
    </div>
  </div>
</div>

<!-- Export Formats -->
<div class="grid-3 mt-24">
  <div class="export-card" onclick="exportCSV()">
    <div class="export-icon green"><i class="fa fa-file-csv"></i></div>
    <h4>Export CSV</h4>
    <p>Download attendance data as CSV file for spreadsheets</p>
    <button class="btn-export-sm">Download CSV</button>
  </div>
  <div class="export-card" onclick="exportSheets()">
    <div class="export-icon blue"><i class="fa fa-table"></i></div>
    <h4>Google Sheets</h4>
    <p>Send data directly to your connected Google Sheet</p>
    <button class="btn-export-sm">Send to Sheets</button>
  </div>
  <div class="export-card" onclick="exportQB()">
    <div class="export-icon purple"><i class="fa fa-bolt"></i></div>
    <h4>QuickBooks</h4>
    <p>Sync payroll-ready entries to QuickBooks via AI</p>
    <button class="btn-export-sm">Sync to QB</button>
  </div>
</div>

<!-- Stipend Report Preview -->
<div class="card mt-24" id="reportPreview">
  <div class="card-header">
    <h3><i class="fa fa-table"></i> Stipend Eligibility Report — March 2025</h3>
    <div class="header-actions">
      <button class="btn-secondary btn-sm" onclick="exportCSV()"><i class="fa fa-download"></i> CSV</button>
      <button class="btn-primary btn-sm" onclick="exportQB()"><i class="fa fa-bolt"></i> QuickBooks</button>
    </div>
  </div>
  <div class="table-wrap">
    <table class="cd-table">
      <thead>
        <tr><th>Student</th><th>Hours</th><th>Attendance%</th><th>Lates</th><th>Absences</th><th>Stipend Status</th></tr>
      </thead>
      <tbody>
        ${[
          { name: 'Alex Johnson', hrs: '156.5', pct: '92', late: 2, abs: 1, status: 'eligible' },
          { name: 'Liam Chen', hrs: '168.0', pct: '100', late: 0, abs: 0, status: 'eligible' },
          { name: 'Marcus Thompson', hrs: '162.5', pct: '98', late: 1, abs: 0, status: 'eligible' },
          { name: 'Maria Garcia', hrs: '140.0', pct: '82', late: 4, abs: 2, status: 'ineligible' },
          { name: 'Priya Patel', hrs: '145.0', pct: '86', late: 2, abs: 3, status: 'at-risk' },
          { name: 'DeShawn Williams', hrs: '158.0', pct: '93', late: 1, abs: 1, status: 'eligible' },
          { name: 'Aaliyah Brown', hrs: '138.0', pct: '80', late: 5, abs: 2, status: 'ineligible' },
          { name: 'Sofia Rodriguez', hrs: '150.0', pct: '87', late: 2, abs: 2, status: 'at-risk' },
        ].map(s => `
        <tr>
          <td><div class="student-cell"><div class="avatar sm">${s.name.split(' ').map(n => n[0]).join('')}</div><span>${s.name}</span></div></td>
          <td>${s.hrs}h</td>
          <td><span class="${parseFloat(s.pct) >= 90 ? 'green-text' : parseFloat(s.pct) >= 85 ? 'yellow-text' : 'red-text'}">${s.pct}%</span></td>
          <td><span class="${s.late >= 3 ? 'red-text' : s.late >= 2 ? 'yellow-text' : 'green-text'}">${s.late}</span></td>
          <td><span class="${s.abs >= 3 ? 'red-text' : s.abs >= 2 ? 'yellow-text' : 'green-text'}">${s.abs}</span></td>
          <td><span class="badge badge-${s.status}">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>`
  return shell('Reports', body, 'admin')
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════
function settingsPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-gear"></i> System Settings</h2>
    <p class="page-sub">Configure late thresholds, alerts, and integrations</p>
  </div>
  <button class="btn-primary" onclick="saveSettings()"><i class="fa fa-save"></i> Save All Changes</button>
</div>

<div class="settings-grid">
  <!-- Attendance Rules -->
  <div class="card settings-section">
    <div class="settings-section-header">
      <i class="fa fa-clock settings-icon purple"></i>
      <h3>Attendance Rules</h3>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Late Threshold</strong>
        <p>Minutes after shift start before marked "Late"</p>
      </div>
      <div class="setting-control">
        <input type="number" class="num-input" value="10" min="1" max="60" id="lateThreshold"/> min
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Shift Start Time</strong>
        <p>Default shift start time for late calculation</p>
      </div>
      <div class="setting-control">
        <input type="time" class="form-control sm" value="09:00" id="shiftStart"/>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Shift End Time</strong>
        <p>Default shift end time</p>
      </div>
      <div class="setting-control">
        <input type="time" class="form-control sm" value="17:00" id="shiftEnd"/>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>GPS Verification</strong>
        <p>Require location check on clock-in</p>
      </div>
      <div class="setting-control">
        <label class="toggle"><input type="checkbox" checked id="gpsRequired"/><span class="slider"></span></label>
      </div>
    </div>
  </div>

  <!-- Stipend Rules -->
  <div class="card settings-section">
    <div class="settings-section-header">
      <i class="fa fa-dollar-sign settings-icon green"></i>
      <h3>Stipend Eligibility Rules</h3>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Minimum Attendance %</strong>
        <p>Required attendance percentage for stipend</p>
      </div>
      <div class="setting-control">
        <input type="number" class="num-input" value="85" min="50" max="100" id="minAttendance"/>%
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Max Late Arrivals</strong>
        <p>Maximum lates allowed per month</p>
      </div>
      <div class="setting-control">
        <input type="number" class="num-input" value="3" min="0" max="20" id="maxLates"/>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Max Absences</strong>
        <p>Maximum absences allowed per month</p>
      </div>
      <div class="setting-control">
        <input type="number" class="num-input" value="2" min="0" max="20" id="maxAbsences"/>
      </div>
    </div>
  </div>

  <!-- Email Alerts -->
  <div class="card settings-section">
    <div class="settings-section-header">
      <i class="fa fa-bell settings-icon orange"></i>
      <h3>Automatic Email Alerts</h3>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Late Alert Trigger</strong>
        <p>Send alert after this many late arrivals</p>
      </div>
      <div class="setting-control">
        <input type="number" class="num-input" value="3" min="1" max="10" id="lateAlertAt"/> lates
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Absence Alert</strong>
        <p>Alert admin when student is absent</p>
      </div>
      <div class="setting-control">
        <label class="toggle"><input type="checkbox" checked id="absenceAlert"/><span class="slider"></span></label>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Stipend Risk Alert</strong>
        <p>Alert when student's stipend eligibility is at risk</p>
      </div>
      <div class="setting-control">
        <label class="toggle"><input type="checkbox" checked id="stipendAlert"/><span class="slider"></span></label>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Admin Email</strong>
        <p>Email address to receive all alerts</p>
      </div>
      <div class="setting-control wide">
        <input type="email" class="form-control" value="cristina@codedifferently.org" id="adminEmail"/>
      </div>
    </div>
  </div>

  <!-- QuickBooks Integration -->
  <div class="card settings-section">
    <div class="settings-section-header">
      <i class="fa fa-bolt settings-icon purple"></i>
      <h3>AI &amp; QuickBooks Integration</h3>
    </div>

    <!-- AI API Key Setup -->
    <div class="ai-key-setup">
      <div class="ai-key-header">
        <i class="fa fa-robot"></i>
        <div>
          <strong>OpenAI API Key</strong>
          <p>Required to enable AI payroll review before QuickBooks sync</p>
        </div>
        <div id="aiKeyStatus" class="ai-key-status">
          <span style="color:var(--yellow)"><i class="fa fa-triangle-exclamation"></i> No key configured</span>
        </div>
      </div>
      <div class="ai-key-fields">
        <div class="form-group">
          <label><i class="fa fa-key"></i> API Key</label>
          <div class="pw-wrap">
            <input type="password" id="aiApiKey" class="form-control" placeholder="sk-... or gsk-..."/>
            <button type="button" class="pw-toggle" onclick="toggleAIKeyVis()"><i class="fa fa-eye" id="aiKeyEye"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label><i class="fa fa-link"></i> Base URL <span style="color:var(--gray400);font-weight:400">(optional)</span></label>
          <input type="text" id="aiBaseUrl" class="form-control" placeholder="https://www.genspark.ai/api/llm_proxy/v1"/>
        </div>
        <div class="ai-key-actions">
          <button class="btn-qb" onclick="saveAIKey()"><i class="fa fa-save"></i> Save Key</button>
          <button class="btn-qb-outline" onclick="testAIKey()"><i class="fa fa-plug"></i> Test Connection</button>
        </div>
        <p class="ai-key-note"><i class="fa fa-shield-halved"></i> Key is stored locally in your browser only — never sent to any server except the AI provider per request.</p>
      </div>
    </div>

    <div class="qb-connect-status">
      <div class="qb-status-dot connected"></div>
      <span>Connected to QuickBooks Online</span>
      <span class="qb-account">Account: Code Differently Inc.</span>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Auto-Sync Payroll</strong>
        <p>Automatically push payroll entries after attendance is verified</p>
      </div>
      <div class="setting-control">
        <label class="toggle"><input type="checkbox" checked id="autoSync"/><span class="slider"></span></label>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>AI Review Before Sync</strong>
        <p>AI checks entries for anomalies before sending to QB</p>
      </div>
      <div class="setting-control">
        <label class="toggle"><input type="checkbox" checked id="aiReview"/><span class="slider"></span></label>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Payroll Item Code</strong>
        <p>QuickBooks payroll item for stipend payments</p>
      </div>
      <div class="setting-control wide">
        <input type="text" class="form-control" value="STUDENT-STIPEND-2024" id="payrollCode"/>
      </div>
    </div>
    <div class="setting-row">
      <div class="setting-label">
        <strong>Sync Frequency</strong>
        <p>How often to sync data to QuickBooks</p>
      </div>
      <div class="setting-control">
        <select class="form-control sm" id="syncFreq">
          <option>Daily</option>
          <option selected>After Each Session</option>
          <option>Weekly</option>
          <option>Manual Only</option>
        </select>
      </div>
    </div>
    <div class="qb-api-info">
      <h4><i class="fa fa-code"></i> API Endpoints</h4>
      <div class="api-list">
        <div class="api-item">
          <span class="api-method get">GET</span>
          <code>/api/qb/auth/connect</code>
          <span class="api-desc">OAuth2 connect to QuickBooks</span>
        </div>
        <div class="api-item">
          <span class="api-method post">POST</span>
          <code>/api/qb/payroll/sync</code>
          <span class="api-desc">Push payroll entries to QB</span>
        </div>
        <div class="api-item">
          <span class="api-method get">GET</span>
          <code>/api/qb/employees</code>
          <span class="api-desc">Fetch QB employee list</span>
        </div>
        <div class="api-item">
          <span class="api-method post">POST</span>
          <code>/api/qb/timeactivity</code>
          <span class="api-desc">Log time activity entries</span>
        </div>
        <div class="api-item">
          <span class="api-method get">GET</span>
          <code>/api/ai/review-payroll</code>
          <span class="api-desc">AI anomaly check before sync</span>
        </div>
      </div>
    </div>
    <div class="qb-actions mt-16">
      <button class="btn-qb" onclick="testQBConnection()"><i class="fa fa-plug"></i> Test Connection</button>
      <button class="btn-qb-outline" onclick="disconnectQB()"><i class="fa fa-unlink"></i> Disconnect</button>
    </div>
  </div>
</div>

<!-- Save Toast -->
<div class="toast" id="saveToast" style="display:none">
  <i class="fa fa-circle-check"></i> Settings saved successfully!
</div>`
  return shell('Settings', body, 'admin')
}

// ═══════════════════════════════════════════════════════════════════
// GEOFENCE CONFIGURATION PAGE  (Admin Only)
// ═══════════════════════════════════════════════════════════════════
function geofencePage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-map-location-dot"></i> Geofence Configuration</h2>
    <p class="page-sub">Define the official school location and attendance radius — Admin only</p>
  </div>
  <div class="header-actions">
    <button class="btn-secondary" onclick="testCurrentLocation()"><i class="fa fa-crosshairs"></i> Test My Location</button>
    <button class="btn-primary" onclick="saveGeofence()"><i class="fa fa-save"></i> Save Geofence</button>
  </div>
</div>

<!-- Status Bar -->
<div class="geo-config-status" id="geoConfigStatus">
  <div class="geo-status-item active">
    <i class="fa fa-circle-check"></i>
    <span>Geofence Active</span>
  </div>
  <div class="geo-status-item" id="geoStatusDist">
    <i class="fa fa-ruler"></i>
    <span id="geoStatusDistVal">Loading config…</span>
  </div>
  <div class="geo-status-item" id="geoStatusWifi">
    <i class="fa fa-wifi"></i>
    <span id="geoStatusWifiVal">—</span>
  </div>
  <div class="geo-status-item">
    <i class="fa fa-clock"></i>
    <span id="geoStatusUpdated">—</span>
  </div>
</div>

<div class="geo-config-grid">
  <!-- Left: Config Form -->
  <div class="card geo-form-card">
    <div class="card-header">
      <h3><i class="fa fa-sliders"></i> Geofence Settings</h3>
    </div>

    <div class="geo-form">
      <!-- ── Address Search (Bug Fix 2) ───────────────────────── -->
      <div class="form-group geo-address-group">
        <label><i class="fa fa-magnifying-glass-location"></i> Search Address or School Name</label>
        <div class="geo-search-row">
          <input type="text" id="geoAddressInput" class="form-control"
            placeholder="e.g. 100 West 10th Street, Wilmington, DE"
            onkeydown="if(event.key==='Enter'){event.preventDefault();geocodeAddress();}"/>
          <button class="btn-primary btn-sm" onclick="geocodeAddress()">
            <i class="fa fa-search"></i> Find
          </button>
        </div>
        <div id="geocodeResults" class="geocode-results" style="display:none"></div>
        <div id="geocodeStatus" class="geocode-status" style="display:none"></div>
      </div>

      <div class="form-group">
        <label><i class="fa fa-school"></i> School / Campus Name</label>
        <input type="text" id="geoName" class="form-control" value="Code Differently Campus"/>
      </div>

      <div class="geo-coord-row">
        <div class="form-group">
          <label><i class="fa fa-location-dot"></i> Latitude</label>
          <input type="number" id="geoLat" class="form-control" value="39.7392" step="0.0001" min="-90" max="90"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-location-dot"></i> Longitude</label>
          <input type="number" id="geoLon" class="form-control" value="-75.5398" step="0.0001" min="-180" max="180"/>
        </div>
      </div>

      <div class="form-group">
        <label>
          <i class="fa fa-circle-dot"></i>
          Allowed Radius — <strong><span id="radiusDisplay">60</span> meters</strong>
          <span class="label-hint">Drag the map circle to adjust visually</span>
        </label>
        <input type="range" id="geoRadius" class="geo-slider" min="20" max="300" value="60"
          oninput="document.getElementById('radiusDisplay').textContent=this.value; updateRadiusCircle(null,null,parseInt(this.value))"/>
        <div class="slider-labels">
          <span>20m (tight)</span>
          <span>150m</span>
          <span>300m (loose)</span>
        </div>
      </div>

      <div class="form-group">
        <label>
          <i class="fa fa-crosshairs"></i>
          Max GPS Accuracy — <strong><span id="accuracyDisplay">40</span> meters</strong>
        </label>
        <input type="range" id="geoAccuracy" class="geo-slider" min="10" max="100" value="40"
          oninput="document.getElementById('accuracyDisplay').textContent=this.value"/>
        <div class="slider-labels"><span>10m (strict)</span><span>50m</span><span>100m (lenient)</span></div>
      </div>

      <div class="form-group">
        <label><i class="fa fa-wifi"></i> Authorized WiFi Networks <span class="label-hint">(one per line)</span></label>
        <textarea id="geoWifi" class="form-control geo-textarea"
          placeholder="CodeDifferently-WiFi&#10;CD-Staff&#10;CD-Students">CodeDifferently-WiFi
CD-Staff
CD-Students</textarea>
      </div>

      <div class="geo-preset-row">
        <span class="preset-label">Quick Presets:</span>
        <button class="btn-preset" onclick="applyPreset(40)">Tight (40m)</button>
        <button class="btn-preset active" onclick="applyPreset(60)">Standard (60m)</button>
        <button class="btn-preset" onclick="applyPreset(100)">Wide (100m)</button>
      </div>

      <button class="btn-primary btn-full mt-16" onclick="saveGeofence()">
        <i class="fa fa-save"></i> Save Geofence Configuration
      </button>
    </div>
  </div>

  <!-- Right: Map + Live Test -->
  <div class="geo-right-col">
    <!-- Interactive Map -->
    <div class="card geo-map-card">
      <div class="card-header">
        <h3><i class="fa fa-map"></i> Campus Map</h3>
        <div class="header-actions">
          <button class="btn-secondary btn-sm" onclick="dropPinHere()">
            <i class="fa fa-map-pin"></i> Drop Pin Here
          </button>
          <button class="btn-secondary btn-sm" onclick="useMyLocation()">
            <i class="fa fa-crosshairs"></i> Use My Location
          </button>
        </div>
      </div>
      <div id="geoMap" class="geo-map-canvas">
        <div class="geo-map-loading" id="geoMapLoading">
          <i class="fa fa-spinner fa-spin"></i>
          <p>Loading map…</p>
        </div>
        <!-- Leaflet map rendered here by JS -->
      </div>
      <p class="geo-map-hint"><i class="fa fa-hand-pointer"></i> Click anywhere on the map to move the school pin</p>
    </div>

    <!-- Live Location Test Panel -->
    <div class="card geo-test-card">
      <div class="card-header">
        <h3><i class="fa fa-vial"></i> Live Location Test</h3>
      </div>
      <div id="geoTestResult" class="geo-test-idle">
        <i class="fa fa-satellite-dish"></i>
        <p>Click "Test My Location" to verify you are within the geofence</p>
      </div>
      <div class="geo-test-checks" id="geoTestChecks" style="display:none">
        <div class="geo-tc" id="gtc-gps">
          <i class="fa fa-satellite-dish"></i>
          <span>GPS</span>
          <strong id="gtc-gps-val">—</strong>
          <i class="fa fa-spinner fa-spin gtc-spin" id="gtc-gps-ic"></i>
        </div>
        <div class="geo-tc" id="gtc-dist">
          <i class="fa fa-ruler"></i>
          <span>Distance</span>
          <strong id="gtc-dist-val">—</strong>
          <i class="fa fa-spinner fa-spin gtc-spin" id="gtc-dist-ic"></i>
        </div>
        <div class="geo-tc" id="gtc-acc">
          <i class="fa fa-crosshairs"></i>
          <span>Accuracy</span>
          <strong id="gtc-acc-val">—</strong>
          <i class="fa fa-spinner fa-spin gtc-spin" id="gtc-acc-ic"></i>
        </div>
        <div class="geo-tc" id="gtc-wifi">
          <i class="fa fa-wifi"></i>
          <span>WiFi</span>
          <strong id="gtc-wifi-val">—</strong>
          <i class="fa fa-spinner fa-spin gtc-spin" id="gtc-wifi-ic"></i>
        </div>
      </div>
      <button class="btn-primary btn-full" onclick="testCurrentLocation()" style="margin-top:14px">
        <i class="fa fa-play"></i> Run Location Test
      </button>
    </div>
  </div>
</div>

<!-- Verification Audit Log -->
<div class="card mt-24">
  <div class="card-header">
    <h3><i class="fa fa-shield-halved"></i> Verification Audit Log</h3>
    <div class="header-actions">
      <select class="select-sm" onchange="filterAuditLog(this.value)">
        <option value="">All Students</option>
        <option value="EMP001">Alex Johnson</option>
        <option value="EMP002">Maria Garcia</option>
        <option value="EMP003">DeShawn Williams</option>
      </select>
      <button class="btn-secondary btn-sm" onclick="loadAuditLog()"><i class="fa fa-refresh"></i> Refresh</button>
    </div>
  </div>
  <div class="audit-stats-row" id="auditStatsRow">
    <div class="audit-stat green"><i class="fa fa-circle-check"></i><span id="ast-full">—</span><small>Full</small></div>
    <div class="audit-stat yellow"><i class="fa fa-triangle-exclamation"></i><span id="ast-partial">—</span><small>Partial</small></div>
    <div class="audit-stat red"><i class="fa fa-circle-xmark"></i><span id="ast-failed">—</span><small>Failed</small></div>
    <div class="audit-stat blue"><i class="fa fa-ruler"></i><span id="ast-avg">—</span><small>Avg Distance</small></div>
  </div>
  <div class="table-wrap">
    <table class="cd-table" id="auditTable">
      <thead>
        <tr>
          <th>Student ID</th>
          <th>Time</th>
          <th>Distance</th>
          <th>GPS Acc.</th>
          <th>WiFi</th>
          <th>Status</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody id="auditTableBody">
        <tr><td colspan="7" class="text-center" style="color:var(--gray400);padding:24px">
          No verifications yet — students clock in to generate audit data
        </td></tr>
      </tbody>
    </table>
  </div>
</div>`
  return shell('Geofence Config', body, 'admin')
}

// ═══════════════════════════════════════════════════════════════════
// HYBRID INTELLIGENCE PLATFORM PAGE
// ═══════════════════════════════════════════════════════════════════
function hybridPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-layer-group"></i> Hybrid Attendance Platform</h2>
    <p class="page-sub">Manage physical, virtual, and hybrid attendance sessions intelligently</p>
  </div>
  <div class="header-actions">
    <button class="btn-primary" onclick="openNewSession()">
      <i class="fa fa-plus"></i> New Session
    </button>
  </div>
</div>

<!-- ── Attendance Mode Controller ─────────────────────────────── -->
<div class="hybrid-mode-controller">
  <div class="amc-title"><i class="fa fa-sliders"></i> Attendance Mode Controller</div>
  <div class="amc-modes">
    <button class="amc-mode active" id="mode-physical" onclick="setMode('physical',this)">
      <div class="amc-mode-icon"><i class="fa fa-location-dot"></i></div>
      <strong>Physical</strong>
      <small>GPS Geofence Verification</small>
    </button>
    <button class="amc-mode" id="mode-virtual" onclick="setMode('virtual',this)">
      <div class="amc-mode-icon"><i class="fa fa-video"></i></div>
      <strong>Virtual</strong>
      <small>Meeting Platform Verification</small>
    </button>
    <button class="amc-mode" id="mode-hybrid" onclick="setMode('hybrid',this)">
      <div class="amc-mode-icon hybrid-gradient"><i class="fa fa-layer-group"></i></div>
      <strong>Hybrid</strong>
      <small>GPS + Virtual Combined</small>
    </button>
  </div>
  <div class="amc-status" id="amcStatus">
    <i class="fa fa-circle-check" style="color:var(--green)"></i>
    <span>Physical mode active — geofence verification enabled</span>
  </div>
</div>

<!-- ── Live Session Stats Bar ─────────────────────────────────── -->
<div class="hybrid-stats-bar" id="hybridStatsBar">
  <div class="hsb-item">
    <div class="hsb-icon green"><i class="fa fa-location-dot"></i></div>
    <div><span class="hsb-num" id="hsbPhysical">5</span><small>Physical</small></div>
  </div>
  <div class="hsb-item">
    <div class="hsb-icon blue"><i class="fa fa-video"></i></div>
    <div><span class="hsb-num" id="hsbVirtual">3</span><small>Virtual</small></div>
  </div>
  <div class="hsb-item">
    <div class="hsb-icon green"><i class="fa fa-circle-check"></i></div>
    <div><span class="hsb-num" id="hsbPresent">8</span><small>Present</small></div>
  </div>
  <div class="hsb-item">
    <div class="hsb-icon yellow"><i class="fa fa-clock"></i></div>
    <div><span class="hsb-num" id="hsbLate">2</span><small>Late</small></div>
  </div>
  <div class="hsb-item">
    <div class="hsb-icon red"><i class="fa fa-circle-xmark"></i></div>
    <div><span class="hsb-num" id="hsbAbsent">1</span><small>Absent</small></div>
  </div>
  <div class="hsb-item">
    <div class="hsb-icon orange"><i class="fa fa-triangle-exclamation"></i></div>
    <div><span class="hsb-num" id="hsbFlagged">1</span><small>Flagged</small></div>
  </div>
  <div class="hsb-checkpoint" id="hsbCheckpoint">
    <i class="fa fa-flag-checkered"></i>
    <span>Checkpoint in <strong id="hsbCheckpointTime">—</strong></span>
  </div>
</div>

<!-- ── Main Grid ──────────────────────────────────────────────── -->
<div class="hybrid-main-grid">

  <!-- LEFT: Virtual Presence Panel -->
  <div class="card hybrid-panel">
    <div class="card-header">
      <h3><i class="fa fa-video"></i> VirtualPresenceService</h3>
      <span class="badge badge-ai">Live</span>
    </div>

    <!-- Platform selector -->
    <div class="vps-platforms">
      <button class="vps-plat active" id="plat-gmeet" onclick="selectPlatform('google_meet',this)">
        <i class="fa fa-video"></i> Google Meet
      </button>
      <button class="vps-plat" id="plat-zoom" onclick="selectPlatform('zoom',this)" disabled>
        <i class="fa fa-video"></i> Zoom <span class="soon-tag">Soon</span>
      </button>
      <button class="vps-plat" id="plat-teams" onclick="selectPlatform('teams',this)" disabled>
        <i class="fa fa-tv"></i> Teams <span class="soon-tag">Soon</span>
      </button>
    </div>

    <!-- Google Meet configuration -->
    <div class="vps-config" id="vpsMeetConfig">
      <div class="form-group">
        <label><i class="fa fa-link"></i> Meeting Link or ID</label>
        <input type="text" class="form-control" id="meetLink" placeholder="https://meet.google.com/abc-defg-hij"/>
      </div>
      <div class="form-group">
        <label><i class="fa fa-clock"></i> Min Presence Duration (minutes)</label>
        <input type="number" class="form-control" id="minDuration" value="15" min="5" max="60"/>
      </div>
      <button class="btn-primary btn-full" onclick="runVirtualVerification()">
        <i class="fa fa-satellite-dish"></i> Fetch &amp; Verify Participants
      </button>
      <div class="vps-google-note">
        <i class="fa fa-circle-info"></i>
        Production: connects to Google Admin SDK Reports API.
        <a href="https://developers.google.com/admin-sdk/reports/v1/guides/meet" target="_blank">API Docs</a>
      </div>
    </div>

    <!-- Results -->
    <div id="vpsResults" style="display:none">
      <div class="vps-result-header">
        <strong id="vpsResultTitle">Verification Complete</strong>
        <span class="badge badge-present" id="vpsResultBadge"></span>
      </div>
      <div class="table-wrap">
        <table class="cd-table cd-table-sm" id="vpsTable">
          <thead><tr><th>Student</th><th>Join</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody id="vpsTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- RIGHT: AI Intelligence Engine -->
  <div class="card hybrid-panel">
    <div class="card-header">
      <h3><i class="fa fa-brain"></i> AttendanceIntelligenceEngine</h3>
      <span class="badge badge-ai">AI</span>
    </div>

    <div class="aie-idle" id="aieIdle">
      <i class="fa fa-brain fa-2x" style="color:var(--purple);opacity:.6"></i>
      <p>Run virtual verification first, then click Analyze to get an AI attendance proposal.</p>
      <button class="btn-primary" onclick="runAIAnalysis()">
        <i class="fa fa-wand-magic-sparkles"></i> Analyze Attendance
      </button>
    </div>

    <div id="aieProcessing" style="display:none">
      <div class="sb-processing">
        <div class="sb-process-ring"></div>
        <div class="sb-process-text">
          <strong>AI analyzing attendance data…</strong>
          <p id="aieProcessStep">Loading datasets</p>
        </div>
      </div>
    </div>

    <!-- AI Proposal -->
    <div id="aieProposal" style="display:none">
      <div class="aie-proposal-banner" id="aieProposalBanner"></div>
      <div class="aie-summary-box" id="aieSummaryBox"></div>
      <div id="aieAnomalies" class="aie-anomalies"></div>
      <div class="aie-actions">
        <button class="btn-primary" onclick="confirmAttendance()">
          <i class="fa fa-circle-check"></i> Confirm Attendance
        </button>
        <button class="btn-secondary" onclick="modifyAttendance()">
          <i class="fa fa-pen"></i> Modify Records
        </button>
        <button class="btn-secondary" onclick="rerunVerification()">
          <i class="fa fa-rotate"></i> Re-run Verification
        </button>
      </div>
    </div>
  </div>
</div>

<!-- ── Fraud Detection Panel ──────────────────────────────────── -->
<div class="card mt-24" id="fraudPanel">
  <div class="card-header">
    <h3><i class="fa fa-shield-halved"></i> FraudDetectionService</h3>
    <div class="header-actions">
      <span class="badge" id="fraudBadge" style="display:none"></span>
      <button class="btn-secondary btn-sm" onclick="runFraudScan()">
        <i class="fa fa-magnifying-glass"></i> Scan Session
      </button>
    </div>
  </div>
  <div id="fraudIdle" class="fraud-idle">
    <i class="fa fa-shield-halved"></i>
    <p>Click "Scan Session" to run automated fraud detection on current attendance data.</p>
    <div class="fraud-detect-list">
      <span><i class="fa fa-check"></i> Short virtual sessions</span>
      <span><i class="fa fa-check"></i> Unmatched accounts</span>
      <span><i class="fa fa-check"></i> Repeat late patterns</span>
      <span><i class="fa fa-check"></i> Location spoofing signals</span>
    </div>
  </div>
  <div id="fraudResults" style="display:none">
    <div class="fraud-stats-row" id="fraudStatsRow"></div>
    <div class="table-wrap mt-12">
      <table class="cd-table cd-table-sm">
        <thead><tr><th>Student</th><th>Flag Type</th><th>Description</th><th>Severity</th><th>Action</th></tr></thead>
        <tbody id="fraudTableBody"></tbody>
      </table>
    </div>
    <p class="fraud-disclaimer"><i class="fa fa-circle-info"></i> Flags are for instructor review only — no automatic penalties are applied.</p>
  </div>
</div>

<!-- ── Merged Attendance Table ────────────────────────────────── -->
<div class="card mt-24">
  <div class="card-header">
    <h3><i class="fa fa-table-list"></i> Merged Attendance Record</h3>
    <div class="header-actions">
      <span class="badge badge-ai" id="mergeSourceBadge" style="display:none"></span>
      <button class="btn-secondary btn-sm" onclick="runMerge()"><i class="fa fa-code-merge"></i> Merge Datasets</button>
    </div>
  </div>
  <div class="table-wrap">
    <table class="cd-table" id="mergedTable">
      <thead><tr><th>Student</th><th>Mode</th><th>Status</th><th>Source</th><th>Verified</th></tr></thead>
      <tbody id="mergedTableBody">
        <tr><td colspan="5" class="text-center" style="color:var(--gray400);padding:24px">
          Run verification then click "Merge Datasets" to generate unified attendance record
        </td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ── Smart Attendance AI Assistant ──────────────────────────── -->
<div class="card mt-24" id="smartAssistantPanel">
  <div class="card-header">
    <h3><i class="fa fa-wand-magic-sparkles"></i> Smart Attendance AI Assistant</h3>
    <div class="header-actions">
      <span class="badge badge-ai" id="saaBadge" style="display:none"></span>
      <button class="btn-secondary btn-sm" onclick="toggleSmartAssistant()">
        <i class="fa fa-chevron-down" id="saaToggleIcon"></i>
      </button>
    </div>
  </div>

  <div id="saaBody">
    <!-- Input row -->
    <div class="saa-input-row">
      <input type="text" class="form-control" id="saaQuery"
        placeholder="Ask anything… e.g. 'Who is at risk of losing stipend?' or 'Summarize today's session'"
        onkeydown="if(event.key==='Enter')runSmartAssistant()"/>
      <button class="btn-primary" onclick="runSmartAssistant()">
        <i class="fa fa-paper-plane"></i> Ask AI
      </button>
    </div>

    <!-- Quick-action chips -->
    <div class="saa-chips">
      <button class="saa-chip" onclick="saaQuick('Summarize today\'s attendance')">
        <i class="fa fa-clipboard-list"></i> Session Summary
      </button>
      <button class="saa-chip" onclick="saaQuick('Which students are missing entries or have no clock-in today?')">
        <i class="fa fa-user-xmark"></i> Missing Entries
      </button>
      <button class="saa-chip" onclick="saaQuick('List all anomalies and flagged records with suggested corrections')">
        <i class="fa fa-triangle-exclamation"></i> Suggest Corrections
      </button>
      <button class="saa-chip" onclick="saaQuick('Who is at risk of losing their stipend based on current attendance?')">
        <i class="fa fa-circle-exclamation"></i> Stipend Risk
      </button>
      <button class="saa-chip" onclick="saaQuick('Compare virtual vs physical attendance participation rates')">
        <i class="fa fa-chart-bar"></i> Mode Comparison
      </button>
    </div>

    <!-- Conversation thread -->
    <div class="saa-thread" id="saaThread">
      <div class="saa-msg saa-msg-system">
        <div class="saa-avatar"><i class="fa fa-brain"></i></div>
        <div class="saa-bubble">
          <p>Hello! I'm your Smart Attendance AI Assistant. I can analyze attendance data, detect missing entries, suggest corrections, and generate summaries. All recommendations require your approval before any records are modified.</p>
          <small class="saa-time">Ready</small>
        </div>
      </div>
    </div>

    <!-- AI disclaimer -->
    <p class="saa-disclaimer">
      <i class="fa fa-circle-info"></i>
      Recommendations only — no records are modified without explicit instructor approval.
    </p>
  </div>
</div>

<!-- ── New Session Modal ──────────────────────────────────────── -->
<div class="modal-overlay" id="newSessionModal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3><i class="fa fa-plus"></i> Create New Session</h3>
      <button class="modal-close" onclick="closeModal('newSessionModal')"><i class="fa fa-xmark"></i></button>
    </div>
    <div style="padding:0 24px 8px">
      <div class="form-group">
        <label>Session Name / Class ID</label>
        <input type="text" class="form-control" id="nsClassId" placeholder="e.g. CD-2024-Web-Dev"/>
      </div>
      <div class="form-group">
        <label>Attendance Mode</label>
        <select class="form-control" id="nsMode">
          <option value="physical">Physical (GPS Geofence)</option>
          <option value="virtual">Virtual (Meeting Platform)</option>
          <option value="hybrid" selected>Hybrid (GPS + Virtual)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Virtual Meeting Link (optional)</label>
        <input type="text" class="form-control" id="nsVirtualLink" placeholder="https://meet.google.com/..."/>
      </div>
      <div class="geo-coord-row">
        <div class="form-group">
          <label>Duration (minutes)</label>
          <input type="number" class="form-control" id="nsDuration" value="480"/>
        </div>
        <div class="form-group">
          <label>Checkpoint (minutes)</label>
          <input type="number" class="form-control" id="nsCheckpoint" value="20"/>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal('newSessionModal')">Cancel</button>
      <button class="btn-primary" onclick="createSession()"><i class="fa fa-play"></i> Start Session</button>
    </div>
  </div>
</div>
`
  return shell('Hybrid Platform', body, 'instructor')
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN USER MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════════════════
function adminUsersPage(): string {
  const body = `
<div class="page-header">
  <div>
    <h2><i class="fa fa-users-gear"></i> Student Account Management</h2>
    <p class="page-sub">Add students, assign programs, generate login credentials</p>
  </div>
  <div class="header-actions">
    <button class="btn-secondary" onclick="exportStudentCSV()"><i class="fa fa-download"></i> Export List</button>
    <button class="btn-primary" onclick="openAddStudentModal()"><i class="fa fa-user-plus"></i> Add Student</button>
  </div>
</div>

<!-- Quick Stats -->
<div class="um-stats-row">
  <div class="um-stat-card">
    <div class="um-stat-icon purple"><i class="fa fa-users"></i></div>
    <div><div class="um-stat-num" id="umTotalCount">9</div><div class="um-stat-lbl">Total Students</div></div>
  </div>
  <div class="um-stat-card">
    <div class="um-stat-icon green"><i class="fa fa-circle-check"></i></div>
    <div><div class="um-stat-num" id="umActiveCount">8</div><div class="um-stat-lbl">Active</div></div>
  </div>
  <div class="um-stat-card">
    <div class="um-stat-icon yellow"><i class="fa fa-clock"></i></div>
    <div><div class="um-stat-num" id="umPendingCount">1</div><div class="um-stat-lbl">Pending First Login</div></div>
  </div>
  <div class="um-stat-card">
    <div class="um-stat-icon blue"><i class="fa fa-layer-group"></i></div>
    <div><div class="um-stat-num" id="umProgramCount">3</div><div class="um-stat-lbl">Programs</div></div>
  </div>
</div>

<!-- Search & Filter Bar -->
<div class="card mt-20">
  <div class="um-filter-bar">
    <div class="um-search-wrap">
      <i class="fa fa-search"></i>
      <input type="text" id="umSearch" class="um-search" placeholder="Search by name, email, or student ID…"
        oninput="filterStudentList()"/>
    </div>
    <select class="form-control um-filter-sel" id="umProgramFilter" onchange="filterStudentList()">
      <option value="">All Programs</option>
      <option value="Web Dev">Web Dev</option>
      <option value="Data">Data</option>
      <option value="Design">Design</option>
    </select>
    <select class="form-control um-filter-sel" id="umStatusFilter" onchange="filterStudentList()">
      <option value="">All Statuses</option>
      <option value="active">Active</option>
      <option value="pending">Pending</option>
      <option value="suspended">Suspended</option>
    </select>
    <select class="form-control um-filter-sel" id="umCohortFilter" onchange="filterStudentList()">
      <option value="">All Cohorts</option>
      <option value="2024">Cohort 2024</option>
      <option value="2023">Cohort 2023</option>
    </select>
  </div>

  <!-- Student Table -->
  <div class="table-wrap mt-12">
    <table class="cd-table" id="studentTable">
      <thead>
        <tr>
          <th>Student</th>
          <th>Student ID</th>
          <th>Program</th>
          <th>Cohort</th>
          <th>Enrolled</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="studentTableBody">
        <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray400)">
          <i class="fa fa-spinner fa-spin"></i> Loading students…
        </td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ── Add Student Modal ──────────────────────────────────────────── -->
<div class="modal-overlay" id="addStudentModal" style="display:none">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3><i class="fa fa-user-plus"></i> Add New Student</h3>
      <button class="modal-close" onclick="closeModal('addStudentModal')"><i class="fa fa-xmark"></i></button>
    </div>
    <div class="modal-body-scroll">
      <!-- Validation errors -->
      <div id="addStudentErrors" class="auth-error-banner" style="display:none"></div>

      <div class="um-form-grid">
        <div class="form-group">
          <label><i class="fa fa-user"></i> First Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="asFirstName" placeholder="e.g. Alex"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-user"></i> Last Name <span class="required">*</span></label>
          <input type="text" class="form-control" id="asLastName" placeholder="e.g. Johnson"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-envelope"></i> Email Address <span class="required">*</span></label>
          <input type="email" class="form-control" id="asEmail" placeholder="student@codedifferently.org"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-layer-group"></i> Program <span class="required">*</span></label>
          <select class="form-control" id="asProgram">
            <option value="">Select program…</option>
            <option value="Web Dev">Web Development</option>
            <option value="Data">Data Analytics</option>
            <option value="Design">UI/UX Design</option>
            <option value="DevOps">DevOps</option>
          </select>
        </div>
        <div class="form-group">
          <label><i class="fa fa-people-group"></i> Cohort <span class="required">*</span></label>
          <select class="form-control" id="asCohort">
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2023">2023</option>
          </select>
        </div>
        <div class="form-group">
          <label><i class="fa fa-calendar"></i> Enrollment Date</label>
          <input type="date" class="form-control" id="asEnrollDate"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-id-card"></i> Student ID <small style="color:var(--gray400)">(auto if blank)</small></label>
          <input type="text" class="form-control" id="asStudentId" placeholder="CD-2024-###"/>
        </div>
        <div class="form-group">
          <label><i class="fa fa-at"></i> Username <small style="color:var(--gray400)">(auto if blank)</small></label>
          <input type="text" class="form-control" id="asUsername" placeholder="first.last"/>
        </div>
      </div>

      <!-- Credentials Section -->
      <div class="um-credentials-section">
        <div class="um-cred-header">
          <i class="fa fa-key"></i>
          <strong>Login Credentials</strong>
        </div>
        <div class="um-cred-toggle">
          <label class="toggle-row">
            <input type="checkbox" id="asAutoGen" checked onchange="toggleCredMode()"/>
            <span class="toggle-switch"></span>
            <span>Auto-generate secure credentials</span>
          </label>
        </div>
        <div id="asManualCreds" style="display:none">
          <div class="form-group">
            <label><i class="fa fa-lock"></i> Temporary Password</label>
            <div class="pw-wrap">
              <input type="password" class="form-control" id="asTempPassword" placeholder="Min 8 chars, 1 uppercase, 1 number"/>
              <button type="button" class="pw-toggle" onclick="togglePwField('asTempPassword','asEyeIcon')">
                <i class="fa fa-eye" id="asEyeIcon"></i>
              </button>
            </div>
            <p class="um-pw-hint"><i class="fa fa-circle-info"></i> Must be ≥8 chars with uppercase and number. Student must reset on first login.</p>
          </div>
        </div>
        <div id="asAutoCredPreview" class="um-auto-preview">
          <i class="fa fa-wand-magic-sparkles"></i>
          A secure temporary password will be generated automatically.
          The student must set a new password on first login.
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal('addStudentModal')">Cancel</button>
      <button class="btn-primary" id="addStudentBtn" onclick="submitAddStudent()">
        <i class="fa fa-user-plus"></i> Create Account
      </button>
    </div>
  </div>
</div>

<!-- ── Credentials Display Modal ─────────────────────────────────── -->
<div class="modal-overlay" id="credsModal" style="display:none">
  <div class="modal">
    <div class="modal-header">
      <h3><i class="fa fa-circle-check" style="color:var(--green)"></i> Account Created Successfully</h3>
      <button class="modal-close" onclick="closeModal('credsModal')"><i class="fa fa-xmark"></i></button>
    </div>
    <div style="padding:20px 24px">
      <div class="um-success-banner">
        <i class="fa fa-user-check fa-2x" style="color:var(--green)"></i>
        <div>
          <strong id="credsStudentName">Student</strong>
          <p>Account created and ready. Share credentials securely.</p>
        </div>
      </div>
      <div class="um-creds-box">
        <div class="um-cred-row">
          <span class="um-cred-label"><i class="fa fa-envelope"></i> Email</span>
          <code id="credsEmail">—</code>
        </div>
        <div class="um-cred-row">
          <span class="um-cred-label"><i class="fa fa-at"></i> Username</span>
          <code id="credsUsername">—</code>
        </div>
        <div class="um-cred-row">
          <span class="um-cred-label"><i class="fa fa-key"></i> Temp Password</span>
          <code id="credsTempPw" class="creds-pw">—</code>
          <button class="btn-icon btn-note" onclick="copyCredentials()" title="Copy all">
            <i class="fa fa-copy"></i>
          </button>
        </div>
        <div class="um-cred-row">
          <span class="um-cred-label"><i class="fa fa-id-badge"></i> Student ID</span>
          <code id="credsStudentId">—</code>
        </div>
      </div>
      <div class="um-onboard-note">
        <i class="fa fa-triangle-exclamation" style="color:var(--yellow)"></i>
        Student must set a new password on first login. Share these credentials privately.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="copyCredentials()"><i class="fa fa-copy"></i> Copy Credentials</button>
      <button class="btn-primary" onclick="closeModal('credsModal')">Done</button>
    </div>
  </div>
</div>

<!-- ── Student Onboarding Prompt (First-Login) ───────────────────── -->
<div class="modal-overlay" id="onboardingModal" style="display:none">
  <div class="modal">
    <div class="modal-header" style="border-bottom:2px solid var(--purple)">
      <h3><i class="fa fa-shield-halved" style="color:var(--purple)"></i> Welcome — Set Your Password</h3>
    </div>
    <div style="padding:20px 24px">
      <p style="color:var(--gray400);font-size:.88rem;margin-bottom:18px">
        This is your first login. You must create a new secure password to continue.
      </p>
      <div id="onboardingErrors" class="auth-error-banner" style="display:none"></div>
      <div class="form-group">
        <label><i class="fa fa-lock"></i> New Password <span class="required">*</span></label>
        <div class="pw-wrap">
          <input type="password" class="form-control" id="obNewPw" placeholder="Min 8 chars, 1 uppercase, 1 number"/>
          <button type="button" class="pw-toggle" onclick="togglePwField('obNewPw','obEyeIcon1')">
            <i class="fa fa-eye" id="obEyeIcon1"></i>
          </button>
        </div>
      </div>
      <div class="form-group">
        <label><i class="fa fa-lock-open"></i> Confirm New Password <span class="required">*</span></label>
        <div class="pw-wrap">
          <input type="password" class="form-control" id="obConfirmPw" placeholder="Re-enter your new password"/>
          <button type="button" class="pw-toggle" onclick="togglePwField('obConfirmPw','obEyeIcon2')">
            <i class="fa fa-eye" id="obEyeIcon2"></i>
          </button>
        </div>
      </div>
      <div class="um-pw-requirements">
        <div class="pw-req" id="pwReqLen"><i class="fa fa-xmark"></i> At least 8 characters</div>
        <div class="pw-req" id="pwReqUpper"><i class="fa fa-xmark"></i> At least 1 uppercase letter</div>
        <div class="pw-req" id="pwReqNum"><i class="fa fa-xmark"></i> At least 1 number</div>
        <div class="pw-req" id="pwReqMatch"><i class="fa fa-xmark"></i> Passwords match</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-primary btn-full" onclick="submitOnboarding()">
        <i class="fa fa-lock"></i> Set Password &amp; Continue
      </button>
    </div>
  </div>
</div>`
  return shell('Student Management', body, 'admin')
}

export default app
