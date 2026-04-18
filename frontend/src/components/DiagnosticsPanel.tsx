import { useEffect, useState } from "react";

type Row = { k: string; v: string };
type Probe = { name: string; status: "pending" | "ok" | "err"; detail: string };

function safeStringify(v: unknown): string {
  try {
    if (typeof v === "function") return "[function]";
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    const s = JSON.stringify(v, (_, val) => {
      if (typeof val === "string" && val.length > 240) {
        return val.slice(0, 80) + "…" + val.slice(-40);
      }
      return val;
    }, 2);
    return s ?? String(v);
  } catch {
    return String(v);
  }
}

export function DiagnosticsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);

  useEffect(() => {
    const w = window as any;
    const legacyKeys =
      w.MercleBridge && typeof w.MercleBridge === "object"
        ? Object.keys(w.MercleBridge).join(", ")
        : "(no MercleBridge)";

    setRows([
      { k: "UA", v: navigator.userAgent },
      { k: "href", v: location.href },
      {
        k: "window.flutter_inappwebview",
        v: String(typeof w.flutter_inappwebview !== "undefined"),
      },
      {
        k: "  .callHandler",
        v: String(typeof w.flutter_inappwebview?.callHandler),
      },
      {
        k: "window.MercleBridge",
        v: String(typeof w.MercleBridge !== "undefined"),
      },
      { k: "  MercleBridge keys", v: legacyKeys },
      {
        k: "window.__mercle_injected_inapp",
        v: safeStringify(w.__mercle_injected_inapp),
      },
    ]);

    const plan: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: "MercleBridge.refreshToken()  [legacy direct]",
        run: () =>
          typeof w.MercleBridge?.refreshToken === "function"
            ? Promise.resolve(w.MercleBridge.refreshToken())
            : Promise.reject(new Error("method missing")),
      },
      {
        name: "MercleBridge.getToken()  [legacy direct]",
        run: () =>
          typeof w.MercleBridge?.getToken === "function"
            ? Promise.resolve(w.MercleBridge.getToken())
            : Promise.reject(new Error("method missing")),
      },
      {
        name: "callHandler('MercleBridge', 'refreshToken')  [v1]",
        run: () =>
          typeof w.flutter_inappwebview?.callHandler === "function"
            ? w.flutter_inappwebview.callHandler("MercleBridge", "refreshToken")
            : Promise.reject(new Error("callHandler missing")),
      },
      {
        name: "callHandler('MercleBridge', 'getToken')  [v1]",
        run: () =>
          typeof w.flutter_inappwebview?.callHandler === "function"
            ? w.flutter_inappwebview.callHandler("MercleBridge", "getToken")
            : Promise.reject(new Error("callHandler missing")),
      },
    ];

    setProbes(plan.map((p) => ({ name: p.name, status: "pending", detail: "…" })));

    plan.forEach((p, i) => {
      Promise.resolve()
        .then(() => p.run())
        .then((r) => {
          setProbes((cur) => {
            const next = [...cur];
            next[i] = { name: p.name, status: "ok", detail: safeStringify(r) };
            return next;
          });
        })
        .catch((e) => {
          setProbes((cur) => {
            const next = [...cur];
            next[i] = {
              name: p.name,
              status: "err",
              detail:
                e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            };
            return next;
          });
        });
    });
  }, []);

  return (
    <section className="card stack">
      <h2>Diagnostics</h2>
      <div className="sub">Probes run automatically on page load.</div>
      <div className="kv">
        {rows.map(({ k, v }, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {probes.map((p, i) => (
          <div key={i} className="alert info">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span
                className={
                  "pill " +
                  (p.status === "ok"
                    ? "ok"
                    : p.status === "err"
                    ? ""
                    : "muted")
                }
              >
                {p.status}
              </span>
            </div>
            <pre
              className="addr"
              style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}
            >
              {p.detail}
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}
