/**
 * SignupsChart
 *
 * New members (people joining) over time, with a Day / Hour granularity toggle.
 * Data is aggregated server-side (one row per time bucket) via
 * GET /api/admin/signups, so the payload scales with the number of buckets —
 * not the number of users — and is served from the versioned admin cache.
 */
import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UserPlus, CalendarDays, Clock } from "lucide-react";

import { getSignups } from "../api/api";
import { Badge, Card, Skeleton } from "./ui";

const GRANULARITIES = [
  { id: "day", label: "Day", icon: CalendarDays },
  { id: "hour", label: "Hour", icon: Clock },
];

/** Format an ISO timestamp for the X axis based on the active granularity. */
function fmtTick(ts, granularity) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).slice(5, 16);
  return granularity === "hour"
    ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
    : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function ChartTooltip({ active, payload, granularity }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1 font-semibold text-slate-200">
        {fmtTick(p.payload.ts, granularity)}
      </p>
      <p className="text-slate-400">
        <span style={{ color: "#34d399" }}>●</span> New members:{" "}
        <span className="font-semibold text-white">
          {p.value?.toLocaleString()}
        </span>
      </p>
    </div>
  );
}

export default function SignupsChart() {
  const [granularity, setGranularity] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSignups(granularity)
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setError("Could not reach the backend API.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [granularity]);

  const series = data?.series || [];

  return (
    <Card
      title="New Members Over Time"
      action={
        <div className="flex items-center gap-3">
          {data?.total != null && (
            <Badge tone="green">
              <UserPlus size={12} /> {data.total.toLocaleString()} joined
            </Badge>
          )}
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {GRANULARITIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setGranularity(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                  granularity === id
                    ? "bg-brand-500/20 text-brand-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {error ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-rose-400">
          <span className="text-3xl">⚠️</span>
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : loading ? (
        <Skeleton className="h-72" />
      ) : series.length === 0 ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-slate-500">
          <span className="text-4xl">👥</span>
          <p className="text-sm font-medium">No sign-ups in this window yet.</p>
          <p className="text-xs">
            New members will chart here as users join via the SDK.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="ts"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmtTick(v, granularity)}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip granularity={granularity} />} />
            <Area
              type="monotone"
              dataKey="count"
              name="New members"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#signupGrad)"
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
