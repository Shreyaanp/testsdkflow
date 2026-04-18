import { useEffect, useState } from "react";
import {
  getAppInfo,
  isInMercleApp,
  refreshToken,
} from "../lib/mercle-bridge";
import { verifyMercleToken, type VerifiedSession } from "../lib/verify";
import { BridgeWalletPanel } from "../components/BridgeWalletPanel";
import { FallbackWalletPanel } from "../components/FallbackWalletPanel";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";

type Phase =
  | { kind: "booting" }
  | { kind: "no-bridge" }
  | { kind: "authenticating" }
  | { kind: "no-token" }
  | { kind: "ready"; session: VerifiedSession }
  | { kind: "error"; message: string };

export function OAuthPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" });
  const [platform, setPlatform] = useState<string>("browser");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isInMercleApp()) {
        setPhase({ kind: "no-bridge" });
        return;
      }
      setPhase({ kind: "authenticating" });
      try {
        const info = await getAppInfo();
        if (info?.platform) setPlatform(info.platform);

        const token = await refreshToken();
        if (!token) {
          if (!cancelled) setPhase({ kind: "no-token" });
          return;
        }
        const session = await verifyMercleToken(token);
        if (!cancelled) setPhase({ kind: "ready", session });
      } catch (e) {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message: e instanceof Error ? e.message : "Authentication failed",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <header className="brand">
        <span className="brand-dot" />
        <span className="brand-name">Mercle · SDK demo</span>
        <span className="brand-sub">{platform}</span>
      </header>

      <AuthCard phase={phase} />

      {phase.kind === "ready" ? (
        <BridgeWalletPanel />
      ) : phase.kind === "no-bridge" ? (
        <FallbackWalletPanel />
      ) : null}

      <DiagnosticsPanel />

      <footer className="card">
        <div className="sub">
          Face + email verification happens in the Mercle host app. This
          mini-app receives the resulting JWT via{" "}
          <code>flutter_inappwebview.callHandler('MercleBridge', 'refreshToken')</code>
          {" "}and then exposes Solana wallet primitives.
        </div>
      </footer>
    </div>
  );
}

function AuthCard({ phase }: { phase: Phase }) {
  if (phase.kind === "booting" || phase.kind === "authenticating") {
    return (
      <section className="card">
        <h2>Signing you in</h2>
        <div className="sub">
          <span className="spinner" />
          Calling <code>refreshToken</code> on the Mercle bridge…
        </div>
      </section>
    );
  }
  if (phase.kind === "no-bridge") {
    return (
      <section className="card">
        <div className="row between">
          <div>
            <h2>Open in Mercle to sign in</h2>
            <div className="sub">
              This page expects <code>window.flutter_inappwebview</code> — only
              present inside the Mercle app's webview. You can still test wallet
              flows below with a browser wallet.
            </div>
          </div>
          <span className="pill muted">browser</span>
        </div>
      </section>
    );
  }
  if (phase.kind === "no-token") {
    return (
      <section className="card">
        <h2>Bridge responded with no token</h2>
        <div className="alert info">
          <code>refreshToken</code> returned <code>{"{success: false}"}</code>.
          Usually means the Mercle app's on-device session hasn't been minted
          yet — try force-quitting and reopening the Mercle app.
        </div>
      </section>
    );
  }
  if (phase.kind === "error") {
    return (
      <section className="card">
        <h2>Couldn't sign you in</h2>
        <div className="alert error">{phase.message}</div>
      </section>
    );
  }
  const { session } = phase;
  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        {session.pfp_url ? (
          <img className="avatar" src={session.pfp_url} alt="" />
        ) : (
          <div className="avatar" />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{session.username ?? "Verified user"}</div>
          <div className="sub">{session.localized_user_id}</div>
        </div>
        <span className="pill ok">verified</span>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {session.verified_services.map((s) => (
          <span key={s} className="pill">{s}</span>
        ))}
      </div>
    </section>
  );
}
