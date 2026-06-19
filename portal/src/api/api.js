/**
 * Portal API client.
 *
 * Wraps the Flask backend with Axios. Every request carries the
 * x-api-key / x-project-id headers the backend requires.
 */
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "proj_demo_local";
const API_KEY = import.meta.env.VITE_API_KEY || "demo_api_key_local_dev";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    "Content-Type": "application/json",
    "x-project-id": PROJECT_ID,
    "x-api-key": API_KEY,
  },
});

/* ----------------------------- Dashboard ------------------------------ */
export const getOverview = () =>
  client.get("/admin/overview").then((r) => r.data);

export const getActivity = (limit = 25) =>
  client.get("/admin/activity", { params: { limit } }).then((r) => r.data);

/* --------------------------- Demographics ----------------------------- */
export const getDemographics = () =>
  client.get("/admin/demographics").then((r) => r.data);

export const getStability = () =>
  client.get("/admin/stability").then((r) => r.data);

export const getFraudLogs = (limit = 50) =>
  client.get("/admin/fraud-logs", { params: { limit } }).then((r) => r.data);

/* ------------------------ Remote config / rules ----------------------- */
export const getConfig = () =>
  client.get("/admin/config").then((r) => r.data);

export const updateConfig = (config) =>
  client.put("/admin/config", config).then((r) => r.data);

export const getLeaderboard = (limit = 10) =>
  client.get("/admin/leaderboard", { params: { limit } }).then((r) => r.data);

export const getConfigAudit = (limit = 30) =>
  client.get("/admin/config-audit", { params: { limit } }).then((r) => r.data);

/* -------------------------- Growth Insights --------------------------- */
export const getEconomy = () =>
  client.get("/admin/economy").then((r) => r.data);

export const getReferralTree = () =>
  client.get("/admin/referral-tree").then((r) => r.data);

export const getConversion = () =>
  client.get("/admin/conversion").then((r) => r.data);

export const getSignups = (granularity = "day", days) =>
  client
    .get("/admin/signups", { params: { granularity, ...(days ? { days } : {}) } })
    .then((r) => r.data);

/* --------------------------- SDK endpoints ---------------------------- */
export const generateReferral = (user_id) =>
  client.post("/referral/generate", { user_id }).then((r) => r.data);

export const trackReferral = (payload) =>
  client.post("/referral/track", payload).then((r) => r.data);

export const getBalance = (user_id) =>
  client.get("/referral/balance", { params: { user_id } }).then((r) => r.data);

export const claimReward = (user_id, cost) =>
  client.post("/referral/claim", { user_id, cost }).then((r) => r.data);

export const claimDailyBonus = (user_id) =>
  client.post("/referral/daily-bonus", { user_id }).then((r) => r.data);

export default client;
