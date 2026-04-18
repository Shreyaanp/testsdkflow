declare global {
  interface Window {
    MercleBridge?: {
      _isReady?: boolean;
      getToken(): Promise<string>;
      refreshToken(): Promise<string>;
      getAppInfo(): { appId: string; appName: string; platform: string };
      connectWallet(): Promise<{ publicKey: string; session: string }>;
      isWalletConnected(): Promise<boolean>;
      getWalletAddress(): Promise<string | null>;
      signTransaction(txBase58: string): Promise<string>;
      signAllTransactions(txsBase58: string[]): Promise<string[]>;
      signMessage(msgBase58: string): Promise<string>;
      disconnectWallet(): Promise<void>;
    };
  }
}

export function isMercleBridge(): boolean {
  return typeof window !== "undefined" && !!window.MercleBridge;
}

export function waitForBridgeReady(timeoutMs = 10_000): Promise<void> {
  if (!isMercleBridge()) return Promise.reject(new Error("MercleBridge unavailable"));
  if (window.MercleBridge!._isReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("mercle:ready", onReady);
      reject(new Error("mercle:ready timed out"));
    }, timeoutMs);
    function onReady() {
      clearTimeout(timer);
      window.removeEventListener("mercle:ready", onReady);
      resolve();
    }
    window.addEventListener("mercle:ready", onReady as EventListener);
  });
}

export async function getMercleToken(): Promise<string> {
  if (!isMercleBridge()) throw new Error("MercleBridge unavailable");
  return window.MercleBridge!.getToken();
}

export function getMercleAppInfo() {
  if (!isMercleBridge()) return null;
  try {
    return window.MercleBridge!.getAppInfo();
  } catch {
    return null;
  }
}
