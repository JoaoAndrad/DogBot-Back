#!/usr/bin/env bash
set -euo pipefail
echo "Starting start-prod.sh"
mkdir -p ./prisma/certs ~/.postgresql

if [ -n "${PRISMA_P12_BASE64:-}" ] && [ -n "${P12_PASSWORD:-}" ]; then
  echo "Decoding PRISMA_P12_BASE64..."
  echo "$PRISMA_P12_BASE64" | base64 -d > ./prisma/certs/client-identity.p12
  chmod 600 ./prisma/certs/client-identity.p12 || true
  if command -v openssl >/dev/null 2>&1; then
    openssl pkcs12 -in ./prisma/certs/client-identity.p12 -clcerts -nokeys -out ./prisma/certs/client-cert.pem -passin pass:"$P12_PASSWORD" || true
    openssl pkcs12 -in ./prisma/certs/client-identity.p12 -nocerts -nodes -out ./prisma/certs/client-key.pem -passin pass:"$P12_PASSWORD" || true
    cp ./prisma/certs/client-key.pem ~/.postgresql/client-key.pem || true
    chmod 600 ~/.postgresql/client-key.pem || true
  fi
fi

echo "Generating Prisma client..."
npx prisma generate

echo "Starting app..."
npm run start
