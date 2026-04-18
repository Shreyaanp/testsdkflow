'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  isInMercleApp,
  connectWallet,
  isWalletConnected,
  getWalletAddress,
  signMessage,
  disconnectWallet,
  BridgeTimeoutError,
  BridgeCancelledError,
} from '@/lib/mercle-bridge';

export function MercleWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);

  useEffect(() => {
    const available = isInMercleApp();
    setBridgeAvailable(available);

    if (available) {
      isWalletConnected().then((c) => {
        setConnected(c);
        if (c) getWalletAddress().then(setAddress);
      });
    }
  }, []);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await connectWallet();
      if (result) {
        setAddress(result.publicKey);
        setConnected(true);
      }
      // null = user cancelled, no error
    } catch (e) {
      if (e instanceof BridgeCancelledError) return;
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      const result = await disconnectWallet();
      if (result.cancelled) return; // User chose not to disconnect
      setAddress(null);
      setConnected(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSignMessage = useCallback(async (message: string) => {
    try {
      const encoded = btoa(message);
      const signature = await signMessage(encoded);
      return signature;
    } catch (e) {
      if (e instanceof BridgeCancelledError) return null;
      if (e instanceof BridgeTimeoutError) {
        setError('Signing timed out. Please try again.');
        return null;
      }
      throw e;
    }
  }, []);

  if (!bridgeAvailable) {
    return <p>Wallet features are only available inside the Mercle app.</p>;
  }

  return (
    <div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {connected ? (
        <div>
          <p>Connected: {address?.slice(0, 4)}...{address?.slice(-4)}</p>
          <button onClick={() => handleSignMessage('Hello from Mercle!')} disabled={loading}>
            Sign Message
          </button>
          <button onClick={handleDisconnect} disabled={loading}>
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={loading}>
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
}
