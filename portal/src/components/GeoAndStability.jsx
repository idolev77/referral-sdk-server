/**
 * GeoAndStability
 *
 * Country breakdown (horizontal BarChart), SDK health score gauge, a crash /
 * error timeline (AreaChart) and the anti-fraud rate-limit log table.
 */
import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Globe2, ShieldAlert, Activity } from "lucide-react";

import { getDemographics, getFraudLogs, getStability } from "../api/api";
import { Badge, Card, CHART_COLORS, Skeleton } from "./ui";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      {label && <p className="mb-1 font-semibold text-slate-200">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className="text-slate-400">
          <span style={{ color: p.color || p.fill }}>●</span> {p.name}:{" "}
          <span className="font-semibold text-white">
            {p.value?.toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

function HealthGauge({ score }) {
  const size   = 200;
  const stroke = 14;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const tone   = score >= 98 ? "#34d399" : score >= 93 ? "#f59e0b" : "#f43f5e";
  const status = score >= 98 ? { label: "Healthy",  badge: "green" }
               : score >= 93 ? { label: "Good",      badge: "amber" }
               :               { label: "Degraded",  badge: "red"   };
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#ffffff12" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tone}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          <div className="text-4xl font-extrabold tabular-nums text-white">{score.toFixed(1)}%</div>
          <div className="mt-1.5 text-xs uppercase tracking-wide text-slate-500">Stability</div>
        </div>
      </div>
      <Badge tone={status.badge}>{status.label}</Badge>
    </div>
  );
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function GeoAndStability() {
  const [countries, setCountries] = useState([]);
  const [health, setHealth] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [demo, stab, fraud] = await Promise.all([
          getDemographics(),
          getStability(),
          getFraudLogs(50),
        ]);
        if (!alive) return;
        setCountries(demo.countries || []);
        setHealth(stab.health_score);
        setTimeline(stab.timeline || []);
        setLogs(fraud.logs || []);
      } catch (e) {
        if (alive) setError("Could not reach the backend API.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="font-semibold text-rose-400">{error}</p>
        <p className="text-xs text-slate-500">Make sure the Flask backend is running on port 5000.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Demographics & Stability</h1>
        <p className="text-sm text-slate-400">
          Geo-IP distribution, SDK health and anti-fraud enforcement.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Country breakdown */}
        <Card
          title="Country Breakdown"
          className="xl:col-span-2"
          action={
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Globe2 size={14} /> Geo-IP resolved
            </span>
          }
        >
          {loading ? (
            <Skeleton className="h-80" />
          ) : countries.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center gap-2 text-center text-slate-500">
              <span className="text-4xl">🌍</span>
              <p className="text-sm font-medium">No geo data yet.</p>
              <p className="text-xs">Country data appears after users install via referral links.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                layout="vertical"
                data={countries}
                margin={{ top: 4, right: 16, left: 24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                />
                <YAxis
                  type="category"
                  dataKey="country"
                  width={120}
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="users" name="Users" radius={[0, 6, 6, 0]} animationDuration={900}>
                  {countries.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Health gauge */}
        <Card title="SDK Health Score">
          {loading || health == null ? (
            <Skeleton className="h-80" />
          ) : (
            <div className="flex h-80 flex-col items-center justify-center gap-3">
              <HealthGauge score={health} />
              <p className="px-4 text-center text-xs text-slate-500">
                Computed from blocked requests, network timeouts and runtime
                errors across all SDK sessions.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Crash / error timeline */}
      <Card
        title="Crash & Error Timeline"
        action={
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Activity size={14} /> last 14 days
          </span>
        }
      >
        {loading ? (
          <Skeleton className="h-64" />
        ) : timeline.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-500">
            <span className="text-4xl">📉</span>
            <p className="text-sm font-medium">No error events yet.</p>
            <p className="text-xs">Errors, timeouts and blocked requests will appear here over time.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="blkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="toGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="errors" name="Errors" stroke="#f43f5e" strokeWidth={2} fill="url(#errGrad)" animationDuration={900} />
              <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#f59e0b" strokeWidth={2} fill="url(#blkGrad)" animationDuration={900} />
              {timeline[0]?.timeouts != null && (
                <Area type="monotone" dataKey="timeouts" name="Timeouts" stroke="#38bdf8" strokeWidth={2} fill="url(#toGrad)" animationDuration={900} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Anti-fraud logs */}
      <Card
        title="Anti-Fraud Logs"
        action={
          <Badge tone="red">
            <ShieldAlert size={12} /> {logs.length} blocked
          </Badge>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-medium">IP Address</th>
                <th className="pb-3 pr-4 font-medium">User</th>
                <th className="pb-3 pr-4 font-medium">Invite</th>
                <th className="pb-3 pr-4 font-medium">Country</th>
                <th className="pb-3 pr-4 font-medium">Reason</th>
                <th className="pb-3 font-medium text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="py-3">
                        <Skeleton className="h-5" />
                      </td>
                    </tr>
                  ))
                : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-500">
                        <p className="text-3xl">🛡️</p>
                        <p className="mt-2 text-sm font-medium">No blocked requests yet.</p>
                        <p className="text-xs">Rate-limit triggers will appear here automatically.</p>
                      </td>
                    </tr>
                  )
                : logs.map((l) => (
                    <tr key={l.id} className="text-slate-300 transition hover:bg-white/5">
                      <td className="py-3 pr-4 font-mono text-xs text-rose-300">{l.ip_address}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{l.user_id || "—"}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{l.invite_code || "—"}</td>
                      <td className="py-3 pr-4">{l.country || "Unknown"}</td>
                      <td className="py-3 pr-4">
                        <Badge tone="red">rate_limit</Badge>
                      </td>
                      <td className="py-3 text-right text-xs text-slate-500">{timeAgo(l.created_at)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
