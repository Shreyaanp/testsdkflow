# testsdkflow — Mercle Mini App (Next.js)

Clean scaffold of a Mercle Mini App per the canonical
`@mercle/mcp-server@1.1.0` example. Hosted at `https://sdk.mercle.id/oauth`.

## Structure

```
app/
  oauth/page.tsx              SPA entry — sign-in flow + wallet UI
  api/auth/mercle/route.ts    Verify bridge token (Path 1)
  api/auth/mercle/session/create/route.ts   Create SDK session (Path 2a)
  api/auth/mercle/session/status/route.ts   Poll SDK session (Path 2b)
lib/
  mercle-bridge.ts            flutter_inappwebview.callHandler wrapper
  mercle-auth.ts              Dual-path auth dispatcher
deploy/
  nginx/sdk.mercle.id.conf    TLS vhost, proxies everything to :3000
  systemd/testsdkflow-server.service   Runs `next start -p 3000`
```

## Local dev

```bash
cp .env.example .env.local
# fill MERCLE_API_KEY
npm install
npm run dev
```

Open http://localhost:3000/oauth .

## Deploy (EC2)

```bash
ssh aws-ec2
cd /opt/testsdkflow
git pull
npm ci
npm run build
sudo systemctl restart testsdkflow-server
sudo systemctl reload nginx
```

The server listens on `127.0.0.1:3000`; nginx terminates TLS at `sdk.mercle.id`
and proxies both `/` and `/api/*` through to Next.js.

Environment (`/opt/testsdkflow/.env`):
- `MERCLE_APP_ID`
- `MERCLE_API_KEY`
- `MERCLE_API_URL=https://prodbackend.mercle.ai/api/mercle-sdk`
