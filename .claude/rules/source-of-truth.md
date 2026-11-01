---
paths: ["canon/sources-of-truth.json", "canon/SOURCES_OF_TRUTH.md", "apps/web/lib/config/**", "apps/web/lib/entitlements/**", "apps/web/lib/billing/**", "apps/web/lib/stripe/**", "apps/web/data/marketingPricingPlans.ts", "apps/web/content/legal/**", "ops/registry/**", "scripts/sources-of-truth*", "scripts/lib/sources-of-truth*"]
---

# One Source of Truth Per Fact

Tim, 2026-10-29: "Make sure it's not possible for these kinds of drifts.
Everything must have one source of truth."

Before adding or changing a fact (a model id, a price, a plan name, a limit, a
retention window, a nav link, a flag, an env name, a legal claim):

1. Find its domain in `canon/sources-of-truth.json` (rendered as
   `canon/SOURCES_OF_TRUTH.md`). The domain names the ONE owner and its derived
   surfaces.
2. Change the value in the owner only. Derived surfaces import, generate or read
   it; they never restate it. Copy that quotes a number takes it from the owner.
3. No domain fits? Add one to the map in the same PR, with an owner that already
   exists or a new registry. Do not start a parallel registry.
4. An external authority (Stripe, Vercel, Linear, DNS, provider model lists) is
   mirrored by the owner and proven by a live drift check, not by trust.

`node scripts/sources-of-truth.mjs` checks the map (owners exist, one owner per
domain, markdown rendered); `--write` regenerates the markdown. `pnpm
preflight:changed` runs it whenever the map or an owner file changes.
