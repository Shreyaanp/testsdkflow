import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";

export function FallbackWalletPanel() {
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const address = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);

  const onSign = async () => {
    if (!signMessage || !address) return;
    setSigning(true);
    setError(null);
    try {
      const msg = `Sign in to sdk.mercle.id\n\naddress: ${address}\nnonce: ${Date.now()}`;
      const sig = await signMessage(new TextEncoder().encode(msg));
      setSignature(bs58.encode(sig));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign rejected");
    } finally {
      setSigning(false);
    }
  };

  return (
    <section className="card stack">
      <div className="row between">
        <div>
          <h2>Wallet (browser fallback)</h2>
          <div className="sub">Phantom / Solflare — only shown outside the Mercle webview.</div>
        </div>
        {connected ? (
          <span className="pill ok">connected</span>
        ) : (
          <span className="pill muted">disconnected</span>
        )}
      </div>

      {error ? <div className="alert error">{error}</div> : null}

      {connected && address ? (
        <>
          <div className="addr">{address}</div>
          <button className="btn" onClick={onSign} disabled={signing || !signMessage}>
            {signing ? <><span className="spinner" />Requesting signature…</> : "Sign test message"}
          </button>
          {signature ? (
            <div className="alert info">
              <div style={{ marginBottom: 6, color: "var(--ok)" }}>signature</div>
              <div className="addr">{signature}</div>
            </div>
          ) : null}
          <button
            className="btn danger"
            onClick={() => {
              setSignature(null);
              disconnect();
            }}
          >
            Disconnect wallet
          </button>
        </>
      ) : (
        <WalletMultiButton />
      )}
    </section>
  );
}
