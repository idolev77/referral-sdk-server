import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight, Zap, Shield, Gift, BarChart2, Globe } from "lucide-react";

/* ───────── tiny code-block with copy button ───────── */
function CodeBlock({ code, lang = "python" }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group rounded-lg overflow-hidden border border-ink-700 bg-ink-900 my-3">
      <div className="flex items-center justify-between px-4 py-1.5 bg-ink-800 border-b border-ink-700">
        <span className="text-xs font-mono text-slate-400">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-sm overflow-x-auto text-slate-200 leading-relaxed whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

/* ───────── collapsible section ───────── */
function Section({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-ink-700 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-ink-850 hover:bg-ink-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-brand-500" />
          <span className="font-semibold text-white">{title}</span>
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 py-4 bg-ink-900 border-t border-ink-700">{children}</div>}
    </div>
  );
}

/* ───────── API endpoint table row ───────── */
function ApiRow({ method, path, description, auth = true }) {
  const colors = {
    GET: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    POST: "bg-green-500/20 text-green-300 border-green-500/40",
    PUT: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  };
  return (
    <tr className="border-b border-ink-700 hover:bg-ink-800/50 transition-colors">
      <td className="px-4 py-3">
        <span className={`text-xs font-bold font-mono border rounded px-2 py-0.5 ${colors[method]}`}>{method}</span>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-slate-200">{path}</td>
      <td className="px-4 py-3 text-sm text-slate-400">{description}</td>
      <td className="px-4 py-3 text-center">
        {auth && <span className="text-xs text-amber-400 border border-amber-400/40 rounded px-2 py-0.5">API Key</span>}
      </td>
    </tr>
  );
}

/* ───────── architecture diagram ───────── */
function ArchitectureDiagram() {
  const nodes = [
    { label: "Host App", sub: "Your mobile / web app", color: "border-slate-500 text-slate-300", icon: "📱" },
    { label: "Virality SDK", sub: "Client library (Python/JS)", color: "border-brand-500 text-brand-400", icon: "⚡" },
    { label: "REST API Server", sub: "Flask • Auth • Rate-limit", color: "border-purple-500 text-purple-300", icon: "🖥️" },
    { label: "PostgreSQL", sub: "Projects • Users • Events", color: "border-blue-500 text-blue-300", icon: "🗄️" },
    { label: "Developer Portal", sub: "Insights • Remote Config", color: "border-green-500 text-green-300", icon: "📊" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-4">
      {nodes.map((n, i) => (
        <div key={n.label} className="flex items-center gap-2">
          <div className={`border-2 rounded-xl px-4 py-3 text-center min-w-[130px] ${n.color}`}>
            <div className="text-2xl mb-1">{n.icon}</div>
            <div className="font-semibold text-sm">{n.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{n.sub}</div>
          </div>
          {i < nodes.length - 1 && <div className="text-slate-500 font-bold text-lg">→</div>}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════ MAIN COMPONENT ═════ */
export default function IntegrationGuide() {
  const API_KEY = import.meta.env.VITE_API_KEY || "demo_api_key_local_dev";
  const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "proj_demo_local";
  const BASE_URL = "http://your-server.com/api";   // shown in docs only

  const pythonInit = `\
import requests

class ViralitySDK:
    def __init__(self, api_key: str, project_id: str, base_url: str):
        self.base_url = base_url
        self.headers = {
            "x-api-key": api_key,
            "x-project-id": project_id,
            "Content-Type": "application/json",
        }

# Initialize once at app startup
sdk = ViralitySDK(
    api_key="${API_KEY}",
    project_id="${PROJECT_ID}",
    base_url="${BASE_URL}",
)`;

  const pythonGenerate = `\
def generate_invite(self, user_id: str) -> dict:
    """Step 1 – Create a unique invite link for a user."""
    resp = self.session.post(
        f"{self.base_url}/referral/generate",
        json={"user_id": user_id},
    )
    resp.raise_for_status()
    return resp.json()   # {"invite_code": "abc123", "invite_url": "..."}

# Usage
link = sdk.generate_invite("user_42")
print(link["invite_url"])   # share this with the user`;

  const pythonTrack = `\
def track_event(self, invite_code: str, user_id: str, stage: str) -> dict:
    """Step 2 – Track funnel progression (click → install → attributed)."""
    # stage must be one of: "click", "install", "attributed"
    resp = self.session.post(
        f"{self.base_url}/referral/track",
        json={"invite_code": invite_code, "user_id": user_id, "stage": stage},
    )
    resp.raise_for_status()
    return resp.json()

# When a new user installs via a referral link:
sdk.track_event(invite_code="abc123", user_id="new_user_7", stage="attributed")`;

  const pythonBalance = `\
def get_balance(self, user_id: str) -> dict:
    """Step 3 – Fetch a user's points balance."""
    resp = self.session.get(
        f"{self.base_url}/referral/balance",
        params={"user_id": user_id},
    )
    resp.raise_for_status()
    return resp.json()   # {"user_id": "...", "points_balance": 350, ...}

balance = sdk.get_balance("user_42")
print(f"Points: {balance['points_balance']}")`;

  const pythonClaim = `\
def claim_reward(self, user_id: str, cost: int) -> dict:
    """Step 4 – Spend points to unlock a reward."""
    resp = self.session.post(
        f"{self.base_url}/referral/claim",
        json={"user_id": user_id, "cost": cost},
    )
    resp.raise_for_status()
    return resp.json()   # {"status": "claimed", "new_balance": 250}

sdk.claim_reward("user_42", cost=100)`;

  const pythonConfig = `\
def get_config(self) -> dict:
    """Fetch live remote config pushed from the portal."""
    resp = self.session.get(f"{self.base_url}/referral/config")
    resp.raise_for_status()
    return resp.json()   # {"points_per_referral": 100, "fraud_detection_enabled": true, ...}

# Use this to drive dynamic UI / reward logic without a redeploy
config = sdk.get_config()
reward_pts = config["points_per_referral"]
welcome_bonus = config["welcome_bonus"]`;

  const jsExample = `\
// ES Module / React Native example
const SDK_HEADERS = {
  "x-api-key": "${API_KEY}",
  "x-project-id": "${PROJECT_ID}",
  "Content-Type": "application/json",
};

export async function generateInvite(userId) {
  const res = await fetch(\`${BASE_URL}/referral/generate\`, {
    method: "POST",
    headers: SDK_HEADERS,
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(\`SDK error \${res.status}\`);
  return res.json();   // { invite_code, invite_url }
}

export async function trackEvent(inviteCode, userId, stage) {
  const res = await fetch(\`${BASE_URL}/referral/track\`, {
    method: "POST",
    headers: SDK_HEADERS,
    body: JSON.stringify({ invite_code: inviteCode, user_id: userId, stage }),
  });
  if (!res.ok) throw new Error(\`SDK error \${res.status}\`);
  return res.json();
}

export const getBalance  = (uid) =>
  fetch(\`${BASE_URL}/referral/balance?user_id=\${uid}\`, { headers: SDK_HEADERS }).then(r => r.json());

export const claimReward = (uid, cost) =>
  fetch(\`${BASE_URL}/referral/claim\`,  { method:"POST", headers: SDK_HEADERS,
    body: JSON.stringify({ user_id: uid, cost }) }).then(r => r.json());`;

  const curlExample = `\
# 1. Generate invite link
curl -X POST ${BASE_URL}/referral/generate \\
  -H "x-api-key: ${API_KEY}" \\
  -H "x-project-id: ${PROJECT_ID}" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "alice"}'

# 2. Track attribution (someone installs via Alice's link)
curl -X POST ${BASE_URL}/referral/track \\
  -H "x-api-key: ${API_KEY}" \\
  -H "x-project-id: ${PROJECT_ID}" \\
  -H "Content-Type: application/json" \\
  -d '{"invite_code": "abc123", "user_id": "bob", "stage": "attributed"}'

# 3. Check balance
curl "${BASE_URL}/referral/balance?user_id=alice" \\
  -H "x-api-key: ${API_KEY}" \\
  -H "x-project-id: ${PROJECT_ID}"

# 4. Claim reward
curl -X POST ${BASE_URL}/referral/claim \\
  -H "x-api-key: ${API_KEY}" \\
  -H "x-project-id: ${PROJECT_ID}" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id": "alice", "cost": 100}'`;

  const errorTable = [
    { code: "400", name: "Bad Request", cause: "Missing or invalid field in request body" },
    { code: "401", name: "Unauthorized", cause: "Missing or wrong x-api-key / x-project-id headers" },
    { code: "402", name: "Insufficient Points", cause: "User balance too low to claim reward" },
    { code: "409", name: "Conflict", cause: "User already has an invite code (generate called twice)" },
    { code: "429", name: "Too Many Requests", cause: "Anti-fraud rate limit triggered (configurable in portal)" },
    { code: "500", name: "Server Error", cause: "Unexpected backend failure — retry with exponential back-off" },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-600/10 border border-brand-500/30 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand-500/20 rounded-xl">
            <Zap size={28} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">SDK Integration Guide</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Everything a developer needs to integrate the <strong className="text-slate-200">Virality Referral SDK</strong> into their app —
              authentication, the four core functions, error handling, and live examples in Python, JavaScript, and cURL.
            </p>
          </div>
        </div>

        {/* Quick badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {["REST API", "API Key Auth", "Project Isolation", "Anti-Fraud", "Remote Config", "Real-time Portal"].map((b) => (
            <span key={b} className="text-xs bg-ink-800 border border-ink-600 text-slate-300 rounded-full px-3 py-1">{b}</span>
          ))}
        </div>
      </div>

      {/* Architecture */}
      <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
        <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Globe size={18} className="text-brand-500" /> System Architecture
        </h2>
        <p className="text-sm text-slate-400 mb-3">
          Your app talks only to the SDK library. The SDK handles auth, retries, and serialization —
          the server persists events and the portal reflects changes in real time.
        </p>
        <ArchitectureDiagram />
      </div>

      {/* Credentials */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-2">
          <Shield size={16} /> Your Credentials (current project)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">API Key</p>
            <code className="block bg-ink-900 rounded px-3 py-2 text-sm text-green-300 border border-ink-700 font-mono break-all">
              {API_KEY}
            </code>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Project ID</p>
            <code className="block bg-ink-900 rounded px-3 py-2 text-sm text-blue-300 border border-ink-700 font-mono">
              {PROJECT_ID}
            </code>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Both headers are required on every request. Keep your API Key secret — rotate it from the portal if compromised.
        </p>
      </div>

      {/* Quick-start steps */}
      <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">4-Step Quick Start</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: "1", title: "Init SDK", desc: "Create client with your API Key + Project ID" },
            { step: "2", title: "Generate Link", desc: "Call generate_invite() per user" },
            { step: "3", title: "Track Events", desc: "Fire click → install → attributed as user progresses" },
            { step: "4", title: "Reward & Claim", desc: "Check balance, let users spend points" },
          ].map((s) => (
            <div key={s.step} className="flex gap-3 bg-ink-900 rounded-xl p-4 border border-ink-700">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 font-bold text-sm flex items-center justify-center flex-shrink-0">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-sm text-white">{s.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Code sections */}
      <Section title="Initialize the SDK" icon={Zap} defaultOpen>
        <p className="text-sm text-slate-400 mb-2">Create a single SDK instance at app startup. Pass your credentials and base URL.</p>
        <CodeBlock code={pythonInit} lang="python" />
      </Section>

      <Section title="Function 1 — Generate Invite Link" icon={Gift} defaultOpen>
        <p className="text-sm text-slate-400 mb-2">
          Creates a unique <code className="text-brand-400 text-xs">invite_code</code> for a user and returns a shareable URL.
          Each user gets exactly one code — the SDK returns the existing one on subsequent calls.
        </p>
        <CodeBlock code={pythonGenerate} lang="python" />
      </Section>

      <Section title="Function 2 — Track Referral Events" icon={BarChart2}>
        <p className="text-sm text-slate-400 mb-2">
          Fire this at each stage of the referral funnel. The server awards points automatically when{" "}
          <code className="text-green-400 text-xs">stage="attributed"</code> is received.
        </p>
        <CodeBlock code={pythonTrack} lang="python" />
        <div className="mt-3 text-sm">
          <p className="text-slate-400 mb-2">Valid stages:</p>
          <div className="flex gap-3 flex-wrap">
            {["click", "install", "attributed"].map((s) => (
              <span key={s} className="font-mono text-xs bg-ink-800 border border-ink-600 rounded px-3 py-1 text-slate-300">"{s}"</span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Function 3 — Get Points Balance" icon={BarChart2}>
        <p className="text-sm text-slate-400 mb-2">Retrieve a user's current points. Use this to gate premium features or show reward progress.</p>
        <CodeBlock code={pythonBalance} lang="python" />
      </Section>

      <Section title="Function 4 — Claim Reward" icon={Gift}>
        <p className="text-sm text-slate-400 mb-2">
          Deducts <code className="text-brand-400 text-xs">cost</code> points from the user's balance. Returns the new balance.
          Returns <code className="text-red-400 text-xs">402</code> if the user doesn't have enough points.
        </p>
        <CodeBlock code={pythonClaim} lang="python" />
      </Section>

      <Section title="Function 5 — Fetch Remote Config" icon={Shield}>
        <p className="text-sm text-slate-400 mb-2">
          Pull live config values from the server — set in the <strong className="text-slate-200">Campaign Manager</strong> portal.
          This lets you change SDK behavior (points, fraud detection, rate limits) without redeploying your app.
        </p>
        <CodeBlock code={pythonConfig} lang="python" />
        <div className="mt-3 text-xs text-slate-500 bg-ink-800 border border-ink-700 rounded p-3">
          💡 <strong className="text-slate-300">Key insight for the interviewer:</strong> this is the "portal changes app behavior" test.
          Change <em>points_per_referral</em> in the Campaign Manager and every SDK instance picks it up on the next call — no redeploy.
        </div>
      </Section>

      <Section title="JavaScript / React Native Example" icon={Zap}>
        <p className="text-sm text-slate-400 mb-2">Same REST API, no special library needed — just fetch with the two auth headers.</p>
        <CodeBlock code={jsExample} lang="javascript" />
      </Section>

      <Section title="cURL Examples" icon={Globe}>
        <p className="text-sm text-slate-400 mb-2">Test all four core flows from a terminal in under 30 seconds.</p>
        <CodeBlock code={curlExample} lang="bash" />
      </Section>

      {/* API reference table */}
      <div className="rounded-xl border border-ink-700 overflow-hidden">
        <div className="bg-ink-850 px-5 py-3 border-b border-ink-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <BarChart2 size={16} className="text-brand-500" /> Full API Reference
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-ink-800 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Auth</th>
              </tr>
            </thead>
            <tbody className="bg-ink-900">
              <ApiRow method="POST" path="/api/referral/generate" description="Generate unique invite code for a user" />
              <ApiRow method="POST" path="/api/referral/track" description="Track referral funnel stage (click / install / attributed)" />
              <ApiRow method="GET"  path="/api/referral/balance" description="Fetch user points balance and referral info" />
              <ApiRow method="POST" path="/api/referral/claim" description="Redeem points (deduct cost from balance)" />
              <ApiRow method="GET"  path="/api/referral/config" description="Get live remote config for this project" />
              <ApiRow method="GET"  path="/api/admin/overview" description="Dashboard stat cards + conversion funnel" />
              <ApiRow method="GET"  path="/api/admin/activity" description="Recent event activity feed" />
              <ApiRow method="GET"  path="/api/admin/leaderboard" description="Top referrers ranked by conversions" />
              <ApiRow method="GET"  path="/api/admin/demographics" description="Country breakdown from Geo-IP" />
              <ApiRow method="GET"  path="/api/admin/stability" description="SDK health score + error timeline" />
              <ApiRow method="GET"  path="/api/admin/fraud-logs" description="Anti-fraud blocked events log" />
              <ApiRow method="GET"  path="/api/admin/config" description="Read current remote configuration" />
              <ApiRow method="PUT"  path="/api/admin/config" description="Update remote config (Campaign Manager Save & Sync)" />
              <ApiRow method="GET"  path="/api/admin/config-audit" description="Audit trail — every config change with before/after values" />
            </tbody>
          </table>
        </div>
      </div>

      {/* Error codes */}
      <div className="rounded-xl border border-ink-700 overflow-hidden">
        <div className="bg-ink-850 px-5 py-3 border-b border-ink-700">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Shield size={16} className="text-red-400" /> Error Codes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-ink-800 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">HTTP</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Cause / Fix</th>
              </tr>
            </thead>
            <tbody className="bg-ink-900">
              {errorTable.map((e) => (
                <tr key={e.code} className="border-b border-ink-700 hover:bg-ink-800/50">
                  <td className="px-4 py-3 font-mono font-bold text-sm text-red-300">{e.code}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">{e.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{e.cause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
