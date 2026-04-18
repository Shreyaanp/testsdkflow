import { useEffect, useState } from "react";

type Row = { k: string; v: string };

function safeStringify(v: unknown): string {
  try {
    if (typeof v === "function") return "[function]";
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function DiagnosticsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [bridgeRaw, setBridgeRaw] = useState<string>("(not called)");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const w = window as any;
    const snapshot: Row[] = [
      { k: "UA", v: navigator.userAgent },
      { k: "href", v: location.href },
      { k: "has window.flutter_inappwebview", v: String(typeof w.flutter_inappwebview !== "undefined") },
      { k: "  .callHandler", v: String(typeof w.flutter_inappwebview?.callHandler) },
      { k: "has window.MercleBridge (legacy)", v: String(typeof w.MercleBridge !== "undefined") },
      {
        k: "top-level keys matching /mercle|flutter|bridge/i",
        v: Object.keys(w)
          .filter((k) => /mercle|flutter|bridge|inappwebview/i.test(k))
          .join(", ") || "(none)",
      },
    ];
    setRows(snapshot);
  }, []);

  const tryRefreshToken = async () => {
    setRunning(true);
    const w = window as any;
    try {
      if (typeof w.flutter_inappwebview?.callHandler !== "function") {
        setBridgeRaw("flutter_inappwebview.callHandler is not a function");
        return;
      }
      const result = await w.flutter_inappwebview.callHandler(
        "MercleBridge",
        "refreshToken"
      );
      setBridgeRaw(safeStringify(result));
    } catch (e) {
      setBridgeRaw(
        "THREW: " + (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="card stack">
      <h2>Diagnostics</h2>
      <div className="sub">
        Read this top-to-bottom — tells us whether the bridge is present and
        what <code>refreshToken</code> actually returns.
      </div>
      <div className="kv">
        {rows.map(({ k, v }) => (
          <>
            <div className="k" key={`k-${k}`}>{k}</div>
            <div className="v" key={`v-${k}`}>{v}</div>
          </>
        ))}
      </div>
      <button className="btn secondary" onClick={tryRefreshToken} disabled={running}>
        {running ? "Calling bridge…" : "Call MercleBridge.refreshToken"}
      </button>
      <div className="alert info">
        <div style={{ marginBottom: 6, color: "var(--ok)" }}>raw bridge response</div>
        <pre className="addr" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{bridgeRaw}</pre>
      </div>
    </section>
  );
}
