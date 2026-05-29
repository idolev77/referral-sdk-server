/** Small reusable UI primitives shared across portal screens. */
import React from "react";

export function Card({ title, action, className = "", children }) {
  return (
    <section className={`card p-5 animate-fade-up ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h3 className="card-title">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, delta, accent = "brand" }) {
  const accents = {
    brand: "from-brand-500/20 to-brand-500/0 text-brand-400",
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
    sky: "from-sky-500/20 to-sky-500/0 text-sky-400",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-400",
  };
  return (
    <div className="card relative overflow-hidden p-5 animate-fade-up">
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accents[accent]} blur-xl`}
      />
      <div className="flex items-center justify-between">
        <span className="card-title">{label}</span>
        {Icon && (
          <span className={`rounded-xl bg-white/5 p-2 ${accents[accent]}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight text-white dark:text-white">
        {value}
      </div>
      {delta != null && (
        <div
          className={`mt-1 text-xs font-medium ${
            delta >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last week
        </div>
      )}
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-500/15 text-slate-300",
    green: "bg-emerald-500/15 text-emerald-400",
    blue: "bg-sky-500/15 text-sky-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-rose-500/15 text-rose-400",
    indigo: "bg-brand-500/15 text-brand-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

export const CHART_COLORS = [
  "#6366f1", "#22d3ee", "#34d399", "#f59e0b",
  "#f43f5e", "#a78bfa", "#38bdf8", "#fb7185",
  "#4ade80", "#fbbf24",
];
