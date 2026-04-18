import { useCallback, useEffect, useState } from "react";
import {
  BridgeCancelledError,
  connectWallet,
  disconnectWallet,
  encodeUtf8ToBase58,
  getWalletAddress,
  isWalletConnected,
  signMessage,
} from "../lib/mercle-bridge";

type WalletState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "connected"; address: string }
  | { kind: "error"; message: string };

export function BridgeWalletPanel() {
  const [state, setState] = useState<WalletState>({ kind: "loading" });
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "sign" | "disconnect">(null);

  const refresh = useCallback(async () => {
    try {
      const connected = await isWalletConnected();
      if (!connected) return setState({ kind: "idle" });
      const address = (await getWalletAddress()) ?? "";
      setState({ kind: "connected", address });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Bridge error",
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onConnect = async () => {
    setBusy("connect");
    try {
      const result = await connectWallet();
      if (!result) return;
      setState({ kind: "connected", address: result.publicKey });
      setSignature(null);
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Connect failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const onSign = async () => {
    if (state.kind !== "connected") return;
    setBusy("sign");
    try {
      const msg = `Sign in to sdk.mercle.id\n\naddress: ${state.address}\nnonce: ${Date.now()}`;
      const encoded = await encodeUtf8ToBase58(msg);
      const sig = await signMessage(encoded);
      setSignature(sig);
    } catch (e) {
      if (e instanceof BridgeCancelledError) return;
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Sign rejected",
      });
    } finally {
      setBusy(null);
    }
  };

  const onDisconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnectWallet();
      setSignature(null);
      setState({ kind: "idle" });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Disconnect failed",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card stack">
      <div className="row between">
        <div>
          <h2>Wallet</h2>
          <div className="sub">
            Via <code>window.MercleBridge</code> (legacy direct API). Scoped to this mini-app.
          </div>
        </div>
        {state.kind === "connected" ? (
          <span className="pill ok">connected</span>
        ) : (
          <span className="pill muted">disconnected</span>
        )}
      </div>

      {state.kind === "error" ? (
        <div className="alert error">{state.message}</div>
      ) : null}

      {state.kind === "connected" ? (
        <>
          <div className="addr">{state.address}</div>
          <button className="btn" onClick={onSign} disabled={busy !== null}>
            {busy === "sign" ? <><span className="spinner" />Requesting signature…</> : "Sign test message"}
          </button>
          {signature ? (
            <div className="alert info">
              <div style={{ marginBottom: 6, color: "var(--ok)" }}>signature</div>
              <div className="addr">{signature}</div>
            </div>
          ) : null}
          <button className="btn danger" onClick={onDisconnect} disabled={busy !== null}>
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect wallet"}
          </button>
        </>
      ) : (
        <button className="btn" onClick={onConnect} disabled={busy !== null}>
          {busy === "connect" ? <><span className="spinner" />Opening wallet…</> : "Connect Solana wallet"}
        </button>
      )}
    </section>
  );
}
