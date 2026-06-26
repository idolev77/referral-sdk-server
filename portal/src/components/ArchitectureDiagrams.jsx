import { Database, GitBranch, Layers, Workflow } from "lucide-react";
import MermaidDiagram from "./MermaidDiagram.jsx";

const DIAGRAMS = [
  {
    id: "erd",
    title: "Entity Relationship Diagram (ERD)",
    icon: Database,
    badge: "erDiagram",
    desc: "Database schema from models.py — four tables, all foreign keys cascade from PROJECTS (multi-tenant isolation).",
    code: `erDiagram
    PROJECTS ||--o{ USERS : owns
    PROJECTS ||--o{ REFERRAL_EVENTS : logs
    PROJECTS ||--o{ CONFIG_CHANGES : audits

    PROJECTS {
        int id PK
        string project_id UK
        string api_key UK
        string name
        int points_per_referral
        bool fraud_detection_enabled
        int rate_limit_per_minute
        int welcome_bonus
        int max_referrals_per_user
        datetime created_at
        datetime updated_at
    }
    USERS {
        int id PK
        int project_pk FK
        string user_id
        int points_balance
        string country
        string invite_code UK
        string referred_by
        datetime last_daily_claim_at
        datetime created_at
        datetime updated_at
    }
    REFERRAL_EVENTS {
        int id PK
        int project_pk FK
        string event_type
        string invite_code
        string user_id
        string ip_address
        string country
        int points_delta
        text meta
        datetime created_at
    }
    CONFIG_CHANGES {
        int id PK
        int project_pk FK
        string field
        string old_value
        string new_value
        datetime changed_at
    }`,
  },
  {
    id: "state",
    title: "Referral Lifecycle — State Diagram",
    icon: Workflow,
    badge: "stateDiagram-v2",
    desc: "The states a referral moves through, driven by real event types (generated → click → install → attributed → claim) plus the anti-fraud block branch.",
    code: `stateDiagram-v2
    direction LR
    [*] --> Generated : POST /referral/generate

    Generated --> Clicked : GET /i/{code}
    Clicked --> Installed : track stage=install
    Installed --> Attributed : track stage=attributed
    Generated --> Attributed : /i/{code}/open web attribution

    Attributed --> Rewarded : inviter += points_per_referral
    Rewarded --> Claimed : POST /referral/claim
    Claimed --> [*]

    Clicked --> Blocked : rate limit exceeded 429
    Installed --> Blocked : rate limit exceeded 429
    Blocked --> [*] : event logged

    note right of Rewarded
        Redis balance cache invalidated
        admin dashboards refreshed
    end note`,
  },
  {
    id: "architecture",
    title: "System Architecture",
    icon: Layers,
    badge: "graph TB",
    desc: "End-to-end topology — clients, the Flask app factory (blueprints + security gates), and the data layer (PostgreSQL + Redis + Geo-IP).",
    code: `graph TB
    subgraph clients[Clients]
        SDK["Client SDK<br/>mobile / web"]
        REF["Referee Browser"]
        PORTAL["Developer Portal<br/>React + Vite"]
    end

    subgraph server[Flask App Factory]
        SEC{{"require_credentials<br/>x-api-key · x-project-id"}}
        RL{{"rate_limit<br/>anti-fraud"}}
        RB["referral_bp<br/>/api/referral/*"]
        AB["admin_bp<br/>/api/admin/*"]
        INV["Invite Pages<br/>/i/code · /open"]
        GEO["Geo-IP Service"]
    end

    subgraph data[Data Layer]
        PG[("PostgreSQL<br/>projects · users<br/>events · config")]
        REDIS[("Redis<br/>cache + rate limit")]
    end

    SDK -->|REST + API key| SEC
    PORTAL -->|Admin API| SEC
    REF -->|tap invite link| INV

    SEC --> RL
    RL --> RB
    SEC --> AB

    RB --> PG
    AB --> PG
    INV --> PG
    RB --> GEO
    INV --> GEO

    RB --> REDIS
    RL --> REDIS
    AB -->|cached aggregates| REDIS
    AB -.->|Remote Config| SDK

    style SDK fill:#1e293b,stroke:#6366f1,color:#e2e8f0
    style PORTAL fill:#1e293b,stroke:#10b981,color:#e2e8f0
    style REF fill:#1e293b,stroke:#94a3b8,color:#e2e8f0
    style PG fill:#0f172a,stroke:#3b82f6,color:#e2e8f0
    style REDIS fill:#0f172a,stroke:#ef4444,color:#e2e8f0
    style GEO fill:#0f172a,stroke:#10b981,color:#e2e8f0`,
  },
];

export default function ArchitectureDiagrams() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/10 border border-indigo-500/30 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/20 rounded-xl">
            <GitBranch size={28} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Project Diagrams</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Live Mermaid.js diagrams generated from the real codebase — the database{" "}
              <strong className="text-slate-200">ERD</strong>, the referral{" "}
              <strong className="text-slate-200">state machine</strong>, and the full{" "}
              <strong className="text-slate-200">system architecture</strong>. Rendered client-side so they stay in sync with the spec.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {DIAGRAMS.map((d) => (
            <span key={d.id} className="text-xs bg-ink-800 border border-indigo-500/30 text-indigo-300 rounded-full px-3 py-1 font-mono">
              {d.badge}
            </span>
          ))}
        </div>
      </div>

      {/* Diagram cards */}
      {DIAGRAMS.map(({ id, title, icon: Icon, badge, desc, code }) => (
        <div key={id} className="rounded-xl border border-ink-700 bg-ink-850 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon size={18} className="text-indigo-400" />
              <div>
                <h2 className="font-semibold text-white">{title}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            </div>
            <span className="hidden sm:block text-xs font-mono bg-ink-900 border border-ink-700 text-slate-500 rounded px-2 py-1 shrink-0">
              {badge}
            </span>
          </div>
          <div className="p-5 bg-ink-900 min-h-[180px]">
            <MermaidDiagram code={code} />
          </div>
        </div>
      ))}
    </div>
  );
}
