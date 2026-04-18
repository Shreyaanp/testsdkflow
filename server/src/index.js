import "dotenv/config";
import express from "express";
import cors from "cors";

const {
  MERCLE_APP_ID,
  MERCLE_API_KEY,
  MERCLE_OAUTH_BASE = "https://oauth.mercle.ai",
  PORT = 3001,
} = process.env;

if (!MERCLE_APP_ID || !MERCLE_API_KEY) {
  console.error("Missing MERCLE_APP_ID or MERCLE_API_KEY in env");
  process.exit(1);
}

const MERCLE_SDK_BASE = `${MERCLE_OAUTH_BASE}/api/mercle-sdk`;

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app_id: MERCLE_APP_ID });
});

async function mercleFetch(path, init = {}) {
  const res = await fetch(`${MERCLE_SDK_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": MERCLE_API_KEY,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Path 1 — verify bridge token (legacy fastest path)
app.post("/api/auth/mercle", async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length < 10) {
    return res.status(400).json({ error: "Missing token" });
  }
  try {
    const { ok, status, data } = await mercleFetch("/mini-app/verify-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (!ok) {
      return res.status(status).json({
        error: "Token verification failed",
        detail: data.detail || data.message || null,
      });
    }
    if (data.app_id && data.app_id !== MERCLE_APP_ID) {
      return res.status(401).json({ error: "Token not issued for this app" });
    }
    return res.json({
      success: true,
      user: {
        localized_user_id: data.localized_user_id,
        verified_services: data.verified_services || [],
        app_id: data.app_id,
        username: data.username,
        pfp_url: data.pfp_url,
      },
    });
  } catch (e) {
    console.error("verify-token error:", e);
    return res.status(502).json({ error: "Upstream verify-token failed" });
  }
});

// Path 2a — create SDK session (fallback when bridge refuses)
app.post("/api/auth/mercle/session/create", async (_req, res) => {
  try {
    const { ok, status, data } = await mercleFetch("/session/create", {
      method: "POST",
      body: JSON.stringify({ metadata: { source: "miniapp", app_id: MERCLE_APP_ID } }),
    });
    if (!ok) {
      return res.status(status || 502).json({
        error: "Failed to create SDK session",
        detail: data.detail || data.message || null,
      });
    }
    return res.json({
      session_id: data.session_id,
      deep_link: data.deep_link,
      qr_data: data.qr_data,
      base64_qr: data.base64_qr,
      required_services: data.required_services,
      expires_in_seconds: data.expires_in_seconds,
    });
  } catch (e) {
    console.error("session/create error:", e);
    return res.status(502).json({ error: "Upstream session/create failed" });
  }
});

// Path 2b — poll SDK session status. Returns approved user on success.
app.get("/api/auth/mercle/session/status", async (req, res) => {
  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || !sessionId) {
    return res.status(400).json({ error: "Missing session_id" });
  }
  try {
    const { ok, status, data } = await mercleFetch(
      `/session/status?session_id=${encodeURIComponent(sessionId)}`
    );
    if (!ok) {
      return res.status(status || 502).json({
        error: "Status check failed",
        detail: data.detail || data.message || null,
      });
    }
    if (data.status !== "approved") {
      return res.json({
        status: data.status,
        rejection_reason: data.rejection_reason,
        missing_services: data.missing_services,
      });
    }
    return res.json({
      status: "approved",
      user: {
        localized_user_id: data.localized_user_id,
        verified_services: data.verified_services || [],
        app_id: data.app_id,
        username: data.username,
        pfp_url: data.pfp_url,
      },
    });
  } catch (e) {
    console.error("session/status error:", e);
    return res.status(502).json({ error: "Upstream session/status failed" });
  }
});

app.listen(PORT, () => {
  console.log(`testsdkflow server listening on :${PORT}`);
});
