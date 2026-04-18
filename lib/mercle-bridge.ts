/* eslint-disable @typescript-eslint/no-explicit-any */

export type WalletType = 'phantom' | 'solflare' | 'backpack' | 'mwa';

// Errors
export class BridgeTimeoutError extends Error {
  constructor(action: string, timeoutMs: number) {
    super(`Wallet approval timed out after ${timeoutMs / 1000}s. Please try again.`);
    this.name = 'BridgeTimeoutError';
  }
}
export class BridgeCancelledError extends Error {
  constructor() {
    super('You cancelled the wallet approval.');
    this.name = 'BridgeCancelledError';
  }
}
export class BridgeConnectionError extends Error {
  constructor(originalError: Error) {
    super('Could not connect to wallet. Please try again.');
    this.name = 'BridgeConnectionError';
    this.cause = originalError;
  }
}

// Detection
export function isInMercleApp(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).flutter_inappwebview !== 'undefined';
}

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, action: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new BridgeTimeoutError(action, timeoutMs)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// Bridge call with retry
async function callBridge(action: string, ...args: any[]): Promise<any> {
  if (!isInMercleApp()) throw new BridgeConnectionError(new Error('Not in Mercle app'));
  const maxRetries = 19;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
      const result = await (window as any).flutter_inappwebview.callHandler('MercleBridge', action, ...args);
      return result;
    } catch (error) {
      lastError = error as Error;
      if (error instanceof BridgeCancelledError || error instanceof BridgeTimeoutError) throw error;
    }
  }
  throw new BridgeConnectionError(lastError!);
}

// Auth
export async function refreshToken(): Promise<string | null> {
  const result = await callBridge('refreshToken');
  return result.success ? result.token : null;
}

// Wallet
export interface WalletConnectionResult {
  publicKey: string;
  session: string;
  walletType: WalletType;
}

export async function connectWallet(): Promise<WalletConnectionResult | null> {
  const result = await callBridge('connectWallet');
  if (result.success) {
    return { publicKey: result.public_key, session: result.session, walletType: result.wallet_type as WalletType };
  }
  return null;
}

export async function isWalletConnected(): Promise<boolean> {
  const result = await callBridge('isWalletConnected');
  return result.connected === true;
}

export async function getWalletAddress(): Promise<string | null> {
  const result = await callBridge('getWalletAddress');
  return result.address || null;
}

export async function signTransaction(txBase64: string): Promise<string> {
  const signPromise = (async () => {
    const result = await callBridge('signTransaction', txBase64);
    if (result.cancelled) throw new BridgeCancelledError();
    if (!result.success) throw new BridgeConnectionError(new Error(result.error || 'Signing failed'));
    return result.signedTransaction;
  })();
  return withTimeout(signPromise, 60000, 'signTransaction');
}

export async function signAllTransactions(txsBase64: string[]): Promise<string[]> {
  const signPromise = (async () => {
    const result = await callBridge('signAllTransactions', txsBase64);
    if (result.cancelled) throw new BridgeCancelledError();
    if (!result.success) throw new BridgeConnectionError(new Error(result.error || 'Signing failed'));
    return result.signedTransactions;
  })();
  return withTimeout(signPromise, 90000, 'signAllTransactions');
}

export async function signMessage(messageBase64: string): Promise<string> {
  const signPromise = (async () => {
    const result = await callBridge('signMessage', messageBase64);
    if (result.cancelled) throw new BridgeCancelledError();
    if (!result.success) throw new BridgeConnectionError(new Error(result.error || 'Signing failed'));
    return result.signature;
  })();
  return withTimeout(signPromise, 30000, 'signMessage');
}

export async function disconnectWallet(): Promise<{ success: boolean; cancelled?: boolean }> {
  const result = await callBridge('disconnectWallet');
  return { success: result.success === true, cancelled: result.cancelled === true };
}

export function getInitialToken(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('token');
}
