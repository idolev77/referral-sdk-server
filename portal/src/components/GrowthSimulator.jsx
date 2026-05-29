/**
 * GrowthSimulator
 *
 * Interactive viral K-factor growth projection tool.
 * Pure client-side computation — no backend required.
 *
 * Model:
 *   Generation 0 : N₀ seed users
 *   Generation c : N₀ × Kᶜ new users (each cohort multiplies by K)
 *   Cumulative   : N₀ × (Kᴳ⁺¹ − 1) / (K − 1)     [K ≠ 1]
 *                  N₀ × (G + 1)                       [K = 1]
 *
 *   Paid baseline: N₀ + G × (N₀ × K)  (constant acquisition each period)
 */
import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingUp, Users, Zap } from "lucide-react";
import { Badge, Card, StatCard } from "./ui";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      <p className="mb-1 font-semibold text-slate-200">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-slate-400">
          <span style={{ color: p.stroke }}>●</span>{" "}
          {p.name}:{" "}
          <span className="font-semibold text-white">
            {Number(p.value).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export default function GrowthSimulator() {
  const [initialUsers, setInitialUsers] = useState(500);
  const [kFactor, setKFactor] = useState(1.3);
  const [cycles, setCycles] = useState(10);

  const isViral = kFactor >= 1;

  const { data, finalViral, finalLinear, totalNewBySDK } = useMemo(() => {
    const rows = [];
    let cumViral = initialUsers;

    for (let c = 0; c <= cycles; c++) {
      const cumLinear = Math.round(initialUsers + c * initialUsers * kFactor);
      rows.push({
        gen: `G${c}`,
        "Viral (SDK)": Math.round(cumViral),
        "Paid Acquisition": cumLinear,
      });
      cumViral += initialUsers * Math.pow(kFactor, c + 1);
    }

    const last = rows[rows.length - 1];
    return {
      data: rows,
      finalViral: last["Viral (SDK)"],
      finalLinear: last["Paid Acquisition"],
      totalNewBySDK: last["Viral (SDK)"] - initialUsers,
    };
  }, [initialUsers, kFactor, cycles]);

  const multiplier =
    finalLinear > 0 ? (finalViral / finalLinear).toFixed(2) : "∞";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Viral Growth Simulator</h1>
        <p className="text-sm text-slate-400">
          Model your referral program's viral coefficient and project growth
          trajectories in real time.
        </p>
      </div>

      {/* Controls */}
      <Card title="Simulation Parameters">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Seed users */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Seed Users (N₀)
              </label>
              <span className="font-bold text-white">
                {initialUsers.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="10000"
              step="50"
              value={initialUsers}
              onChange={(e) => setInitialUsers(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>50</span>
              <span>5k</span>
              <span>10k</span>
            </div>
          </div>

          {/* K-Factor */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Viral K-Factor
              </label>
              <span
                className={`font-bold ${
                  isViral ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {kFactor.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.05"
              value={kFactor}
              onChange={(e) => setKFactor(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>0.1</span>
              <span className="text-amber-500">K=1</span>
              <span>3.0</span>
            </div>
          </div>

          {/* Generations */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Generations
              </label>
              <span className="font-bold text-white">{cycles}</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={cycles}
              onChange={(e) => setCycles(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>2</span>
              <span>10</span>
              <span>20</span>
            </div>
          </div>
        </div>

        {/* Status banner */}
        <div
          className={`mt-5 rounded-xl border p-3 text-sm ${
            isViral
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {isViral
            ? `🚀 Viral! K = ${kFactor.toFixed(2)} > 1 — each user brings more than one new user. Growth is super-linear.`
            : `📉 Sub-viral. K = ${kFactor.toFixed(2)} < 1 — each generation shrinks. Increase reward incentives to cross K = 1.`}
        </div>
      </Card>

      {/* Stat summary */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Final Viral Users"
          value={finalViral.toLocaleString()}
          accent="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="New via SDK"
          value={totalNewBySDK.toLocaleString()}
          accent="emerald"
        />
        <StatCard
          icon={Zap}
          label="Viral Multiplier"
          value={`${multiplier}×`}
          accent="sky"
        />
        <StatCard
          icon={BarChart3}
          label="Paid Equiv."
          value={finalLinear.toLocaleString()}
          accent="amber"
        />
      </div>

      {/* Chart */}
      <Card
        title="Growth Curve Projection"
        action={
          <Badge tone={isViral ? "green" : "red"}>
            {isViral ? "Viral" : "Sub-viral"} · K = {kFactor.toFixed(2)}
          </Badge>
        }
      >
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="viralGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#ffffff10"
              vertical={false}
            />
            <XAxis
              dataKey="gen"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmt}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Area
              type="monotone"
              dataKey="Viral (SDK)"
              stroke="#818cf8"
              strokeWidth={2.5}
              fill="url(#viralGrad)"
              animationDuration={600}
            />
            <Area
              type="monotone"
              dataKey="Paid Acquisition"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#paidGrad)"
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Formula */}
      <Card title="The Math Behind Viral Growth">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-white/5 bg-ink-900/60 p-4 font-mono text-slate-300">
            <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
              Viral Growth (SDK)
            </p>
            <p>
              <span className="text-sky-400">users(G)</span> = N₀ × K^G
            </p>
            <p>
              <span className="text-brand-400">total(G)</span> = N₀ × (K^(G+1)−1) / (K−1)
            </p>
            <div className="mt-3 border-t border-white/5 pt-3 text-xs text-slate-500">
              <p>
                N₀={initialUsers.toLocaleString()}, K={kFactor.toFixed(2)}, G=
                {cycles}
              </p>
              <p className="mt-1 font-semibold text-brand-300">
                → {finalViral.toLocaleString()} users total
              </p>
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-white/5 bg-ink-900/60 p-4 font-mono text-slate-300">
            <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
              Paid Acquisition (Baseline)
            </p>
            <p>
              <span className="text-amber-400">total(G)</span> = N₀ + G × (N₀ × K)
            </p>
            <p className="text-xs text-slate-500">
              Constant N₀×K new users each period (same cost)
            </p>
            <div className="mt-3 border-t border-white/5 pt-3 text-xs text-slate-500">
              <p>
                N₀={initialUsers.toLocaleString()}, K={kFactor.toFixed(2)}, G=
                {cycles}
              </p>
              <p className="mt-1 font-semibold text-amber-300">
                → {finalLinear.toLocaleString()} users total
              </p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          At K = {kFactor.toFixed(2)} over {cycles} generations, the SDK
          delivers{" "}
          <span className="font-bold text-brand-300">{multiplier}×</span> more
          users than equivalent paid acquisition.
        </p>
      </Card>
    </div>
  );
}
