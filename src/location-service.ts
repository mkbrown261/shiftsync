// ═══════════════════════════════════════════════════════════════════════
// location-service.ts — Intelligent Location Verification Layer
// Non-destructive enhancement — does NOT modify any existing routes/logic
// ═══════════════════════════════════════════════════════════════════════

// ── In-Memory Store (replace with D1/KV in production) ───────────────
// Persists across requests within same Worker instance
const locationStore = {
  config: null as SchoolLocation | null,
  verifications: [] as LocationVerification[],
  nextId: 1,
}

// ── Types ─────────────────────────────────────────────────────────────
export interface SchoolLocation {
  id: number
  name: string
  latitude: number
  longitude: number
  radius: number                  // meters
  allowed_wifi_networks: string[] // SSIDs
  max_accuracy: number            // reject GPS readings worse than this (meters)
  created_at: string
  updated_at: string
}

export interface LocationVerification {
  id: number
  student_id: string
  session_id: string
  latitude: number
  longitude: number
  distance_from_school: number    // meters (Haversine)
  gps_accuracy: number            // meters reported by device
  wifi_ssid: string | null
  wifi_verified: boolean
  gps_verified: boolean
  overall_status: 'full' | 'partial' | 'failed'
  rejection_reason: string | null
  timestamp: string
}

export interface VerifyLocationInput {
  student_id: string
  session_id: string
  latitude: number
  longitude: number
  accuracy: number
  wifi_ssid?: string | null
}

export interface VerifyLocationResult {
  allowed: boolean
  status: 'full' | 'partial' | 'failed'
  distance_from_school: number
  gps_verified: boolean
  wifi_verified: boolean
  rejection_reason: string | null
  verification_id: number | null
  school_name: string
  message: string
}

// ── Default school config (Code Differently campus) ──────────────────
const DEFAULT_CONFIG: SchoolLocation = {
  id: 1,
  name: 'Code Differently Campus',
  latitude: 39.7392,
  longitude: -75.5398,
  radius: 60,
  allowed_wifi_networks: ['CodeDifferently-WiFi', 'CD-Staff', 'CD-Students'],
  max_accuracy: 40,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// ── Haversine Distance Formula ────────────────────────────────────────
// Returns distance in meters between two GPS coordinates
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// ── Config Accessors ──────────────────────────────────────────────────
export function getSchoolConfig(): SchoolLocation {
  return locationStore.config || DEFAULT_CONFIG
}

export function setSchoolConfig(config: Omit<SchoolLocation, 'id' | 'created_at' | 'updated_at'>): SchoolLocation {
  const existing = locationStore.config
  locationStore.config = {
    id: existing?.id || 1,
    ...config,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  return locationStore.config
}

// ── Core Verification Engine ──────────────────────────────────────────
export function verifyLocation(input: VerifyLocationInput): VerifyLocationResult {
  const school = getSchoolConfig()
  const start = Date.now()

  // ── Step 1: Accuracy Filter ─────────────────────────────────────
  if (input.accuracy > school.max_accuracy) {
    const record = saveVerification(input, 0, false, false, 'failed',
      `GPS accuracy too low (${Math.round(input.accuracy)}m reported, max ${school.max_accuracy}m allowed)`)
    return {
      allowed: false,
      status: 'failed',
      distance_from_school: 0,
      gps_verified: false,
      wifi_verified: false,
      rejection_reason: record.rejection_reason,
      verification_id: record.id,
      school_name: school.name,
      message: `📡 GPS signal too weak (${Math.round(input.accuracy)}m accuracy). Move outdoors or closer to a window.`,
    }
  }

  // ── Step 2: Haversine Distance Calculation ──────────────────────
  const distance = haversineDistance(
    input.latitude, input.longitude,
    school.latitude, school.longitude
  )
  const distanceRounded = Math.round(distance)
  const gpsVerified = distance <= school.radius

  // ── Step 3: WiFi Verification ────────────────────────────────────
  const wifiVerified = input.wifi_ssid
    ? school.allowed_wifi_networks.some(
        net => net.toLowerCase() === (input.wifi_ssid || '').toLowerCase()
      )
    : false

  // ── Step 4: Overall Decision ─────────────────────────────────────
  let status: 'full' | 'partial' | 'failed'
  let allowed: boolean
  let rejection: string | null = null
  let message: string

  if (!gpsVerified) {
    status = 'failed'
    allowed = false
    rejection = `Outside geofence — ${distanceRounded}m from campus (max ${school.radius}m)`
    message = `📍 You are ${distanceRounded}m from ${school.name}. You must be on campus to clock in.`
  } else if (gpsVerified && wifiVerified) {
    status = 'full'
    allowed = true
    message = `✅ Location fully verified — ${distanceRounded}m from campus, on campus WiFi.`
  } else {
    // GPS passes but no WiFi — partial verification (still allowed with flag)
    status = 'partial'
    allowed = true
    message = `⚠️ Location verified by GPS (${distanceRounded}m). Campus WiFi not detected — marked as partially verified.`
  }

  const record = saveVerification(input, distanceRounded, gpsVerified, wifiVerified, status, rejection)

  // Log performance
  const elapsed = Date.now() - start
  console.log(`[LocationVerify] ${input.student_id} | ${distanceRounded}m | gps:${gpsVerified} wifi:${wifiVerified} | ${status} | ${elapsed}ms`)

  return {
    allowed,
    status,
    distance_from_school: distanceRounded,
    gps_verified: gpsVerified,
    wifi_verified: wifiVerified,
    rejection_reason: rejection,
    verification_id: record.id,
    school_name: school.name,
    message,
  }
}

// ── Audit Trail ───────────────────────────────────────────────────────
function saveVerification(
  input: VerifyLocationInput,
  distance: number,
  gpsVerified: boolean,
  wifiVerified: boolean,
  status: 'full' | 'partial' | 'failed',
  rejection: string | null
): LocationVerification {
  const record: LocationVerification = {
    id: locationStore.nextId++,
    student_id: input.student_id,
    session_id: input.session_id,
    latitude: input.latitude,
    longitude: input.longitude,
    distance_from_school: distance,
    gps_accuracy: input.accuracy,
    wifi_ssid: input.wifi_ssid || null,
    wifi_verified: wifiVerified,
    gps_verified: gpsVerified,
    overall_status: status,
    rejection_reason: rejection,
    timestamp: new Date().toISOString(),
  }
  locationStore.verifications.push(record)
  // Keep last 500 verifications in memory
  if (locationStore.verifications.length > 500) {
    locationStore.verifications = locationStore.verifications.slice(-500)
  }
  return record
}

export function getVerifications(studentId?: string, limit = 50): LocationVerification[] {
  const all = [...locationStore.verifications].reverse()
  if (studentId) return all.filter(v => v.student_id === studentId).slice(0, limit)
  return all.slice(0, limit)
}

export function getVerificationStats() {
  const all = locationStore.verifications
  const total = all.length
  const full    = all.filter(v => v.overall_status === 'full').length
  const partial = all.filter(v => v.overall_status === 'partial').length
  const failed  = all.filter(v => v.overall_status === 'failed').length
  const avgDist = total > 0
    ? Math.round(all.reduce((s, v) => s + v.distance_from_school, 0) / total)
    : 0
  return { total, full, partial, failed, avg_distance: avgDist }
}
