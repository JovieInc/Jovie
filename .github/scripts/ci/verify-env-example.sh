#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env.example ]; then
  echo "No .env.example found; skipping."
  exit 0
fi

# Fail on common secret/token prefixes.
if grep -nE '(sk_live_|sk_test_|rk_live_|rk_test_|whsec_|ghp_|github_pat_|xoxb-|BEGIN PRIVATE KEY|-----BEGIN)' .env.example; then
  echo "❌ .env.example appears to contain a real secret/token. Replace with placeholders."
  exit 1
fi

# Fail on real-looking Stripe price IDs (these should be placeholders).
if grep -nE '^STRIPE_PRICE_.*=price_[A-Za-z0-9]+' .env.example; then
  echo "❌ .env.example contains Stripe price IDs. Replace with placeholders."
  exit 1
fi

echo "✅ .env.example looks safe (no obvious secrets)."
