/**
 * App shell — sleek sidebar, theme toggle and routed content area.
 */
import React, { useState } from "react";
import {
  FlaskConical,
  Globe2,
  LayoutDashboard,
  Moon,
  Rocket,
  SlidersHorizontal,
  Sun,
  TrendingUp,
  BookOpen,
} from "lucide-react";

import DashboardOverview from "./components/DashboardOverview.jsx";
import GeoAndStability from "./components/GeoAndStability.jsx";
import CampaignSettings from "./components/CampaignSettings.jsx";
import GrowthSimulator from "./components/GrowthSimulator.jsx";
import SdkPlayground from "./components/SdkPlayground.jsx";
import IntegrationGuide from "./components/IntegrationGuide.jsx";

const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, Component: DashboardOverview },
  { id: "geo", label: "Demographics & Stability", icon: Globe2, Component: GeoAndStability },
  { id: "rules", label: "Campaign Manager", icon: SlidersHorizontal, Component: CampaignSettings },
  { id: "simulator", label: "Growth Simulator", icon: TrendingUp, Component: GrowthSimulator },
  { id: "playground", label: "SDK Playground", icon: FlaskConical, Component: SdkPlayground },
  { id: "guide", label: "Integration Guide", icon: BookOpen, Component: IntegrationGuide },
];

export default function App() {
  const [active, setActive] = useState("overview");
  const [dark, setDark] = useState(true);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const Active = NAV.find((n) => n.id === active)?.Component ?? DashboardOverview;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-ink-850/60 p-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-500 text-white shadow-glow">
            <Rocket size={20} />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Virality SDK</p>
            <p className="text-xs text-slate-500">Developer Portal</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active === id
                  ? "bg-brand-500/15 text-brand-300 shadow-glow"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <Icon size={18} />
              <span className="text-left">{label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Demo Project</p>
          <p className="font-mono text-[11px] text-slate-500">proj_demo_local</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-ink-900/70 px-5 py-3 backdrop-blur-xl lg:px-8">
          {/* Mobile nav */}
          <div className="flex items-center gap-2 lg:hidden">
            {NAV.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`rounded-lg p-2 ${
                  active === id ? "bg-brand-500/20 text-brand-300" : "text-slate-400"
                }`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
          <div className="hidden text-sm text-slate-400 lg:block">
            {NAV.find((n) => n.id === active)?.label}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> API Connected
            </span>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/5"
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8">
          <Active />
        </main>
      </div>
    </div>
  );
}
