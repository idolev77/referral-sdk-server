/**
 * CampaignSettings
 *
 * Interactive remote-rules editor: toggle fraud detection, set points per
 * referral, adjust rate limit, welcome bonus, and max referrals.
 * "Save & Sync" persists to PostgreSQL via PUT /api/admin/config.
 * Config Audit Log section shows every historical change.
 */
import React, { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Gauge,
  Gift,
  Users,
  History,
  ArrowRight,
} from "lucide-react";

import { getConfig, updateConfig, getConfigAudit } from "../api/api";
import { Badge, Card, Skeleton } from "./ui";

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
        checked ? "bg-brand-500" : "bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function CampaignSettings() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAudit = () => {
    setAuditLoading(true);
    getConfigAudit(30)
      .then((res) => setAudit(res.audit || []))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    let alive = true;
    getConfig()
      .then((res) => {
        if (!alive) return;
        setConfig(res.config);
        setDraft(res.config);
      })
      .catch(() => {
        if (alive) setError("Could not load project config from backend.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    fetchAudit();
    return () => { alive = false; };
  }, []);

  const TRACKED = ["points_per_referral", "fraud_detection_enabled", "rate_limit_per_minute", "welcome_bonus", "max_referrals_per_user"];
  const dirty =
    draft &&
    config &&
    TRACKED.some((k) => String(draft[k]) !== String(config[k]));

  const patch = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await updateConfig({
      points_per_referral: Number(draft.points_per_referral),
      fraud_detection_enabled: draft.fraud_detection_enabled,
      rate_limit_per_minute: Number(draft.rate_limit_per_minute),
      welcome_bonus: Number(draft.welcome_bonus),
      max_referrals_per_user: Number(draft.max_referrals_per_user),
    });
    setConfig(res.config);
    setDraft(res.config);
    setSaving(false);
    setSaved(true);
    fetchAudit(); // refresh audit log after save
    setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    setDraft(config);
    setSaved(false);
  };

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-2xl">⚠️</p>
        <p className="font-semibold text-rose-400">{error}</p>
        <p className="text-xs text-slate-500">Make sure the Flask backend is running on port 5000.</p>
      </div>
    );
  }

  if (loading || !draft) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Remote Rules & Campaign Manager</h1>
          <p className="text-sm text-slate-400">
            Changes sync instantly to every SDK instance via PostgreSQL.
          </p>
        </div>
        <Badge tone="indigo">
          <Sparkles size={12} /> {draft.project_id}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Fraud detection */}
        <Card title="Fraud Detection">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                <ShieldCheck size={20} />
              </span>
              <div>
                <p className="font-semibold text-white">
                  {draft.fraud_detection_enabled ? "Enabled" : "Disabled"}
                </p>
                <p className="text-xs text-slate-400">
                  Redis-backed rate limiting
                </p>
              </div>
            </div>
            <Toggle
              checked={draft.fraud_detection_enabled}
              onChange={(v) => patch("fraud_detection_enabled", v)}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            When enabled, spam and abusive deep-link traffic is throttled per IP
            and logged to the Anti-Fraud panel.
          </p>
        </Card>

        {/* Points per referral */}
        <Card title="Points per Referral">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-500/10 p-2.5 text-brand-400">
              <Sparkles size={20} />
            </span>
            <p className="text-xs text-slate-400">Reward credited on a successful attribution.</p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() =>
                patch("points_per_referral", Math.max(0, Number(draft.points_per_referral) - 10))
              }
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              value={draft.points_per_referral}
              onChange={(e) => patch("points_per_referral", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2 text-center text-2xl font-bold text-white outline-none focus:border-brand-500"
            />
            <button
              onClick={() =>
                patch("points_per_referral", Number(draft.points_per_referral) + 10)
              }
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              +
            </button>
          </div>
        </Card>

        {/* Rate limit slider */}
        <Card title="Rate Limit">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
              <Gauge size={20} />
            </span>
            <p className="text-xs text-slate-400">Max requests / minute / IP on the tracking endpoint.</p>
          </div>
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-400">Threshold</span>
              <span className="text-2xl font-bold text-white">
                {draft.rate_limit_per_minute}
                <span className="ml-1 text-xs font-normal text-slate-500">req/min</span>
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="60"
              value={draft.rate_limit_per_minute}
              onChange={(e) => patch("rate_limit_per_minute", Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-600">
              <span>1</span>
              <span>30</span>
              <span>60</span>
            </div>
          </div>
        </Card>

        {/* Welcome Bonus */}
        <Card title="Welcome Bonus">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-pink-500/10 p-2.5 text-pink-400">
              <Gift size={20} />
            </span>
            <p className="text-xs text-slate-400">Points awarded to a user when first referred by another user.</p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => patch("welcome_bonus", Math.max(0, Number(draft.welcome_bonus) - 10))}
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              value={draft.welcome_bonus ?? 0}
              onChange={(e) => patch("welcome_bonus", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2 text-center text-2xl font-bold text-white outline-none focus:border-brand-500"
            />
            <button
              onClick={() => patch("welcome_bonus", Number(draft.welcome_bonus) + 10)}
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              +
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Set to 0 to disable welcome bonus.</p>
        </Card>

        {/* Max referrals per user */}
        <Card title="Max Referrals / User">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
              <Users size={20} />
            </span>
            <p className="text-xs text-slate-400">Hard cap on how many successful referrals one user can earn rewards for.</p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => patch("max_referrals_per_user", Math.max(0, Number(draft.max_referrals_per_user) - 1))}
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              value={draft.max_referrals_per_user ?? 0}
              onChange={(e) => patch("max_referrals_per_user", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-2 text-center text-2xl font-bold text-white outline-none focus:border-brand-500"
            />
            <button
              onClick={() => patch("max_referrals_per_user", Number(draft.max_referrals_per_user) + 1)}
              className="h-10 w-10 rounded-lg border border-white/10 text-lg text-slate-300 transition hover:bg-white/5"
            >
              +
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">0 = unlimited referrals per user.</p>
        </Card>
      </div>

      {/* Save bar */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="text-sm text-slate-400">
          {dirty ? (
            <span className="text-amber-400">● Unsaved changes</span>
          ) : (
            <span>All changes synced</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw size={15} /> Reset
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Syncing…
              </>
            ) : saved ? (
              <>
                <Check size={16} /> Synced
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Save & Sync
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Config Audit Log ─────────────────────────────────── */}
      <div className="rounded-xl border border-ink-700 overflow-hidden">
        <div className="flex items-center justify-between bg-ink-850 px-5 py-3 border-b border-ink-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <History size={16} className="text-brand-500" /> Config Change Audit Log
          </h2>
          <button
            onClick={fetchAudit}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {auditLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : audit.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No config changes recorded yet. Save & Sync to create the first audit entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-ink-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Field</th>
                  <th className="px-4 py-3">Before</th>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3">After</th>
                  <th className="px-4 py-3">Changed At (UTC)</th>
                </tr>
              </thead>
              <tbody className="bg-ink-900">
                {audit.map((row) => (
                  <tr key={row.id} className="border-b border-ink-700 hover:bg-ink-800/50">
                    <td className="px-4 py-3 font-mono text-sm text-brand-400">{row.field}</td>
                    <td className="px-4 py-3 font-mono text-sm text-red-300 line-through opacity-70">{row.old_value}</td>
                    <td className="px-4 py-3 text-slate-600"><ArrowRight size={14} /></td>
                    <td className="px-4 py-3 font-mono text-sm text-green-300">{row.new_value}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(row.changed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
