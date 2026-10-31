#!/usr/bin/env bash
# Deploy the cron hub. The live Worker inventory runs here, with the operator's
# wrangler auth, before anything ships: a deployed Worker with no source in git
# (and no entry in canon/deployed-workers.json) blocks the deploy. No Cloudflare
# token lives in CI or in the Worker. Run from the repo root:
#   workers/cron-hub/deploy.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
CLOUDFLARE_API_TOKEN="$(wrangler auth token --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))')"
export CLOUDFLARE_API_TOKEN
node scripts/lib/workers-inventory.mjs --live
cd workers/cron-hub
exec wrangler deploy "$@"
