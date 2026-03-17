# ShiftSync

> Replacing Connecteam ($1,000/month) with a custom, intelligent, location-verified attendance system.

## 🌐 Live URLs
- **Production (Cloudflare Pages):** https://shiftsync.pages.dev
- **Latest Deploy:** https://7adb599c.shiftsync.pages.dev

## 🎯 Project Overview
- **Name:** ShiftSync / ConnectDifferently
- **Client:** Code Differently school
- **Admin:** Cristina
- **Goal:** Track student/employee attendance, verify location on clock-in, automate stipend eligibility, and sync payroll to QuickBooks via AI

## 👥 User Roles & Pages

| Route | Role | Description |
|-------|------|-------------|
| `/login` | All | Role-based login (Student / Instructor / Admin) |
| `/student` | Student | Clock In/Out with GPS verification + proximity map |
| `/instructor` | Instructor | Attendance roster, Present/Late/Absent dropdown, QB sync |
| `/admin` | Admin | Dashboard KPIs, charts, alert management |
| `/profile` | Student | Hours, lates, absences, stipend eligibility meter |
| `/reports` | Admin/Instructor | Attendance reports, CSV/Google Sheets/QuickBooks export |
| `/settings` | Admin | Late thresholds, stipend rules, email alerts, QB config |
| `/geofence` | Admin | Geofence radius config, Leaflet map pin-drop, audit log |

## 🗺️ Intelligent Location System

### Student Clock-In Flow
1. **GPS Watch** — `watchPosition` continuously tracks student, shows live distance from campus
2. **Proximity Banner** — green "INSIDE ZONE" or orange "OUTSIDE ZONE" with distance bar
3. **Canvas Map** — real-time mini-map drawing campus pin, student pin, geofence ring (no external lib)
4. **Verification Panel** — 4-step check on clock-in: GPS → Distance → GPS Accuracy → WiFi
5. **Result routing:**
   - ✅ Inside fence → normal clock-in
   - ⚠️ Outside fence → flagged clock-in (instructor notified)
   - ❓ No GPS → manual review clock-in

### Admin Geofence Config (`/geofence`)
- Leaflet interactive map — click to move campus pin
- Radius slider 20–200m (presets: Tight 40m / Standard 60m / Wide 100m)
- Max GPS accuracy threshold (10–100m)
- Authorized WiFi network list
- **Verification Audit Log** — full/partial/failed stats + filterable table

### Location API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/location/verify` | POST | Verify student coordinates against geofence |
| `/api/location/config` | GET | Fetch current geofence settings |
| `/api/location/config` | POST | Admin: update geofence settings |
| `/api/location/verifications` | GET | Fetch audit log |
| `/api/location/distance` | GET | Calculate distance from campus |

## ⚡ QuickBooks + AI Integration

### AI API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/review-payroll` | POST | AI reviews attendance + generates QB entries |
| `/api/ai/generate-qb-entry` | POST | Generate single QB time activity entry |
| `/api/ai/stipend-check` | POST | AI checks student stipend eligibility |
| `/api/ai/test-key` | POST | Validate OpenAI-compatible API key |
| `/api/ai/run-with-key` | POST | Run full AI payroll review with user-supplied key |

### QuickBooks API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/qb/auth/connect` | GET | OAuth2 connect URL for QuickBooks |
| `/api/qb/employees` | GET | Fetch employee list with QB IDs |
| `/api/qb/payroll/sync` | POST | Push payroll entries to QuickBooks |

### AI Key Setup
- Go to **Settings → AI & QuickBooks Integration**
- Enter your OpenAI-compatible API key (stored in browser localStorage only — never sent to our servers)
- Use default base URL: `https://www.genspark.ai/api/llm_proxy/v1`

## 📊 Data Architecture
- **Storage:** In-memory / localStorage (demo) — ready for Cloudflare D1 upgrade
- **Geofence Config:** Served via `/api/location/config` — default: Code Differently Campus, Wilmington DE (39.7392, -75.5398), 60m radius
- **Stipend Rules:** ≥85% attendance, ≤3 lates, ≤2 absences
- **Late Threshold:** >10 minutes after 9:00 AM shift start (configurable in Settings)

## 🎨 Design System
- **Navy:** `#1E1B2E` (background, cards)
- **Gradient:** Orange `#F4703A` → Pink `#E040A0` → Purple `#9B3DE8` (buttons, accents, logo)
- **Font:** System sans-serif, mobile-first responsive layout

## 🛠️ Tech Stack
- **Backend:** Hono framework (TypeScript) on Cloudflare Workers
- **Frontend:** Vanilla JS + Tailwind via CDN + FontAwesome icons
- **Maps:** Leaflet.js (admin geofence), Canvas API (student proximity map)
- **Charts:** Chart.js (admin dashboard)
- **Deploy:** Cloudflare Pages (edge network, global CDN)
- **Build:** Vite + `@hono/vite-cloudflare-pages`

## 🚀 Deployment
- **Platform:** Cloudflare Pages
- **Project:** `shiftsync`
- **Status:** ✅ Active
- **Last Deployed:** 2026-03-16
- **Build command:** `npm run build`
- **Output dir:** `dist/`

## 📋 Stipend Eligibility Rules
- Present days count toward stipend (not Late or Absent)
- Late arrivals >10 min after shift start → "Late" status
- Max 3 lates before stipend risk (yellow indicator)
- Max 2 absences before ineligible (red indicator)
- All thresholds configurable by Admin in `/settings`

## 👤 Demo Logins
| Role | Email | Password |
|------|-------|----------|
| Student | alex@codedifferently.org | demo1234 |
| Instructor | instructor@codedifferently.org | demo1234 |
| Admin | cristina@codedifferently.org | demo1234 |
