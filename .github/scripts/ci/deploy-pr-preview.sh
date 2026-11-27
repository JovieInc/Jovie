#!/usr/bin/env bash
# For fast preview PRs: use main secrets (no Neon dependency)
# Fallback hierarchy for maximum compatibility
POOLED_URL=""
if [ -n "$DATABASE_URL_MAIN" ]; then
  POOLED_URL="$DATABASE_URL_MAIN"
  echo "Using main database URL"
elif [ -n "$DATABASE_URL" ]; then
  POOLED_URL="$DATABASE_URL"
  echo "Using fallback database URL"
else
  # Provide cheap stub for UI-only deployments that might not need DB
  POOLED_URL="postgresql://stub:***@localhost:5432/main_stub"
  echo "Using stub database URL for UI-only deployment"
fi
export DATABASE_URL="$POOLED_URL"
export GIT_BRANCH

for i in {1..3}; do
  if bash .github/scripts/vercel-prebuilt-deploy.sh deployment_url \
    --env DATABASE_URL \
    --env GIT_BRANCH; then
    break
  fi
  echo "Vercel deploy attempt $i failed, retrying in 10s..."
  sleep 10
  if [ "$i" -eq 3 ]; then exit 1; fi
done
