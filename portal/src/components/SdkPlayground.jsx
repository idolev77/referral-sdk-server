/**
 * SdkPlayground
 *
 * Interactive live API tester — calls the real Flask SDK endpoints directly
 * from the portal. Shows request inspector + JSON response for each operation.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Code2,
  Gift,
  Play,
} from "lucide-react";
import { claimDailyBonus, generateReferral, getBalance, trackReferral } from "../api/api";
import { Badge, Card } from "./ui";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "proj_demo_local";
const API_KEY = import.meta.env.VITE_API_KEY || "demo_api_key_local_dev";

function JsonDisplay({ data, isError }) {
  return (
    <pre
      className={`mt-3 max-h-52 overflow-auto rounded-xl p-4 text-xs leading-relaxed ${
        isError
          ? "border border-rose-500/20 bg-rose-900/20 text-rose-300"
          : "border border-emerald-500/20 bg-emerald-900/20 text-emerald-300"
      }`}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function RequestInspector({ method, path, body }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-300"
      >
        <Code2 size={11} />
        {open ? "Hide" : "View"} raw request
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <pre className="mt-2 overflow-auto rounded-xl border border-white/5 bg-ink-900/80 p-3 text-xs text-slate-400">
          <span className="text-amber-400">{method}</span>{" "}
          <span className="text-sky-300">/api{path}</span>
          {"\n"}
          <span className="text-slate-500">x-api-key: </span>
          <span className="text-slate-300">{API_KEY}</span>
          {"\n"}
          <span className="text-slate-500">x-project-id: </span>
          <span className="text-slate-300">{PROJECT_ID}</span>
          {body && (
            <>
              {"\n\n"}
              <span className="text-slate-500">{"Body:\n"}</span>
              {JSON.stringify(body, null, 2)}
            </>
          )}
        </pre>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500 transition";

export default function SdkPlayground() {
  // ── Generate ──────────────────────────────────────────────────────────────
  const [genUserId, setGenUserId] = useState("user_alice");
  const [genResult, setGenResult] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState(null);

  // ── Track ─────────────────────────────────────────────────────────────────
  const [trackCode, setTrackCode] = useState("");
  const [trackUserId, setTrackUserId] = useState("user_bob");
  const [trackStage, setTrackStage] = useState("attributed");
  const [trackResult, setTrackResult] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState(null);

  // ── Balance ───────────────────────────────────────────────────────────────
  const [balUserId, setBalUserId] = useState("user_alice");
  const [balResult, setBalResult] = useState(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState(null);

  // ── Daily Bonus ───────────────────────────────────────────────────────────
  const [bonusUserId, setBonusUserId] = useState("user_alice");
  const [bonusResult, setBonusResult] = useState(null);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusError, setBonusError] = useState(null);
  // retryAfter: seconds remaining until next claim (from last 429 response)
  const [retryAfter, setRetryAfter] = useState(null);
  // countdown display (decremented every second while retryAfter > 0)
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);

  // Start / restart the visible countdown timer whenever retryAfter changes.
  useEffect(() => {
    if (retryAfter == null || retryAfter <= 0) {
      setCountdown(null);
      return;
    }
    setCountdown(retryAfter);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [retryAfter]);

  function formatCountdown(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }

  const handleGenerate = async () => {
    setGenLoading(true);
    setGenError(null);
    setGenResult(null);
    try {
      const res = await generateReferral(genUserId.trim());
      setGenResult(res);
      if (res.invite_code) setTrackCode(res.invite_code);
    } catch (e) {
      setGenError(e.response?.data?.error || "Request failed");
    } finally {
      setGenLoading(false);
    }
  };

  const handleTrack = async () => {
    setTrackLoading(true);
    setTrackError(null);
    setTrackResult(null);
    try {
      const res = await trackReferral({
        invite_code: trackCode.trim().toUpperCase(),
        new_user_id: trackUserId.trim(),
        stage: trackStage,
      });
      setTrackResult(res);
    } catch (e) {
      setTrackError(e.response?.data?.error || "Request failed");
    } finally {
      setTrackLoading(false);
    }
  };

  const handleBalance = async () => {
    setBalLoading(true);
    setBalError(null);
    setBalResult(null);
    try {
      const res = await getBalance(balUserId.trim());
      setBalResult(res);
    } catch (e) {
      setBalError(e.response?.data?.error || "Request failed");
    } finally {
      setBalLoading(false);
    }
  };

  const handleDailyBonus = async () => {
    setBonusLoading(true);
    setBonusError(null);
    setBonusResult(null);
    setRetryAfter(null);
    try {
      const res = await claimDailyBonus(bonusUserId.trim());
      setBonusResult(res);
    } catch (e) {
      const data = e.response?.data;
      if (e.response?.status === 429 && data?.retry_after_seconds) {
        setRetryAfter(data.retry_after_seconds);
        setBonusError(data.error || "Already claimed today");
      } else {
        setBonusError(data?.error || "Request failed");
      }
    } finally {
      setBonusLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">SDK Playground</h1>
        <p className="text-sm text-slate-400">
          Call the live SDK API endpoints in real time. Every request hits the
          actual Flask backend and PostgreSQL — nothing is mocked.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ─── Generate ─── */}
        <Card
          title="① Generate Invite Code"
          action={<Badge tone="indigo">POST /referral/generate</Badge>}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                User ID
              </label>
              <input
                value={genUserId}
                onChange={(e) => setGenUserId(e.target.value)}
                className={inputCls}
                placeholder="user_alice"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={genLoading || !genUserId.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              <Play size={14} />
              {genLoading ? "Sending…" : "Send Request"}
            </button>
            {genError && <JsonDisplay data={{ error: genError }} isError />}
            {genResult && (
              <>
                <JsonDisplay data={genResult} />
                {genResult.invite_code && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    <CheckCircle size={13} />
                    Invite code{" "}
                    <span className="font-mono font-bold">
                      {genResult.invite_code}
                    </span>{" "}
                    auto-filled in Track panel ↓
                  </div>
                )}
              </>
            )}
            <RequestInspector
              method="POST"
              path="/referral/generate"
              body={{ user_id: genUserId }}
            />
          </div>
        </Card>

        {/* ─── Track ─── */}
        <Card
          title="② Track Attribution"
          action={<Badge tone="blue">POST /referral/track</Badge>}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Invite Code
              </label>
              <input
                value={trackCode}
                onChange={(e) => setTrackCode(e.target.value.toUpperCase())}
                className={`${inputCls} font-mono`}
                placeholder="ABC12345"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                New User ID
              </label>
              <input
                value={trackUserId}
                onChange={(e) => setTrackUserId(e.target.value)}
                className={inputCls}
                placeholder="user_bob"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Attribution Stage
              </label>
              <select
                value={trackStage}
                onChange={(e) => setTrackStage(e.target.value)}
                className={inputCls}
              >
                <option value="click">click</option>
                <option value="install">install</option>
                <option value="attributed">attributed (credits points)</option>
              </select>
            </div>
            <button
              onClick={handleTrack}
              disabled={
                trackLoading || !trackCode.trim() || !trackUserId.trim()
              }
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              <Play size={14} />
              {trackLoading ? "Sending…" : "Send Request"}
            </button>
            {trackError && <JsonDisplay data={{ error: trackError }} isError />}
            {trackResult && <JsonDisplay data={trackResult} />}
            <RequestInspector
              method="POST"
              path="/referral/track"
              body={{
                invite_code: trackCode,
                new_user_id: trackUserId,
                stage: trackStage,
              }}
            />
          </div>
        </Card>

        {/* ─── Balance ─── */}
        <Card
          title="③ Check Reward Balance"
          action={<Badge tone="amber">GET /referral/balance</Badge>}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                User ID
              </label>
              <input
                value={balUserId}
                onChange={(e) => setBalUserId(e.target.value)}
                className={inputCls}
                placeholder="user_alice"
              />
            </div>
            <button
              onClick={handleBalance}
              disabled={balLoading || !balUserId.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              <Play size={14} />
              {balLoading ? "Sending…" : "Send Request"}
            </button>
            {balError && <JsonDisplay data={{ error: balError }} isError />}
            {balResult && <JsonDisplay data={balResult} />}
            <RequestInspector
              method="GET"
              path={`/referral/balance?user_id=${balUserId}`}
              body={null}
            />
          </div>
        </Card>

        {/* ─── Daily Bonus ─── */}
        <Card
          title="④ Daily Login Bonus"
          action={<Badge tone="green">POST /referral/daily-bonus</Badge>}
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Claim <span className="font-semibold text-emerald-400">+2 points</span> once every 24 hours.
              The cooldown is enforced server-side — changing the device clock has no effect.
            </p>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                User ID
              </label>
              <input
                value={bonusUserId}
                onChange={(e) => setBonusUserId(e.target.value)}
                className={inputCls}
                placeholder="user_alice"
              />
            </div>
            <button
              onClick={handleDailyBonus}
              disabled={bonusLoading || !bonusUserId.trim() || countdown > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Gift size={14} />
              {bonusLoading ? "Claiming…" : "Claim Daily Bonus"}
            </button>

            {/* Countdown banner — shown while cooldown is active */}
            {countdown > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                <span className="text-lg">⏳</span>
                <div>
                  <p className="text-xs font-semibold text-amber-300">
                    Already claimed — next bonus available in
                  </p>
                  <p className="font-mono text-xl font-bold text-white tracking-widest">
                    {formatCountdown(countdown)}
                  </p>
                </div>
              </div>
            )}
            {countdown === 0 && retryAfter != null && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle size={13} />
                Cooldown expired — you can claim again!
              </div>
            )}

            {bonusError && countdown == null && (
              <JsonDisplay data={{ error: bonusError }} isError />
            )}
            {bonusResult && (
              <>
                <JsonDisplay data={bonusResult} />
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  <CheckCircle size={13} />
                  +{bonusResult.points_awarded} points credited! New balance:{" "}
                  <span className="font-bold">{bonusResult.points_balance}</span>
                </div>
              </>
            )}
            <RequestInspector
              method="POST"
              path="/referral/daily-bonus"
              body={{ user_id: bonusUserId }}
            />
          </div>
        </Card>

        {/* ─── How it works ─── */}
        <Card title="How the SDK Flow Works">
          <ol className="space-y-4">
            {[
              {
                n: "1",
                colorBg: "bg-brand-500/15",
                colorText: "text-brand-400",
                title: "Generate",
                text: "Your app calls the SDK, which hits /generate. The server creates a unique invite code and deep link tied to this user.",
              },
              {
                n: "2",
                colorBg: "bg-sky-500/15",
                colorText: "text-sky-400",
                title: "Share",
                text: "The user shares the invite link. Anyone who taps it is routed to your app with the code embedded in the deep link.",
              },
              {
                n: "3",
                colorBg: "bg-emerald-500/15",
                colorText: "text-emerald-400",
                title: "Track",
                text: "On first open, the SDK calls /track with the code. The server attributes the install to the inviter and credits their points balance.",
              },
              {
                n: "4",
                colorBg: "bg-amber-500/15",
                colorText: "text-amber-400",
                title: "Reward",
                text: "The inviter's balance grows server-side. They can check it via /balance and redeem rewards via /claim — all enforced by Redis + PostgreSQL.",
              },
            ].map(({ n, colorBg, colorText, title, text }) => (
              <li key={n} className="flex gap-3">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${colorBg} text-xs font-bold ${colorText}`}
                >
                  {n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-slate-400">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
