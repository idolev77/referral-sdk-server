/**
 * DashboardOverview
 *
 * Top stat cards (Total Referrals, Active Projects, Viral K-Factor),
 * a conversion funnel BarChart and a real-time activity feed table.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import {
  Activity,
  GitBranch,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";

import { getActivity, getLeaderboard, getOverview } from "../api/api";
import { Badge, Card, CHART_COLORS, Skeleton, StatCard } from "./ui";

const RANK_ICONS = ["🥇", "🥈", "🥉"];

const EVENT_TONE = {
  generated: "indigo",
  click: "blue",
  install: "green",
  attributed: "green",
  claim: "amber",
  blocked: "red",
  error: "red",
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-slate-400">
          <span style={{ color: p.color || p.fill }}>●</span>{" "}
          {p.name}: <span className="font-semibold text-white">{p.value?.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardOverview() {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [ov, act, lb] = await Promise.all([
          getOverview(),
          getActivity(20),
          getLeaderboard(10),
        ]);
        if (!alive) return;
        setOverview(ov);
        setEvents(act.events || []);
        setLeaders(lb.leaderboard || []);
      } catch (e) {
        if (alive) setError("Could not reach the backend API.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(async () => {
      try {
        const act = await getActivity(20);
        if (alive) setEvents(act.events || []);
      } catch (_) {}
    }, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const stats = overview?.stats;
  const funnel = overview?.funnel || [];

  const conversion = useMemo(() => {
    if (funnel.length < 2 || !funnel[0].value) return 0;
    return ((funnel[funnel.length - 1].value / funnel[0].value) * 100).toFixed(1);
  }, [funnel]);

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
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="text-sm text-slate-400">
          Real-time virality metrics across your referral program.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))
        ) : (
          <>
            <StatCard
              icon={Share2}
              label="Total Referrals"
              value={stats.total_referrals.toLocaleString()}
              delta={12.4}
              accent="brand"
            />
            <StatCard
              icon={Users}
              label="Total Users"
              value={stats.total_users.toLocaleString()}
              delta={8.1}
              accent="sky"
            />
            <StatCard
              icon={GitBranch}
              label="Referred Users"
              value={stats.referred_users.toLocaleString()}
              delta={5.6}
              accent="emerald"
            />
            <StatCard
              icon={TrendingUp}
              label="Viral K-Factor"
              value={stats.k_factor}
              delta={3.2}
              accent="amber"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Funnel */}
        <Card
          title="Conversion Funnel"
          className="xl:col-span-2"
          action={<Badge tone="green">{conversion}% end-to-end</Badge>}
        >
          {loading ? (
            <Skeleton className="h-72" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={funnel}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="stage"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]} animationDuration={900}>
                  {funnel.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Trend (built from live events) */}
        <Card title="Referral Trend">
          {loading ? (
            <Skeleton className="h-72" />
          ) : events.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-slate-500">
              <span className="text-4xl">📊</span>
              <p className="text-sm font-medium">No referral activity yet.</p>
              <p className="text-xs">Data will appear here once the SDK starts sending events.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={events.filter(e => e.event_type === "attributed").slice(0, 30).reverse()}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="refGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="created_at" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v?.slice(5, 10)} minTickGap={24} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="points_delta" name="Points" stroke="#818cf8" strokeWidth={2} fill="url(#refGrad)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Activity feed */}
      <Card
        title="Live Activity Feed"
        action={
          <span className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-medium">Event</th>
                <th className="pb-3 pr-4 font-medium">User</th>
                <th className="pb-3 pr-4 font-medium">Invite</th>
                <th className="pb-3 pr-4 font-medium">Country</th>
                <th className="pb-3 pr-4 font-medium">Points</th>
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
                : events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-500">
                        <p className="text-3xl">📭</p>
                        <p className="mt-2 text-sm font-medium">No events yet.</p>
                        <p className="text-xs">Call the SDK from your app to see live activity here.</p>
                      </td>
                    </tr>
                  )
                : events.map((e) => (
                    <tr key={e.id} className="text-slate-300 transition hover:bg-white/5">
                      <td className="py-3 pr-4">
                        <Badge tone={EVENT_TONE[e.event_type] || "slate"}>
                          {e.event_type}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                        {e.user_id || "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                        {e.invite_code || "—"}
                      </td>
                      <td className="py-3 pr-4">{e.country || "Unknown"}</td>
                      <td
                        className={`py-3 pr-4 font-semibold ${
                          e.points_delta > 0
                            ? "text-emerald-400"
                            : e.points_delta < 0
                            ? "text-rose-400"
                            : "text-slate-500"
                        }`}
                      >
                        {e.points_delta > 0 ? `+${e.points_delta}` : e.points_delta || "—"}
                      </td>
                      <td className="py-3 text-right text-xs text-slate-500">
                        {timeAgo(e.created_at)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Leaderboard */}
      <Card
        title="Top Referrers"
        action={
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            🏆 Leaderboard
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4 font-medium">Rank</th>
                <th className="pb-3 pr-4 font-medium">User</th>
                <th className="pb-3 pr-4 font-medium">Invite Code</th>
                <th className="pb-3 pr-4 font-medium">Country</th>
                <th className="pb-3 pr-4 font-medium text-right">Referrals</th>
                <th className="pb-3 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="py-3">
                        <Skeleton className="h-5" />
                      </td>
                    </tr>
                  ))
                : leaders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-500">
                        <p className="text-3xl">🏅</p>
                        <p className="mt-2 text-sm font-medium">No referrers yet.</p>
                        <p className="text-xs">Use the SDK Playground to generate your first referral.</p>
                      </td>
                    </tr>
                  )
                : leaders.map((l) => (
                    <tr key={l.rank} className="text-slate-300 transition hover:bg-white/5">
                      <td className="py-3 pr-4 text-lg">
                        {RANK_ICONS[l.rank - 1] ?? (
                          <span className="font-mono text-sm text-slate-500">#{l.rank}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{l.user_id}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-300">
                        {l.invite_code || "—"}
                      </td>
                      <td className="py-3 pr-4 text-slate-400">{l.country || "Unknown"}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-sky-300">
                        {l.referrals}
                      </td>
                      <td className="py-3 text-right font-semibold text-emerald-400">
                        +{l.points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
