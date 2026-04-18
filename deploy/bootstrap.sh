#!/usr/bin/env bash
# One-shot deploy bootstrap. Run on the EC2 host as the `ubuntu` user.
# Idempotent: re-run to pick up new code after `git pull`.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/testsdkflow}"
DOMAIN="${DOMAIN:-sdk.mercle.id}"
WEB_ROOT="/var/www/${DOMAIN}"
ACME_ROOT="/var/www/letsencrypt"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-support@mercle.xyz}"

if [[ ! -f "${REPO_DIR}/server/.env" ]]; then
  echo "!! Missing ${REPO_DIR}/server/.env"
  echo "   Copy .env.example to server/.env and fill MERCLE_API_KEY before running."
  exit 1
fi

echo "==> Installing system deps (nginx, certbot)"
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Building frontend"
pushd "${REPO_DIR}/frontend" >/dev/null
npm ci --no-audit --no-fund
npm run build
popd >/dev/null

echo "==> Installing server deps"
pushd "${REPO_DIR}/server" >/dev/null
npm ci --omit=dev --no-audit --no-fund
popd >/dev/null

echo "==> Publishing static frontend to ${WEB_ROOT}"
sudo mkdir -p "${WEB_ROOT}" "${ACME_ROOT}"
sudo rsync -a --delete "${REPO_DIR}/frontend/dist/" "${WEB_ROOT}/"
sudo chown -R www-data:www-data "${WEB_ROOT}"

echo "==> Installing systemd unit"
sudo cp "${REPO_DIR}/deploy/systemd/testsdkflow-server.service" \
        /etc/systemd/system/testsdkflow-server.service
sudo systemctl daemon-reload
sudo systemctl enable testsdkflow-server
sudo systemctl restart testsdkflow-server

echo "==> Installing nginx vhost"
sudo cp "${REPO_DIR}/deploy/nginx/${DOMAIN}.conf" \
        /etc/nginx/sites-available/${DOMAIN}.conf
sudo ln -sf /etc/nginx/sites-available/${DOMAIN}.conf /etc/nginx/sites-enabled/${DOMAIN}.conf
sudo rm -f /etc/nginx/sites-enabled/default

# Before the cert exists, swap to an HTTP-only stub so nginx -t passes.
if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
  echo "==> No cert yet — installing temporary HTTP vhost for ACME"
  sudo tee /etc/nginx/sites-available/${DOMAIN}.conf >/dev/null <<EOF
server {
  listen 80 default_server;
  server_name ${DOMAIN};
  location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
  location / { return 200 'bootstrapping ${DOMAIN}'; add_header Content-Type text/plain; }
}
EOF
  sudo nginx -t
  sudo systemctl reload nginx

  echo "==> Requesting Let's Encrypt cert"
  sudo certbot certonly --webroot -w ${ACME_ROOT} \
    -d "${DOMAIN}" --email "${LETSENCRYPT_EMAIL}" --agree-tos --no-eff-email -n

  echo "==> Reinstalling real nginx vhost (now with TLS)"
  sudo cp "${REPO_DIR}/deploy/nginx/${DOMAIN}.conf" \
          /etc/nginx/sites-available/${DOMAIN}.conf
fi

sudo nginx -t
sudo systemctl reload nginx

echo "==> Done. Verifying services:"
systemctl --no-pager --lines=0 status testsdkflow-server || true
curl -fsS https://${DOMAIN}/api/health && echo
echo "==> Open https://${DOMAIN}/oauth"
