/**
 * CampaignSettings
 *
 * Interactive remote-rules editor: toggle fraud detection, set points per
 * referral and adjust the rate limit. "Save & Sync" persists to PostgreSQL via
 * PUT /api/admin/config.
 */
import React, { useEffect, useState } from "react";
import {
  Check,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Gauge,
} from "lucide-react";

import { getConfig, updateConfig } from "../api/api";
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

  useEffect(() => {
    let alive = true;
    getConfig().then((res) => {
      if (!alive) return;
      setConfig(res.config);
      setDraft(res.config);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dirty =
    draft &&
    config &&
    (draft.points_per_referral !== config.points_per_referral ||
      draft.fraud_detection_enabled !== config.fraud_detection_enabled ||
      draft.rate_limit_per_minute !== config.rate_limit_per_minute);

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
    });
    setConfig(res.config);
    setDraft(res.config);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const reset = () => {
    setDraft(config);
    setSaved(false);
  };

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
    </div>
  );
}
