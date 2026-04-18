import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAppInfo,
  isInMercleApp,
  refreshToken,
  TokenUnavailableError,
} from "../lib/mercle-bridge";
import { verifyMercleToken, type VerifiedSession } from "../lib/verify";
import {
  clearCachedVerifiedSession,
  clearPendingSession,
  getCachedVerifiedSession,
  getPendingSession,
  runSdkSessionFlow,
  type SdkSession,
  type SdkStatus,
} from "../lib/sdk-session";
import { BridgeWalletPanel } from "../components/BridgeWalletPanel";
import { FallbackWalletPanel } from "../components/FallbackWalletPanel";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";

type Phase =
  | { kind: "booting" }
  | { kind: "no-bridge" }
  | { kind: "authenticating" }
  | { kind: "needs-verification" }
  | {
      kind: "sdk-session";
      session: SdkSession;
      status: SdkStatus | null;
      resumed: boolean;
    }
  | { kind: "ready"; session: VerifiedSession; via: "bridge" | "sdk-session" | "cache" }
  | { kind: "error"; message: string };

export function OAuthPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" });
  const [platform, setPlatform] = useState<string>("browser");
  const abortRef = useRef<AbortController | null>(null);

  const startSdkFlow = useCallback(
    async (opts: { resume?: ReturnType<typeof getPendingSession> }) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const user = await runSdkSessionFlow({
          signal: ctrl.signal,
          resume: opts.resume ?? undefined,
          onSession: (session) =>
            setPhase({
              kind: "sdk-session",
              session,
              status: null,
              resumed: !!opts.resume,
            }),
          onStatus: (status) =>
            setPhase((prev) =>
              prev.kind === "sdk-session" ? { ...prev, status } : prev
            ),
        });
        if (ctrl.signal.aborted) return;
        if (user) {
          setPhase({ kind: "ready", session: user, via: "sdk-session" });
        } else {
          setPhase({
            kind: "error",
            message: "Verification didn't complete (rejected, expired, or cancelled).",
          });
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setPhase({
          kind: "error",
          message: e instanceof Error ? e.message : "SDK session failed",
        });
      }
    },
    []
  );

  const onLogout = useCallback(() => {
    clearCachedVerifiedSession();
    clearPendingSession();
    setPhase({ kind: "needs-verification" });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      if (!isInMercleApp()) {
        // Out of the webview: still show cached session if present, else no-bridge
        const cached = getCachedVerifiedSession();
        if (cached) {
          setPhase({ kind: "ready", session: cached, via: "cache" });
          return;
        }
        setPhase({ kind: "no-bridge" });
        return;
      }

      setPhase({ kind: "authenticating" });

      const info = getAppInfo();
      if (info?.platform) setPlatform(info.platform);

      // Already verified in a previous mount? Show straight away.
      const cached = getCachedVerifiedSession();
      if (cached) {
        setPhase({ kind: "ready", session: cached, via: "cache" });
        return;
      }

      // Path 1: legacy bridge refreshToken
      let bridgeToken: string | null = null;
      try {
        bridgeToken = await refreshToken();
      } catch (e) {
        if (!(e instanceof TokenUnavailableError)) {
          if (ctrl.signal.aborted) return;
          setPhase({
            kind: "error",
            message: e instanceof Error ? e.message : "Authentication failed",
          });
          return;
        }
        // fall through — SDK session
      }

      if (bridgeToken) {
        try {
          const session = await verifyMercleToken(bridgeToken);
          if (ctrl.signal.aborted) return;
          setPhase({ kind: "ready", session, via: "bridge" });
          return;
        } catch (e) {
          if (ctrl.signal.aborted) return;
          setPhase({
            kind: "error",
            message: e instanceof Error ? e.message : "Token verify failed",
          });
          return;
        }
      }

      // Resume an existing SDK session if we have one, otherwise
      // show a verify button and wait for user action (no auto-prompt loop).
      const pending = getPendingSession();
      if (pending) {
        void startSdkFlow({ resume: pending });
        return;
      }
      setPhase({ kind: "needs-verification" });
    })();

    return () => {
      ctrl.abort();
    };
  }, [startSdkFlow]);

  const bridgePresent = phase.kind !== "no-bridge";

  return (
    <div className="page">
      <header className="brand">
        <span className="brand-dot" />
        <span className="brand-name">Mercle · SDK demo</span>
        <span className="brand-sub">{platform}</span>
      </header>

      <AuthCard
        phase={phase}
        onStart={() => startSdkFlow({})}
        onLogout={onLogout}
      />

      {bridgePresent ? <BridgeWalletPanel /> : <FallbackWalletPanel />}

      <DiagnosticsPanel />

      <footer className="card">
        <div className="sub">
          Dual-path auth with resume. Sessions are cached in{" "}
          <code>localStorage</code> so reloading the webview after verification
          shows the signed-in state instead of re-prompting.
        </div>
      </footer>
    </div>
  );
}

