import type { VerifiedSession } from "./verify";

export type SdkSession = {
  session_id: string;
  deep_link: string;
  qr_data?: string;
  base64_qr?: string;
  required_services?: string[];
  expires_in_seconds?: number;
};

export type SdkStatus =
  | { status: "pending" | "rejected" | "expired"; rejection_reason?: string; missing_services?: string[] }
  | { status: "approved"; user: VerifiedSession };

const SESSION_ANCHOR_ID = "mercle-session-anchor";

/* ─── Persistence: resume instead of re-creating on remount ─── */
const STORAGE_PENDING_KEY = "mercle.sdk.pendingSession";
const STORAGE_VERIFIED_KEY = "mercle.sdk.verified";

type PendingSession = {
  session_id: string;
  deep_link: string;
  createdAt: number;
  expires_in_seconds: number;
};

export function getPendingSession(): PendingSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PendingSession;
    if (!s?.session_id) return null;
    const age = (Date.now() - s.createdAt) / 1000;
    if (age > (s.expires_in_seconds ?? 900)) {
      localStorage.removeItem(STORAGE_PENDING_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function storePendingSession(s: SdkSession) {
  try {
    const v: PendingSession = {
      session_id: s.session_id,
      deep_link: s.deep_link,
      createdAt: Date.now(),
      expires_in_seconds: s.expires_in_seconds ?? 900,
    };
    localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(v));
  } catch {}
}

export function clearPendingSession() {
  try {
    localStorage.removeItem(STORAGE_PENDING_KEY);
  } catch {}
}

export function getCachedVerifiedSession(): import("./verify").VerifiedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_VERIFIED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.localized_user_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeCachedVerifiedSession(s: import("./verify").VerifiedSession) {
  try {
    localStorage.setItem(STORAGE_VERIFIED_KEY, JSON.stringify(s));
  } catch {}
}

export function clearCachedVerifiedSession() {
  try {
    localStorage.removeItem(STORAGE_VERIFIED_KEY);
  } catch {}
}

export async function createSdkSession(): Promise<SdkSession> {
  const res = await fetch("/api/auth/mercle/session/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `session/create failed (${res.status})`);
  return data;
}

export async function pollSdkStatus(sessionId: string): Promise<SdkStatus> {
  const res = await fetch(
    `/api/auth/mercle/session/status?session_id=${encodeURIComponent(sessionId)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `session/status failed (${res.status})`);
  return data;
}

/** Render the hidden anchor Mercle's webview inspects to trigger native verification. */
export function renderDeepLinkAnchor(deepLink: string) {
  removeDeepLinkAnchor();
  const a = document.createElement("a");
  a.id = SESSION_ANCHOR_ID;
  a.href = deepLink;
  a.setAttribute("data-mercle-session", "1");
  a.style.display = "none";
  a.textContent = "Mercle";
  document.body.appendChild(a);
}

export function removeDeepLinkAnchor() {
  document.getElementById(SESSION_ANCHOR_ID)?.remove();
}

export async function runSdkSessionFlow(opts: {
  signal?: AbortSignal;
  onSession?: (s: SdkSession) => void;
  onStatus?: (s: SdkStatus) => void;
  pollIntervalMs?: number;
  /** Resume an existing session instead of creating a new one. */
  resume?: PendingSession;
}): Promise<VerifiedSession | null> {
  let session: SdkSession;
  if (opts.resume) {
    session = {
      session_id: opts.resume.session_id,
      deep_link: opts.resume.deep_link,
      expires_in_seconds:
        opts.resume.expires_in_seconds -
        Math.floor((Date.now() - opts.resume.createdAt) / 1000),
    };
  } else {
    session = await createSdkSession();
    storePendingSession(session);
  }
  opts.onSession?.(session);
  renderDeepLinkAnchor(session.deep_link);

  const pollMs = opts.pollIntervalMs ?? 2500;
  const deadline =
    Date.now() + Math.max(60, session.expires_in_seconds ?? 900) * 1000;

  try {
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) return null;
      let status: SdkStatus;
      try {
        status = await pollSdkStatus(session.session_id);
      } catch {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      opts.onStatus?.(status);
      if (status.status === "approved") {
        clearPendingSession();
        storeCachedVerifiedSession(status.user);
        return status.user;
      }
      if (status.status === "rejected" || status.status === "expired") {
        clearPendingSession();
        return null;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    clearPendingSession();
    return null;
  } finally {
    removeDeepLinkAnchor();
  }
}
