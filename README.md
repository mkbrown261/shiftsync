# Connect Differently — Employee Time Tracking System

## Project Overview
- **Product Name**: Connect Differently (ShiftSync)
- **Client**: Code Differently (replaces Connecteam — saves $1,000/month)
- **Goal**: Web-based attendance & time tracking for students/employees with QuickBooks payroll integration
- **Tech Stack**: Hono + TypeScript + Cloudflare Pages + TailwindCSS (CDN) + Chart.js

---

## 🖥️ Live Demo URLs

| Page | URL | Description |
|------|-----|-------------|
| Login | `/` | Role-based login (Student / Instructor / Admin) |
| Student Clock-In | `/student` | Clock in/out with GPS, history, profile |
| Instructor Verification | `/instructor` | Mark attendance, QB confirm per student |
| Admin Dashboard | `/admin` | Full KPI dashboard, all management screens |
| Student Profile | `/student-profile` | Detailed per-student stats & QB sync |

---

## 👥 User Roles & Screens

### 🎓 Student (`/student`)
- **Clock In / Clock Out** — animated fingerprint button with real-time timer
- **GPS Verification** — location captured on clock-in, verified against campus coordinates
- **Attendance History** — date-range list with Present/Late/Absent badges
- **Profile Tab** — hours trend chart, attendance rate, stipend status

### 🏫 Instructor (`/instructor`)
- **Live Roster** — all students with clock-in times displayed
- **Status Dropdown** — mark Present / Late / Absent per student
- **Mark All Present** — bulk action button
- **QB Confirm Button** — per-student QuickBooks confirmation
- **Send All to QB** — batch QuickBooks push

### 🛡️ Admin (`/admin`) — Tabbed Dashboard
- **Dashboard** — KPIs (students, hours, lates, stipend), charts, alerts
- **Students** — full roster with standing indicators
- **Reports** — date-range filtering, CSV + Google Sheets export
- **Stipend** — eligibility breakdown with attendance rate bars
- **QuickBooks** — AI sync assistant, pending entries review, confirm/skip
- **Settings** — late threshold slider, email alerts, GPS radius, integrations

---

## 🎨 Brand Colors (Code Differently)
| Token | Hex | Usage |
|-------|-----|-------|
| Navy | `#1E1B2E` | Background |
| Navy Light | `#2A263D` | Cards |
| Orange | `#F4703A` | Gradient start |
| Pink | `#E040A0` | Gradient mid |
| Purple | `#9B3DE8` | Gradient end, primary accent |

---

## 🔌 QuickBooks AI Integration — API Endpoints

### Required APIs for Full QB Integration

#### 1. QuickBooks Online API (OAuth 2.0)
```
Base URL: https://quickbooks.api.intuit.com
Auth URL: https://appcenter.intuit.com/connect/oauth2
Token URL: https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer

Key Endpoints:
POST /v3/company/{companyId}/employee          → Create/update student as employee
POST /v3/company/{companyId}/timeactivity      → Log attendance as time entry
GET  /v3/company/{companyId}/query             → Query existing entries
POST /v3/company/{companyId}/batch             → Batch submit all attendance at once

Scopes needed:
  com.intuit.quickbooks.accounting
  com.intuit.quickbooks.payment
```

#### 2. OpenAI API (AI Entry Review)
```
Base URL: https://api.openai.com/v1
POST /chat/completions   → GPT-4o reviews attendance data, flags anomalies,
                           suggests QB entry categories, auto-fills payroll fields

Prompt: "Review this attendance record and generate a QB TimeActivity entry:
{student_name, hours, status, date, cohort, stipend_amount}"
```

#### 3. SendGrid API (Automated Email Alerts)
```
Base URL: https://api.sendgrid.com/v3
POST /mail/send          → Send late threshold alerts to admin + student
POST /mail/send          → Weekly digest to Cristina with attendance summary
```

#### 4. Google Sheets API (Export)
```
Base URL: https://sheets.googleapis.com/v4
POST /spreadsheets/{id}/values/{range}:append  → Append attendance rows
GET  /spreadsheets/{id}/values/{range}          → Read existing data
```

#### 5. Google Maps / Geolocation
```
Browser API: navigator.geolocation.getCurrentPosition()  → Student clock-in GPS
Verify: Compare lat/lng against campus coordinates with Haversine formula
Radius: Configurable (default 200m)
```

### QB AI Workflow (Full Flow)
```
1. Instructor marks students Present/Late/Absent → /instructor
2. Admin clicks "Run AI Sync" → AI reviews all records
3. AI generates QB TimeActivity entries with:
   - Employee ID (mapped from student email)
   - Hours (from clock-in/out timestamps)
   - Description ("Stipend — Web Dev Cohort 12 — March 19")
   - Class (cohort name)
   - Status (approved/needs review)
4. Admin reviews flagged entries → single "Confirm" click per student
5. Batch POST to QB API → entries appear in QB payroll
6. Receipt stored in Connect Differently for audit trail
```

---

## 💾 Data Architecture
- **Storage**: Cloudflare D1 (SQLite) for production
- **Key Tables**: `students`, `shifts`, `attendance_records`, `stipend_periods`
- **Local Dev**: `--local` flag auto-creates SQLite mirror

## 🚀 Deployment
- **Platform**: Cloudflare Pages
- **Build**: `npm run build` → `dist/_worker.js`
- **Dev Server**: `pm2 start ecosystem.config.cjs`
- **Status**: ✅ Running

## 📅 Last Updated
March 19, 2025
