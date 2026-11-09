#!/bin/sh
# Start agentsgot MCP over stdio. Catalogs (e.g. Glama) need initialize/tools/list
# without credentials; mint an ephemeral local signer only when none is configured.
set -eu
if [ -z "${AGENTSGOT_WALLET_PRIVATE_KEY:-}" ] \
  && [ -z "${AGENTSGOT_KEYSTORE:-}" ] \
  && [ -z "${AGENTSGOT_KEYSTORE_PASSWORD:-}" ]; then
  AGENTSGOT_WALLET_PRIVATE_KEY="$(node -e "process.stdout.write('0x'+require('node:crypto').randomBytes(32).toString('hex'))")"
  export AGENTSGOT_WALLET_PRIVATE_KEY
fi
exec "$@"
