#!/usr/bin/env bash
for env_file in .vercel/.env.preview.local .vercel/.env.local; do
  if [ ! -f "$env_file" ]; then
    continue
  fi
  url_line="$(grep -E '^UPSTASH_REDIS_REST_URL=' "$env_file" | head -n 1 || true)"
  if [ -z "$url_line" ]; then
    continue
  fi
  url_value="${url_line#UPSTASH_REDIS_REST_URL=}"
  url_value="${url_value#\"}"
  url_value="${url_value%\"}"
  url_value="${url_value#\'}"
  url_value="${url_value%\'}"
  case "$url_value" in
    https://*)
      ;;
    *)
      echo "[env] dropping non-https UPSTASH_REDIS_REST_* entries from $env_file"
      grep -v -E '^UPSTASH_REDIS_REST_(URL|TOKEN)=' "$env_file" > "${env_file}.tmp" || true
      mv "${env_file}.tmp" "$env_file"
      ;;
  esac
done
