/**
 * Portal API client.
 *
 * Wraps the Flask backend with Axios. Every request carries the
 * x-api-key / x-project-id headers the backend requires.
 *
 * Live mode (default): returns only real data from the server.
 * Mock mode (VITE_USE_MOCK=true): returns static mock data — for UI demos only,
 * nothing ever touches the database.
 */
import axios from "axios";
import * as mock from "../data/mockData";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "proj_demo_local";
const API_KEY = import.meta.env.VITE_API_KEY || "demo_api_key_local_dev";
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
    "x-project-id": PROJECT_ID,
    "x-api-key": API_KEY,
  },
});

/**
 * In live mode: calls the real API and returns exactly what the server sends.
 * Never substitutes mock data — errors are thrown so components can show a
 * real error/empty state.
 *
 * In mock mode (VITE_USE_MOCK=true): returns the static mock value.
 */
async function call(liveFn, mockValue) {
  if (USE_MOCK) {
    return typeof structuredClone === "function"
      ? structuredClone(mockValue)
      : JSON.parse(JSON.stringify(mockValue));
  }
  const { data } = await liveFn();
  return data;
}

/* ----------------------------- Dashboard ------------------------------ */
export const getOverview = () =>
  call(() => client.get("/admin/overview"), {
    stats: mock.overviewStats,
    funnel: mock.funnelData,
  });

export const getActivity = (limit = 25) =>
  call(() => client.get("/admin/activity", { params: { limit } }), {
    events: mock.activityFeed,
  });

/* --------------------------- Demographics ----------------------------- */
export const getDemographics = () =>
  call(() => client.get("/admin/demographics"), {
    countries: mock.geoDistribution,
  });

export const getStability = () =>
  call(() => client.get("/admin/stability"), {
    health_score: mock.healthScore,
    timeline: mock.crashTimeline,
  });

export const getFraudLogs = (limit = 50) =>
  call(() => client.get("/admin/fraud-logs", { params: { limit } }), {
    logs: mock.fraudLogs,
  });

/* ------------------------ Remote config / rules ----------------------- */
export const getConfig = () =>
  call(() => client.get("/admin/config"), { config: mock.remoteConfig });

export const updateConfig = async (config) => {
  if (USE_MOCK) return { status: "synced", config };
  const { data } = await client.put("/admin/config", config);
  return data;
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
