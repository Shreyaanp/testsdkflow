import { isInMercleApp, refreshToken as refreshTokenViaBridge } from './mercle-bridge';

const LOG = '[MercleAuth]';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// ── Types ────────────────────────────────────────────────────
interface StoredSession { token: string; expiresAt: number; mercleUserId: string; }
interface AuthResult { success: boolean; user: Record<string, unknown>; session_token: string; }
interface SdkSession { session_id: string; deep_link: string; expires_in_seconds?: number; }
interface SdkStatus { status: string; user?: Record<string, unknown>; session_token?: string; rejection_reason?: string; }

const SESSION_KEY = 'mercle_session';
const LOGOUT_KEY = 'mercle_explicit_logout';

// ── Session storage ──────────────────────────────────────────
function getStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s: StoredSession = JSON.parse(raw);
    if (s.expiresAt < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}
function storeSession(token: string, expiresAt: number, mercleUserId: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt, mercleUserId }));
}
export function getSessionToken(): string | null { return getStored()?.token || null; }
export function clearSession(explicit = true) {
  localStorage.removeItem(SESSION_KEY);
  if (explicit) localStorage.setItem(LOGOUT_KEY, '1');
}
function didExplicitlyLogout(): boolean { return localStorage.getItem(LOGOUT_KEY) === '1'; }
export function clearLogoutFlag() { localStorage.removeItem(LOGOUT_KEY); }

function parseJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : Date.now() + 3600000;
  } catch { return Date.now() + 3600000; }
}

// ── Legacy bridge auth ───────────────────────────────────────
async function verifyWithBackend(token: string): Promise<AuthResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/mercle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── SDK session flow (fallback) ──────────────────────────────
const PENDING_SESSION_KEY = 'mercle_pending_session';

interface PendingSession { session_id: string; deep_link: string; expires_at: number; }

function savePendingSession(s: SdkSession) {
  const expires_at = Date.now() + (s.expires_in_seconds ?? 900) * 1000;
  sessionStorage.setItem(PENDING_SESSION_KEY, JSON.stringify({ session_id: s.session_id, deep_link: s.deep_link, expires_at }));
}
function loadPendingSession(): PendingSession | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SESSION_KEY);
    if (!raw) return null;
    const p: PendingSession = JSON.parse(raw);
    if (p.expires_at < Date.now()) { sessionStorage.removeItem(PENDING_SESSION_KEY); return null; }
    return p;
  } catch { return null; }
}
function clearPendingSession() { sessionStorage.removeItem(PENDING_SESSION_KEY); }

async function createSdkSession(): Promise<SdkSession | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/mercle/session/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function pollSessionOnce(sessionId: string): Promise<SdkStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/mercle/session/status?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function renderDeepLinkAnchor(deepLink: string) {
  if (typeof document === 'undefined') return;
  const old = document.getElementById('mercle-session-anchor');
  if (old) old.remove();
  const a = document.createElement('a');
  a.id = 'mercle-session-anchor'; a.href = deepLink; a.style.display = 'none';
  a.setAttribute('data-mercle-session', '1'); a.textContent = 'Mercle';
  document.body.appendChild(a);
}
function removeDeepLinkAnchor() {
  document.getElementById('mercle-session-anchor')?.remove();
}

export interface SdkAuthCallbacks {
  onSession?: (s: SdkSession) => void;
  onStatus?: (s: SdkStatus) => void;
  signal?: AbortSignal;
}

async function runSdkSessionFlow(cb: SdkAuthCallbacks = {}): Promise<Record<string, unknown> | null> {
  // Resume pending session if webview reloaded after verification
  let sessionId: string;
  let deepLink: string;
  let deadline: number;

  const pending = loadPendingSession();
  if (pending) {
    console.log(LOG, 'resuming pending SDK session', pending.session_id);
    sessionId = pending.session_id;
    deepLink = pending.deep_link;
    deadline = pending.expires_at;
  } else {
    const session = await createSdkSession();
    if (!session) return null;
    cb.onSession?.(session);
    savePendingSession(session);
    sessionId = session.session_id;
    deepLink = session.deep_link;
    deadline = Date.now() + Math.max(60, session.expires_in_seconds ?? 900) * 1000;
  }

  renderDeepLinkAnchor(deepLink);

  try {
    while (Date.now() < deadline) {
      if (cb.signal?.aborted) return null;
      const status = await pollSessionOnce(sessionId);
      if (!status) { await new Promise(r => setTimeout(r, 2500)); continue; }
      cb.onStatus?.(status);
      if (status.status === 'approved' && status.session_token && status.user) {
        clearPendingSession();
        storeSession(status.session_token, parseJwtExpiry(status.session_token), (status.user as any).mercleUserId || '');
        return status.user;
      }
      if (status.status === 'rejected' || status.status === 'expired') { clearPendingSession(); return null; }
      await new Promise(r => setTimeout(r, 2500));
    }
    clearPendingSession();
    return null;
  } finally { removeDeepLinkAnchor(); }
}

// ── Main dispatcher ──────────────────────────────────────────
export async function initMercleAuth(sdkCallbacks: SdkAuthCallbacks = {}): Promise<Record<string, unknown> | null> {
  if (typeof window === 'undefined') return null;
  if (didExplicitlyLogout()) return null;

  const inWebView = isInMercleApp();

  // PATH 1: Legacy bridge (try first — fastest when available)
  if (inWebView) {
    console.log(LOG, 'trying legacy bridge auth...');
    try {
      const token = await refreshTokenViaBridge();
      if (token) {
        const result = await verifyWithBackend(token);
        if (result?.success) {
          storeSession(result.session_token, parseJwtExpiry(result.session_token), (result.user as any).mercleUserId || '');
          console.log(LOG, 'legacy bridge auth SUCCESS');
          return result.user;
        }
      }
    } catch (e) {
      console.warn(LOG, 'legacy bridge failed, falling through to SDK session:', e);
    }

    // PATH 2: SDK session flow (fallback)
    console.log(LOG, 'trying SDK session auth...');
    const user = await runSdkSessionFlow(sdkCallbacks);
    if (user) { console.log(LOG, 'SDK session auth SUCCESS'); return user; }
    return null;
  }

  // PATH 3: Not in webview — check cached session
  const cached = getStored();
  if (cached) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${cached.token}` },
      });
      if (res.ok) return await res.json();
    } catch {}
    clearSession(false);
  }
  return null;
}

export async function refreshMercleAuth(sdkCallbacks: SdkAuthCallbacks = {}): Promise<Record<string, unknown> | null> {
  if (!isInMercleApp()) return null;
  try {
    const token = await refreshTokenViaBridge();
    if (token) {
      const result = await verifyWithBackend(token);
      if (result?.success) {
        storeSession(result.session_token, parseJwtExpiry(result.session_token), (result.user as any).mercleUserId || '');
        return result.user;
      }
    }
  } catch {}
  return await runSdkSessionFlow(sdkCallbacks);
}
