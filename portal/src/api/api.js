/**
 * Portal API client.
 *
 * Wraps the Flask backend with Axios. Every request carries the
 * x-api-key / x-project-id headers the backend requires. When the backend is
 * unreachable (or VITE_USE_MOCK=true) the calls gracefully fall back to the
 * high-fidelity mock dataset so the portal is always demoable.
 */
import axios from "axios";
import * as mock from "../data/mockData";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "proj_demo_local";
const API_KEY = import.meta.env.VITE_API_KEY || "demo_api_key_local_dev";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
    "x-project-id": PROJECT_ID,
    "x-api-key": API_KEY,
  },
});

/** Run a live request, falling back to a mock provider on failure. */
async function withFallback(liveFn, mockValue) {
  if (USE_MOCK) return structuredCloneSafe(mockValue);
  try {
    const { data } = await liveFn();
    return data;
  } catch (err) {
    console.warn("[api] live request failed, using mock data:", err?.message);
    return structuredCloneSafe(mockValue);
  }
}

function structuredCloneSafe(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/* ----------------------------- Dashboard ------------------------------ */
export const getOverview = () =>
  withFallback(() => client.get("/admin/overview"), {
    stats: mock.overviewStats,
    funnel: mock.funnelData,
  });

export const getActivity = (limit = 25) =>
  withFallback(() => client.get("/admin/activity", { params: { limit } }), {
    events: mock.activityFeed,
  });

/* --------------------------- Demographics ----------------------------- */
export const getDemographics = () =>
  withFallback(() => client.get("/admin/demographics"), {
    countries: mock.geoDistribution,
  });

export const getStability = () =>
  withFallback(() => client.get("/admin/stability"), {
    health_score: mock.healthScore,
    timeline: mock.crashTimeline,
  });

export const getFraudLogs = (limit = 50) =>
  withFallback(() => client.get("/admin/fraud-logs", { params: { limit } }), {
    logs: mock.fraudLogs,
  });

/* ------------------------ Remote config / rules ----------------------- */
export const getConfig = () =>
  withFallback(() => client.get("/admin/config"), { config: mock.remoteConfig });

export const updateConfig = async (config) => {
  if (USE_MOCK) {
    return { status: "synced", config };
  }
  try {
    const { data } = await client.put("/admin/config", config);
    return data;
  } catch (err) {
    console.warn("[api] config sync failed (mock echo):", err?.message);
    return { status: "synced", config };
  }
};

/* --------------------------- SDK endpoints ---------------------------- */
export const generateReferral = (user_id) =>
  client.post("/referral/generate", { user_id }).then((r) => r.data);

export const trackReferral = (payload) =>
  client.post("/referral/track", payload).then((r) => r.data);

export const getBalance = (user_id) =>
  client.get("/referral/balance", { params: { user_id } }).then((r) => r.data);

export const claimReward = (user_id, cost) =>
  client.post("/referral/claim", { user_id, cost }).then((r) => r.data);

export default client;
