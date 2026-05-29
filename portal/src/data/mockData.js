/**
 * High-fidelity mock dataset for the Developer Portal.
 *
 * Mirrors the exact shapes returned by the Flask `/api/admin/*` endpoints so
 * components render identically whether driven by live data or mocks.
 */

/* ------------------------- Overview stat cards ------------------------ */
export const overviewStats = {
  total_referrals: 18432,
  total_users: 64218,
  referred_users: 21765,
  k_factor: 1.34,
};

/* ----------------------- Conversion funnel ---------------------------- */
export const funnelData = [
  { stage: "Links Generated", value: 52000 },
  { stage: "Clicked", value: 38400 },
  { stage: "App Installs", value: 24100 },
  { stage: "Successful Referrals", value: 18432 },
];

/* ----------------- Daily referrals trend (sparkline) ------------------ */
export const referralTrend = Array.from({ length: 30 }, (_, i) => {
  const base = 420 + Math.round(Math.sin(i / 3) * 90) + i * 8;
  return {
    date: new Date(Date.now() - (29 - i) * 86400000)
      .toISOString()
      .slice(5, 10),
    referrals: base + Math.round(Math.random() * 60),
    installs: base - 60 + Math.round(Math.random() * 40),
  };
});

/* --------------------------- Activity feed ---------------------------- */
const COUNTRIES = [
  "United States", "India", "Brazil", "Germany",
  "United Kingdom", "Nigeria", "Indonesia", "Mexico", "France", "Japan",
];
const EVENT_TYPES = [
  "generated", "click", "install", "attributed", "claim", "blocked",
];

export const activityFeed = Array.from({ length: 24 }, (_, i) => {
  const type = EVENT_TYPES[i % EVENT_TYPES.length];
  return {
    id: 90000 - i,
    event_type: type,
    invite_code: "VRL" + (1000 + i),
    user_id: "user_" + (4821 + i * 7),
    country: COUNTRIES[i % COUNTRIES.length],
    ip_address: `${24 + i}.${10 + i}.${(i * 13) % 255}.${(i * 7) % 255}`,
    points_delta:
      type === "attributed" || type === "install"
        ? 100
        : type === "claim"
        ? -250
        : 0,
    created_at: new Date(Date.now() - i * 1000 * 60 * 7).toISOString(),
  };
});

/* ----------------------- Geo / demographics --------------------------- */
export const geoDistribution = [
  { country: "United States", users: 18420 },
  { country: "India", users: 14210 },
  { country: "Brazil", users: 8930 },
  { country: "Indonesia", users: 6120 },
  { country: "Germany", users: 4870 },
  { country: "United Kingdom", users: 4210 },
  { country: "Nigeria", users: 3680 },
  { country: "Mexico", users: 2980 },
  { country: "France", users: 2410 },
  { country: "Japan", users: 1740 },
];

/* --------------------------- SDK stability ---------------------------- */
export const healthScore = 99.82;

export const crashTimeline = Array.from({ length: 14 }, (_, i) => {
  const day = new Date(Date.now() - (13 - i) * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    date: day,
    errors: Math.max(0, Math.round(6 + Math.sin(i) * 5 + Math.random() * 4)),
    blocked: Math.max(0, Math.round(12 + Math.cos(i / 2) * 8 + Math.random() * 6)),
    timeouts: Math.max(0, Math.round(3 + Math.sin(i / 1.5) * 3 + Math.random() * 3)),
  };
});

/* --------------------------- Anti-fraud logs -------------------------- */
export const fraudLogs = Array.from({ length: 16 }, (_, i) => ({
  id: 50000 - i,
  event_type: "blocked",
  invite_code: i % 3 === 0 ? "VRL" + (2000 + i) : null,
  user_id: i % 2 === 0 ? "user_" + (7100 + i * 3) : null,
  ip_address: `${185 + (i % 40)}.${50 + i}.${(i * 17) % 255}.${(i * 11) % 255}`,
  country: COUNTRIES[(i + 3) % COUNTRIES.length],
  points_delta: 0,
  created_at: new Date(Date.now() - i * 1000 * 60 * 23).toISOString(),
}));

/* --------------------------- Remote config ---------------------------- */
export const remoteConfig = {
  project_id: "proj_demo_local",
  name: "Demo Project",
  points_per_referral: 100,
  fraud_detection_enabled: true,
  rate_limit_per_minute: 5,
  created_at: new Date(Date.now() - 86400000 * 42).toISOString(),
  updated_at: new Date().toISOString(),
};
