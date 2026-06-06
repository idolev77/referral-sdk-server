/**
 * GrowthInsights
 *
 * Three high-value, server-derived analytics (no SDK changes required):
 *   1. Points Economy   — issued vs redeemed, outstanding liability, 30-day flow.
 *   2. Viral Tree       — referral generations, depth, downstream reach.
 *   3. Conversion       — funnel rates, click→attributed latency, geo conversion.
 */
import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Coins,
  Wallet,
  Repeat,
  Network,
  GitBranch,
  Layers,
  Percent,
  Timer,
  Share2,
  Trophy,
} from "lucide-react";

import { getConversion, getEconomy, getReferralTree } from "../api/api";
import { Badge, Card, CHART_COLORS, Skeleton, StatCard } from "./ui";

/* ------------------------------- helpers ------------------------------- */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-glow backdrop-blur">
      {label && <p className="mb-1 font-semibold text-slate-200">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="text-slate-400">
          <span style={{ color: p.color || p.fill }}>●</span> {p.name}:{" "}
          <span className="font-semibold text-white">
            {p.value?.toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

function fmtDuration(s) {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
        <Icon size={18} />
      </span>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

/* ===================================================================== */
export default function GrowthInsights() {
  const [economy, setEconomy] = useState(null);
  const [tree, setTree] = useState(null);
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [eco, tr, cv] = await Promise.all([
          getEconomy(),
          getReferralTree(),
          getConversion(),
        ]);
        if (!alive) return;
        setEconomy(eco);
        setTree(tr);
        setConv(cv);
      } catch (e) {
        if (alive) setError("Could not reach the backend API.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="font-semibold text-rose-400">{error}</p>
        <p className="text-xs text-slate-500">
          Make sure the Flask backend is running on port 5000.
        </p>
      </div>
    );
  }

  const ttc = conv?.time_to_convert;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Growth Insights</h1>
        <p className="text-sm text-slate-400">
          Points economy, viral reach and conversion quality — derived from your
          live event stream.
        </p>
      </div>

      {/* ============================ 1. ECONOMY ============================ */}
      <SectionHeader
        icon={Coins}
        title="Points Economy"
        subtitle="How many points you've issued, redeemed and still owe."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard icon={Coins} label="Points Issued" value={economy.issued.toLocaleString()} accent="emerald" />
            <StatCard icon={Repeat} label="Points Redeemed" value={economy.redeemed.toLocaleString()} accent="amber" />
            <StatCard icon={Wallet} label="Outstanding Liability" value={economy.outstanding.toLocaleString()} accent="sky" />
            <StatCard icon={Percent} label="Redemption Rate" value={`${economy.redemption_rate}%`} accent="brand" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Points Flow" className="xl:col-span-2" action={<Badge tone="slate">last 30 days</Badge>}>
          {loading ? (
            <Skeleton className="h-72" />
          ) : !economy.timeline?.length ? (
            <Empty emoji="🪙" title="No points activity yet." hint="Issued and redeemed points will chart here." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={economy.timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="issGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v?.slice(5)} minTickGap={24} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="issued" name="Issued" stroke="#34d399" strokeWidth={2} fill="url(#issGrad)" animationDuration={900} />
                <Area type="monotone" dataKey="redeemed" name="Redeemed" stroke="#f59e0b" strokeWidth={2} fill="url(#redGrad)" animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Issued by Source">
          {loading ? (
            <Skeleton className="h-72" />
          ) : !economy.sources?.length ? (
            <Empty emoji="🎁" title="No points issued yet." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={economy.sources}
                  dataKey="points"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={3}
                  animationDuration={900}
                >
                  {economy.sources.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && economy.sources?.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {economy.sources.map((s, i) => (
                <span key={s.source} className="flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {s.source}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ========================== 2. VIRAL TREE ========================== */}
      <SectionHeader
        icon={Network}
        title="Viral Tree"
        subtitle="How deep your referral chains run and who drives the most reach."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard icon={Share2} label="Referred Users" value={tree.total_referred.toLocaleString()} accent="emerald" />
            <StatCard icon={Layers} label="Max Chain Depth" value={tree.max_depth} accent="brand" />
            <StatCard icon={Percent} label="Viral Users" value={`${tree.viral_pct}%`} accent="sky" />
            <StatCard icon={GitBranch} label="Organic Users" value={tree.organic_users.toLocaleString()} accent="amber" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Viral Spread by Generation" className="xl:col-span-1" action={<Badge tone="indigo">depth</Badge>}>
          {loading ? (
            <Skeleton className="h-72" />
          ) : !tree.generations?.length ? (
            <Empty emoji="🌱" title="No referral graph yet." hint="Generations appear once users refer others." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tree.generations} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="users" name="Users" radius={[8, 8, 0, 0]} animationDuration={900}>
                  {tree.generations.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card
          title="Top Referrers by Reach"
          className="xl:col-span-2"
          action={<span className="flex items-center gap-1.5 text-xs text-amber-400"><Trophy size={14} /> downstream</span>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3 pr-4 font-medium">User</th>
                  <th className="pb-3 pr-4 font-medium">Invite Code</th>
                  <th className="pb-3 pr-4 font-medium text-right">Direct</th>
                  <th className="pb-3 pr-4 font-medium text-right">Total Reach</th>
                  <th className="pb-3 font-medium text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="py-3"><Skeleton className="h-5" /></td></tr>
                  ))
                ) : !tree.top_referrers?.length ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-500">
                      <p className="text-3xl">🌳</p>
                      <p className="mt-2 text-sm font-medium">No referrers yet.</p>
                      <p className="text-xs">Reach appears once a user refers at least one friend.</p>
                    </td>
                  </tr>
                ) : (
                  tree.top_referrers.map((r) => (
                    <tr key={r.user_id} className="text-slate-300 transition hover:bg-white/5">
                      <td className="py-3 pr-4 font-mono text-xs">{r.user_id}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-brand-300">{r.invite_code || "—"}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-sky-300">{r.direct}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-emerald-400">{r.downstream}</td>
                      <td className="py-3 text-right text-slate-400">{r.points.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ========================== 3. CONVERSION ========================== */}
      <SectionHeader
        icon={Percent}
        title="Conversion"
        subtitle="How efficiently links turn into referrals — and how fast."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard icon={Share2} label="Click-Through" value={`${conv.rates.click_through}%`} accent="sky" />
            <StatCard icon={Percent} label="Click → Referral" value={`${conv.rates.attribution}%`} accent="emerald" />
            <StatCard icon={Network} label="End-to-End" value={`${conv.rates.end_to_end}%`} accent="brand" />
            <StatCard icon={Timer} label="Median Time-to-Convert" value={fmtDuration(ttc?.median_seconds)} accent="amber" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          title="Time to Convert"
          className="xl:col-span-1"
          action={<Badge tone="slate">{ttc?.sample_size ?? 0} samples</Badge>}
        >
          {loading ? (
            <Skeleton className="h-72" />
          ) : !ttc?.sample_size ? (
            <Empty emoji="⏱️" title="No conversions to time yet." hint="Needs a click followed by a referral on the same link." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ttc.buckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="count" name="Referrals" radius={[8, 8, 0, 0]} animationDuration={900} fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Conversion by Country" className="xl:col-span-2" action={<Badge tone="blue">clicks → referrals</Badge>}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Country</th>
                  <th className="pb-3 pr-4 font-medium text-right">Clicks</th>
                  <th className="pb-3 pr-4 font-medium text-right">Referrals</th>
                  <th className="pb-3 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={4} className="py-3"><Skeleton className="h-5" /></td></tr>
                  ))
                ) : !conv.by_country?.length ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-slate-500">
                      <p className="text-3xl">🌍</p>
                      <p className="mt-2 text-sm font-medium">No conversion data yet.</p>
                    </td>
                  </tr>
                ) : (
                  conv.by_country.map((c) => (
                    <tr key={c.country} className="text-slate-300 transition hover:bg-white/5">
                      <td className="py-3 pr-4">{c.country}</td>
                      <td className="py-3 pr-4 text-right text-slate-400">{c.clicks}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-emerald-400">{c.attributed}</td>
                      <td className="py-3 text-right font-semibold text-sky-300">
                        {c.rate == null ? "—" : `${c.rate}%`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Empty({ emoji, title, hint }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-slate-500">
      <span className="text-4xl">{emoji}</span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  );
}