function AuthCard({
  phase,
  onStart,
  onLogout,
}: {
  phase: Phase;
  onStart: () => void;
  onLogout: () => void;
}) {
  if (phase.kind === "booting" || phase.kind === "authenticating") {
    return (
      <section className="card">
        <h2>Signing you in</h2>
        <div className="sub">
          <span className="spinner" />
          Trying <code>MercleBridge.refreshToken()</code>…
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
              <code>window.MercleBridge</code> is only present inside the Mercle
              app. You can still test wallet flows below with a browser wallet.
            </div>
          </div>
          <span className="pill muted">browser</span>
        </div>
      </section>
    );
  }
  if (phase.kind === "needs-verification") {
    return (
      <section className="card stack">
        <div className="row between">
          <div>
            <h2>Verify with Mercle</h2>
            <div className="sub">
              Bridge token is unavailable — we'll ask Mercle to run face +
              email verification via an SDK session. Tap below once.
            </div>
          </div>
          <span className="pill muted">paused</span>
        </div>
        <button className="btn" onClick={onStart}>
          Start Mercle verification
        </button>
      </section>
    );
  }
  if (phase.kind === "sdk-session") {
    const statusLabel = phase.status?.status ?? "creating";
    return (
      <section className="card stack">
        <div className="row between">
          <div>
            <h2>
              {phase.resumed
                ? "Resuming verification…"
                : "SDK session in progress"}
            </h2>
            <div className="sub">
              {phase.resumed
                ? "Checking status of your previous Mercle session — no new prompt."
                : "Mercle should now prompt you for face + email verification."}
            </div>
          </div>
          <span className="pill">
            <span className="spinner" />
            {statusLabel}
          </span>
        </div>
        <div className="kv">
          <div className="k">session</div>
          <div className="v">{phase.session.session_id}</div>
          {phase.status && phase.status.status !== "approved" && phase.status.rejection_reason ? (
            <>
              <div className="k">reason</div>
              <div className="v">{phase.status.rejection_reason}</div>
            </>
          ) : null}
        </div>
        <a className="btn secondary" href={phase.session.deep_link}>
          Open verification in Mercle
        </a>
      </section>
    );
  }
  if (phase.kind === "error") {
    return (
      <section className="card stack">
        <h2>Couldn't sign you in</h2>
        <div className="alert error">{phase.message}</div>
        <button className="btn secondary" onClick={onStart}>
          Try again
        </button>
      </section>
    );
  }
  const { session, via } = phase;
  return (
    <section className="card stack">
      <div className="row" style={{ gap: 12 }}>
        {session.pfp_url ? (
          <img className="avatar" src={session.pfp_url} alt="" />
        ) : (
          <div className="avatar" />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{session.username ?? "Verified user"}</div>
          <div className="sub">{session.localized_user_id}</div>
        </div>
        <span className="pill ok">verified · {via}</span>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        {session.verified_services.map((s) => (
          <span key={s} className="pill">{s}</span>
        ))}
      </div>
      <button className="btn secondary" onClick={onLogout}>
        Sign out of this demo
      </button>
    </section>
  );
}
