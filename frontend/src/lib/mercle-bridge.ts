// Wrapper around the shipping Mercle Mini App bridge.
//
// Empirically this build exposes the LEGACY direct-object API:
//   window.MercleBridge.{refreshToken,getToken,connectWallet,...}
// The v1.0.0 `window.flutter_inappwebview.callHandler('MercleBridge', ...)`
// pattern documented in @mercle/mcp-server 1.0.0 is not yet shipped — it
// returns `{success: false, error: "Unsupported bridge action"}`.
//
// We therefore talk to the legacy object and normalize errors.

type LegacyBridge = {
  _isReady?: boolean;
  getToken(): Promise<string>;
  refreshToken(): Promise<string>;
  getAppInfo(): { appId: string; appName: string; platform: string };
  connectWallet(): Promise<{ publicKey: string; session?: string }>;
  isWalletConnected(): Promise<boolean>;
  getWalletAddress(): Promise<string | null>;
  signTransaction(txBase58: string): Promise<string>;
  signAllTransactions(txsBase58: string[]): Promise<string[]>;
  signMessage(msgBase58: string): Promise<string>;
  disconnectWallet(): Promise<void>;
};

declare global {
  interface Window {
    MercleBridge?: LegacyBridge;
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: unknown[]) => Promise<any>;
    };
  }
}

export class BridgeUnavailableError extends Error {
  constructor() {
    super("window.MercleBridge is unavailable");
    this.name = "BridgeUnavailableError";
  }
}
export class BridgeCancelledError extends Error {
  constructor(action: string) {
    super(`User cancelled "${action}"`);
    this.name = "BridgeCancelledError";
  }
}
/** Host app explicitly refused to issue a token (e.g., SDK session mode). */
export class TokenUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "TokenUnavailableError";
  }
}

export function isInMercleApp(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.MercleBridge &&
    typeof window.MercleBridge.refreshToken === "function"
  );
}

function bridge(): LegacyBridge {
  if (!isInMercleApp()) throw new BridgeUnavailableError();
  return window.MercleBridge!;
}

function isTokenRefusal(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /session mode|token auth is not available/i.test(e.message);
}

export async function refreshToken(): Promise<string> {
  try {
    return await bridge().refreshToken();
  } catch (e) {
    if (isTokenRefusal(e)) {
      throw new TokenUnavailableError(
        e instanceof Error ? e.message : "Token unavailable"
      );
    }
    throw e;
  }
}

export function getAppInfo() {
  if (!isInMercleApp()) return null;
  try {
    return bridge().getAppInfo();
  } catch {
    return null;
  }
}

export async function isWalletConnected(): Promise<boolean> {
  return bridge().isWalletConnected();
}

export async function getWalletAddress(): Promise<string | null> {
  return bridge().getWalletAddress();
}

export async function connectWallet(): Promise<{
  publicKey: string;
  session?: string;
} | null> {
  try {
    const r = await bridge().connectWallet();
    if (!r?.publicKey) return null;
    return r;
  } catch (e) {
    if (e instanceof Error && /cancel/i.test(e.message)) return null;
    throw e;
  }
}

export async function signMessage(messageBase58: string): Promise<string> {
  try {
    return await bridge().signMessage(messageBase58);
  } catch (e) {
    if (e instanceof Error && /cancel|reject/i.test(e.message)) {
      throw new BridgeCancelledError("signMessage");
    }
    throw e;
  }
}

export async function disconnectWallet(): Promise<void> {
  await bridge().disconnectWallet();
}

/** UTF-8 → base58. Lazy import bs58 only when actually signing. */
export async function encodeUtf8ToBase58(s: string): Promise<string> {
  const { default: bs58 } = await import("bs58");
  return bs58.encode(new TextEncoder().encode(s));
}
