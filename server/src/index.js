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

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app_id: MERCLE_APP_ID });
});

app.post("/api/auth/mercle", async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length < 10) {
    return res.status(400).json({ error: "Missing token" });
  }

  try {
    const upstream = await fetch(
      `${MERCLE_OAUTH_BASE}/api/mercle-sdk/mini-app/verify-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": MERCLE_API_KEY,
        },
        body: JSON.stringify({ token }),
      }
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "Token verification failed",
        detail: data.detail || data.message || null,
      });
    }

    if (data.app_id && data.app_id !== MERCLE_APP_ID) {
      return res.status(401).json({ error: "Token not issued for this app" });
    }

    return res.json({
      user: {
        localized_user_id: data.localized_user_id,
        verified_services: data.verified_services || [],
        app_id: data.app_id,
        username: data.username,
        pfp_url: data.pfp_url,
      },
    });
  } catch (e) {
    console.error("verify-token upstream error:", e);
    return res.status(502).json({ error: "Upstream verify-token failed" });
  }
});

app.listen(PORT, () => {
  console.log(`testsdkflow server listening on :${PORT}`);
});
