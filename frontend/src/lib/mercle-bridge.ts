// Thin wrapper around the Mercle Flutter-InAppWebView bridge.
// Bridge is exposed as `window.flutter_inappwebview.callHandler('MercleBridge', action, ...args)`.

declare global {
  interface Window {
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: unknown[]) => Promise<any>;
    };
  }
}

export class BridgeTimeoutError extends Error {
  constructor(action: string) {
    super(`Mercle bridge call "${action}" timed out`);
    this.name = "BridgeTimeoutError";
  }
}
export class BridgeCancelledError extends Error {
  constructor(action: string) {
    super(`User cancelled "${action}"`);
    this.name = "BridgeCancelledError";
  }
}
export class BridgeError extends Error {
  constructor(action: string, detail?: string) {
    super(`Mercle bridge "${action}" failed${detail ? `: ${detail}` : ""}`);
    this.name = "BridgeError";
  }
}

export function isInMercleApp(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.flutter_inappwebview !== "undefined" &&
    typeof window.flutter_inappwebview.callHandler === "function"
  );
}

type BridgeResult =
  | { success: true; [k: string]: unknown }
  | { success: false; error?: string; cancelled?: boolean }
  | { cancelled: true }
  | { connected?: boolean; address?: string; token?: string }
  | Record<string, unknown>;

async function callBridge<T extends BridgeResult = BridgeResult>(
  action: string,
  ...args: unknown[]
): Promise<T> {
  if (!isInMercleApp()) throw new BridgeError(action, "not in Mercle app");
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
    try {
      const result = await window.flutter_inappwebview!.callHandler(
        "MercleBridge",
        action,
        ...args
      );
      return (result ?? {}) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new BridgeTimeoutError(action);
}

export async function refreshToken(): Promise<string | null> {
  const r: any = await callBridge("refreshToken");
  if (r?.success && typeof r.token === "string") return r.token;
  return null;
}

export async function getAppInfo(): Promise<
  { appId?: string; appName?: string; platform?: string } | null
> {
  try {
    const r: any = await callBridge("getAppInfo");
    if (r?.success === false) return null;
    return {
      appId: r.appId ?? r.app_id,
      appName: r.appName ?? r.app_name,
      platform: r.platform,
    };
  } catch {
    return null;
  }
}

export async function isWalletConnected(): Promise<boolean> {
  const r: any = await callBridge("isWalletConnected");
  return r?.connected === true || r?.success === true && r?.connected === true;
}

export async function getWalletAddress(): Promise<string | null> {
  const r: any = await callBridge("getWalletAddress");
  return (r?.address ?? r?.public_key ?? null) as string | null;
}

export async function connectWallet(): Promise<{
  publicKey: string;
  session?: string;
  walletType?: string;
} | null> {
  const r: any = await callBridge("connectWallet");
  if (r?.cancelled) return null;
  if (!r?.success) throw new BridgeError("connectWallet", r?.error);
  const publicKey = r.public_key ?? r.publicKey;
  if (!publicKey) throw new BridgeError("connectWallet", "no public key");
  return {
    publicKey,
    session: r.session,
    walletType: r.wallet_type ?? r.walletType,
  };
}

export async function signMessage(messageBase64: string): Promise<string> {
  const r: any = await callBridge("signMessage", messageBase64);
  if (r?.cancelled) throw new BridgeCancelledError("signMessage");
  if (!r?.success) throw new BridgeError("signMessage", r?.error);
  const sig = r.signature ?? r.signedMessage;
  if (!sig) throw new BridgeError("signMessage", "empty signature");
  return sig as string;
}

export async function signTransaction(txBase64: string): Promise<string> {
  const r: any = await callBridge("signTransaction", txBase64);
  if (r?.cancelled) throw new BridgeCancelledError("signTransaction");
  if (!r?.success) throw new BridgeError("signTransaction", r?.error);
  return (r.signedTransaction ?? r.signed_transaction) as string;
}

export async function disconnectWallet(): Promise<boolean> {
  const r: any = await callBridge("disconnectWallet");
  if (r?.cancelled) return false;
  return r?.success === true;
}

export function encodeUtf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
