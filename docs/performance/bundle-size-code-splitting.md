# Bundle Size & Code Splitting – Plan

Owner: @itstimwhite
Scope: #378 (bundle/code splitting) across app/pages/components

## Goals

- Reduce initial JS bundle and TTI for marketing and profile routes.
- Defer dashboard-only code (DnD, charts) from public surface.
- Establish bundle analysis baseline and CI guardrails.

## Actions

1. Baseline

- Add @next/bundle-analyzer and capture current per-route bundles.
- Document top offenders and shared vendor chunks.

2. Code splitting & lazy loading

- Route-level dynamic imports for dashboard-only modules.
- Library-level splitting for Stripe and @dnd-kit in dashboard surfaces only.
- Confirm all images use `next/image` with appropriate sizes and priority.

3. next.config.js

- Enable `optimizePackageImports` for safe packages.
- Verify tree-shaking and sideEffects.
- Ensure images.domains/formats configured.

4. Monitoring

- Add `ANALYZE=true pnpm build` docs and CI artifact for analyzer output.
- Enforce performance budgets in CI via `pnpm test:budgets`, including `/` and `/[username]` routes from `performance-budgets.config.js`.

## Targets

- Initial JS (profile/marketing): < 200KB gzipped.
- TTI (fast 3G): < 3s for marketing/profile.
- No dashboard-only libs in public routes.

## Rollout

- Ship in small PRs behind flag `feature_bundle_split` (default OFF) if risky.
- Measure with Web Vitals and bundle analyzer between PRs.

## Risks

- Dynamic import SSR false-positives; ensure correct `ssr` settings.
- Client/Server boundary leaks; prefer Server Components unless required.

## Notes

- Comply with guardrails: use Next primitives, Tailwind, Server Components by default, no 'any', runtime-aware analytics only.
