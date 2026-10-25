#!/bin/sh
# Vercel build: the web app when it exists, otherwise a placeholder page. Output goes to ./dist.
set -e
rm -rf dist && mkdir -p dist
if [ -f apps/web/package.json ]; then
  (cd apps/web && npm ci --ignore-scripts && npm run build)
  cp -r apps/web/dist/. dist/
else
  printf '<!doctype html><meta charset="utf-8"><title>Stellar-Split</title><p>Stellar-Split on Stellar Testnet. The web app is on its way. API status: <a href="/v1/health">/v1/health</a></p>\n' > dist/index.html
fi
