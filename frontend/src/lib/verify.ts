export type VerifiedSession = {
  localized_user_id: string;
  verified_services: string[];
  app_id: string;
  username?: string;
  pfp_url?: string;
};

export async function verifyMercleToken(token: string): Promise<VerifiedSession> {
  const res = await fetch("/api/auth/mercle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.detail || `Verify failed (${res.status})`);
  }
  return data.user as VerifiedSession;
}
