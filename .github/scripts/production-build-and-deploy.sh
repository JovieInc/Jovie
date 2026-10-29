#!/usr/bin/env bash
# Shared production build + prebuilt-deploy sequence. Sourced (never executed)
# by the prebuild job (release_mode=prebuild, started from the Staging
# Controller as soon as main CI is green) and by promote-production as the
# fallback when no exact prebuilt deployment exists. One definition keeps the
# two paths identical: same env pull, same reconcile and readiness checks,
# same provenance receipts, same deploy flags (--prod --skip-domain, so no
# domain moves until the guarded promote step).
#
# Caller contract: define fail_stage <message> <subtype> (must exit non-zero),
# export EXPECTED_SHA VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID plus the
# production runtime env, and run under `set -euo pipefail`. On success this
# sets production_deploy_id, production_deploy_url, provenance_dir,
# input_receipt_digest, artifact_digest and scope_args for the caller.
production_build_and_deploy() {
  missing=()
  for key in EXPECTED_SHA VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
    if [ -z "${!key:-}" ]; then
      missing+=("$key")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail_stage "Missing production deployment inputs: ${missing[*]}" missing_creds
  fi

  required_runtime_env=(
    BETTER_AUTH_URL
    NEXT_PUBLIC_BETTER_AUTH_URL
    NEXT_PUBLIC_GOOGLE_CLIENT_ID
    BETTER_AUTH_SECRET
    DATABASE_URL
    SESSION_SECRET
    AI_GATEWAY_API_KEY
    NEXT_PUBLIC_TURNSTILE_SITE_KEY
    TURNSTILE_SECRET_KEY
    AUTH_GOOGLE_CLIENT_ID
    AUTH_GOOGLE_CLIENT_SECRET
    AUTH_APPLE_CLIENT_ID
    AUTH_APPLE_TEAM_ID
    AUTH_APPLE_KEY_ID
    AUTH_APPLE_PRIVATE_KEY
  )
  missing_runtime_env=()
  runtime_env_args=()
  for key in "${required_runtime_env[@]}"; do
    if [ -z "${!key:-}" ]; then
      missing_runtime_env+=("$key")
    else
      runtime_env_args+=(--env "$key")
    fi
  done
  if [ "${#missing_runtime_env[@]}" -gt 0 ]; then
    fail_stage "Missing production runtime env: ${missing_runtime_env[*]}" production_artifact_failed
  fi

  expected="${EXPECTED_SHA:0:7}"
  scope_args=(--scope "$VERCEL_ORG_ID")
  rm -rf .vercel/output .vercel/.env.preview.local .vercel/.env.production.local .vercel/.env.local

  if ! ./node_modules/.bin/vercel pull --yes --environment=production \
    "${scope_args[@]}"; then
    fail_stage "Unable to pull the Production environment." production_artifact_failed
  fi

  for env_file in .vercel/.env.production.local .vercel/.env.local; do
    if [ -f "$env_file" ]; then
      grep -v '^TURBO_REMOTE_ONLY=' "$env_file" > "${env_file}.tmp" || true
      mv "${env_file}.tmp" "$env_file"
    fi
  done

  if ! pnpm --filter=@jovie/web exec tsx \
    scripts/reconcile-vercel-build-env.ts \
    --file=.vercel/.env.production.local; then
    fail_stage "Unable to reconcile the canonical production build environment." production_artifact_failed
  fi

  if ! pnpm --filter=@jovie/web exec tsx scripts/check-signup-readiness.ts \
    --target=prd --source=vercel-file \
    --file=.vercel/.env.production.local; then
    fail_stage "Production signup configuration is incomplete." production_artifact_failed
  fi

  provenance_dir="$RUNNER_TEMP/production-input-provenance"
  mkdir "$provenance_dir"
  if ! node .github/scripts/production-input-provenance.mjs sbom \
    "$provenance_dir/sbom.cdx.json"; then
    fail_stage "Unable to generate the production SBOM from the installed dependency tree." production_artifact_failed
  fi
  node .github/scripts/production-input-provenance.mjs inputs \
    "$provenance_dir/inputs.json" "$provenance_dir/sbom.cdx.json"

  if ! env -u TURBO_REMOTE_ONLY \
    VERCEL_GIT_COMMIT_SHA="$EXPECTED_SHA" \
    NEXT_PUBLIC_BUILD_SHA="$expected" \
    ./node_modules/.bin/vercel build --prod \
      "${scope_args[@]}"; then
    fail_stage "Production Vercel build failed." production_artifact_failed
  fi
  if [ ! -f .vercel/output/config.json ]; then
    fail_stage "Production build did not create .vercel/output/config.json." production_artifact_failed
  fi
  if ! node .github/scripts/materialize-vercel-static.mjs; then
    fail_stage "Production static asset materialization failed." production_artifact_failed
  fi

  # Measure the exact cache subtree before a separate save action can
  # archive it. This must remain limited to apps/web/.next/cache: do
  # not persist .vercel/output, server/static output, or node_modules.
  next_cache_root='apps/web/.next/cache'
  next_cache_bytes=0
  next_cache_files=0
  next_cache_archive_bytes=0
  next_cache_save_eligible=false
  if [ -e "$next_cache_root" ]; then
    if [ -L "$next_cache_root" ] || [ ! -d "$next_cache_root" ]; then
      fail_stage "Production Next cache root is unsafe or not a directory." production_artifact_failed
    fi
    next_cache_bytes="$(du -sb "$next_cache_root" | awk '{print $1}')"
    next_cache_files="$(find "$next_cache_root" -type f -print | wc -l | tr -d ' ')"
    next_cache_probe="$(mktemp "${RUNNER_TEMP:-/tmp}/jovie-production-next-cache.XXXXXX.tgz")"
    tar -C apps/web/.next -czf "$next_cache_probe" cache
    next_cache_archive_bytes="$(stat -c '%s' "$next_cache_probe")"
    rm -f "$next_cache_probe"

    if [ "${PRODUCTION_NEXT_CACHE_SAVE_ENABLED:-false}" = 'true' ] && \
      [ "$next_cache_archive_bytes" -le "${PRODUCTION_NEXT_CACHE_MAX_ARCHIVE_BYTES}" ]; then
      next_cache_save_eligible=true
    fi
  fi
  {
    echo "next_cache_bytes=$next_cache_bytes"
    echo "next_cache_files=$next_cache_files"
    echo "next_cache_archive_bytes=$next_cache_archive_bytes"
    echo "next_cache_save_eligible=$next_cache_save_eligible"
  } >> "$GITHUB_OUTPUT"
  {
    echo '### Production Next build cache'
    echo "- restored: ${PRODUCTION_NEXT_CACHE_RESTORE_HIT:-false}"
    echo "- cache files: $next_cache_files"
    echo "- cache bytes: $next_cache_bytes"
    echo "- measured gzip archive bytes: $next_cache_archive_bytes"
    echo "- write enabled: ${PRODUCTION_NEXT_CACHE_SAVE_ENABLED:-false}"
    echo "- save eligible (<= ${PRODUCTION_NEXT_CACHE_MAX_ARCHIVE_BYTES} bytes): $next_cache_save_eligible"
  } >> "$GITHUB_STEP_SUMMARY"

  provenance_digests="$(node .github/scripts/production-input-provenance.mjs artifact \
    "$provenance_dir/artifact.json" "$provenance_dir/inputs.json" \
    "$provenance_dir/sbom.cdx.json")"
  read -r input_receipt_digest artifact_digest <<< "$provenance_digests"
  [[ "$input_receipt_digest" =~ ^[0-9a-f]{64}$ && "$artifact_digest" =~ ^[0-9a-f]{64}$ ]] || \
    fail_stage "Production input receipt digest is invalid." production_artifact_failed

  deploy_json=""
  export VERCEL_GIT_COMMIT_SHA="$EXPECTED_SHA"
  export NEXT_PUBLIC_BUILD_SHA="$expected"
  # Return after Vercel accepts the deployment; the exact-ID inspect
  # below owns readiness, while this loop retries pre-acceptance errors.
  for deploy_attempt in 1 2 3; do
    if deploy_json="$(./node_modules/.bin/vercel deploy \
      --prebuilt --archive=tgz --prod --skip-domain --no-wait --format=json \
      --env VERCEL_GIT_COMMIT_SHA \
      --env NEXT_PUBLIC_BUILD_SHA \
      "${runtime_env_args[@]}" \
      --meta "githubCommitSha=${EXPECTED_SHA}" \
      --meta "jovieInputReceipt=${input_receipt_digest}" \
      --meta "jovieArtifactDigest=${artifact_digest}" \
      "${scope_args[@]}")"; then
      break
    fi
    if [ "$deploy_attempt" -eq 3 ]; then
      fail_stage "Production prebuilt deployment failed." production_artifact_failed
    fi
    echo "Production prebuilt deploy attempt ${deploy_attempt}/3 failed; retrying in 10s."
    deploy_json=""
    sleep 10
  done
  if ! jq -e 'type == "object"' >/dev/null 2>&1 <<<"$deploy_json"; then
    fail_stage "Production deploy returned malformed JSON." production_artifact_failed
  fi

  production_deploy_id="$(jq -r '.id // .deployment.id // ""' <<<"$deploy_json")"
  production_deploy_url="$(jq -r '.url // .deployment.url // ""' <<<"$deploy_json")"
  if [[ "$production_deploy_url" != *://* && "$production_deploy_url" == *.vercel.app ]]; then
    production_deploy_url="https://${production_deploy_url}"
  fi
  production_deploy_url="${production_deploy_url%/}"
  if [[ "$production_deploy_id" != dpl_* ]] ||
    [[ "$production_deploy_url" != https://*.vercel.app ]]; then
    fail_stage "Production deploy returned an invalid deployment ID or URL." production_artifact_failed
  fi
  echo "Staged production deployment: ${production_deploy_id} (${production_deploy_url})"
}
