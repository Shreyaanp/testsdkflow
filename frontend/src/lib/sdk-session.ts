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
}): Promise<VerifiedSession | null> {
  const session = await createSdkSession();
  opts.onSession?.(session);
  renderDeepLinkAnchor(session.deep_link);

  const pollMs = opts.pollIntervalMs ?? 2500;
  const deadline = Date.now() + Math.max(60, session.expires_in_seconds ?? 900) * 1000;

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
      if (status.status === "approved") return status.user;
      if (status.status === "rejected" || status.status === "expired") return null;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return null;
  } finally {
    removeDeepLinkAnchor();
  }
}
