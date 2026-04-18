# testsdkflow — Mercle Mini App demo

A minimal demo of a Mercle Mini App hosted at **`https://sdk.mercle.id/oauth`**.

Mercle loads this URL in its in-app webview, injects `window.MercleBridge`, and lets us:

1. Authenticate the user via a Mercle-issued JWT (user has already completed **face + email** in the Mercle app — the app manifest requires `["face", "email"]`).
2. Connect / sign messages / disconnect a Solana wallet scoped to this mini-app.
3. Fall back to a Phantom-compatible browser wallet when opened outside the Mercle webview.

## Structure

```
frontend/   Vite + React + TS SPA served as static files
server/     Tiny Node/Express service that holds the API key and
            proxies token verification to oauth.mercle.ai
deploy/     nginx vhost + systemd unit for EC2
```

## Local dev

```bash
# backend (port 3001) — copy .env.example to .env first
cd server && npm install && npm run dev

# frontend (port 5173) — proxies /api to the backend
cd frontend && npm install && npm run dev
```

Open http://localhost:5173/oauth — without the Mercle webview the app falls back to Phantom.

## Deploy (EC2, ubuntu)

```bash
ssh aws-ec2
sudo mkdir -p /opt/testsdkflow && sudo chown ubuntu:ubuntu /opt/testsdkflow
git clone https://github.com/Shreyaanp/testsdkflow.git /opt/testsdkflow
cd /opt/testsdkflow
./deploy/bootstrap.sh
```

The bootstrap script builds the frontend, installs the server, wires systemd + nginx, and runs certbot for `sdk.mercle.id`.
