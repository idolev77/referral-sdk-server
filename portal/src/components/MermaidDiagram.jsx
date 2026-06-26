import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "transparent",
    primaryColor: "#312e81",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#6366f1",
    lineColor: "#64748b",
    secondaryColor: "#1e293b",
    tertiaryColor: "#0f172a",
    edgeLabelBackground: "#1e293b",
    clusterBkg: "#1e293b",
    titleColor: "#c4b5fd",
    actorBkg: "#1e293b",
    actorBorder: "#6366f1",
    actorTextColor: "#e2e8f0",
    activationBkgColor: "#312e81",
    activationBorderColor: "#818cf8",
    signalColor: "#94a3b8",
    signalTextColor: "#94a3b8",
    noteBkgColor: "#0f172a",
    noteTextColor: "#e2e8f0",
    noteBorderColor: "#334155",
    stateLabelColor: "#e2e8f0",
    stateTextColor: "#e2e8f0",
    fillType0: "#1e293b",
    fillType1: "#0f172a",
  },
});

let _uid = 0;

export default function MermaidDiagram({ code, className = "" }) {
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(null);
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    setErr(null);
    setSvg("");
    const id = `mmd-${++_uid}`;

    mermaid
      .render(id, code.trim())
      .then(({ svg: rendered }) => {
        if (liveRef.current) setSvg(rendered);
      })
      .catch((e) => {
        if (liveRef.current) setErr(String(e));
      });

    return () => {
      liveRef.current = false;
    };
  }, [code]);

  if (err)
    return (
      <pre className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 overflow-x-auto">
        {err}
      </pre>
    );

  if (!svg)
    return (
      <div className="flex items-center justify-center py-10 text-slate-500 text-sm animate-pulse">
        Rendering diagram…
      </div>
    );

  return (
    <div
      className={`flex justify-center overflow-x-auto py-2 [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:rounded ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
