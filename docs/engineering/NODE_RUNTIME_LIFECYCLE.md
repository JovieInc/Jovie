# Node runtime lifecycle

Jovie keeps the production runtime boring while continuously testing the next supported release. The machine-readable source of truth is `config/node-runtime-policy.json`; `scripts/node-runtime-policy.mjs` enforces it.

## Current state

- Production/default: the exact Maintenance LTS patch in `.nvmrc`, with pnpm `9.15.4`.
- Required compatibility candidate: latest Node 24 (Active LTS).
- Advisory shadow: latest Node 26 (Current until its planned October 2026 LTS transition). Shadow failures are evidence, not permission to weaken engines.
- A candidate never changes `.nvmrc`, Vercel, or the baked runner image merely because a new release exists.

Official lifecycle and release metadata come directly from the Node.js Release working group schedule and `nodejs.org/dist/index.json`. Production must remain Active or Maintenance LTS. A regular patch has a seven-day adoption SLA; a security patch has a 24-hour SLA.

## Recurring invariant

`.github/workflows/node-runtime-compatibility.yml` checks official lifecycle and patch freshness daily, with the heavier compatibility matrix weekly and on demand. Each candidate gets an isolated exact-lockfile install, declared-engine probe, native `sharp` smoke, web unit suite, runtime contract tests, typecheck, and production build.

The Node 24 candidate lane is required for the workflow to be green. The Node 26 shadow lane is allowed to fail while Current; the failure remains visible. The fast pull-request gate only runs deterministic policy tests, so the weekly build matrix cannot slow ordinary shipping.
This schedule is explicitly approved as part of the runtime lifecycle system. It makes one lightweight policy job daily and two hosted compatibility jobs weekly, uses only public Node metadata, and introduces no paid API, secret, database, or production request.

## Promotion rings

1. **Compatibility:** the candidate must be Active LTS and pass three consecutive weekly runs spanning at least 14 days. The workflow then opens one idempotent promotion issue automatically.
2. **Preview:** a pin-change PR updates `.nvmrc`, `.node-version`, engines, runner prerequisites, and the runner image checksum together. CI must produce an immutable preview build and smoke it before any production default changes.
3. **Production:** the normal native merge queue proves the exact combined head. The production controller stages that exact build, runs health checks, and only then promotes it.

Node 26 cannot enter the promotion ring while it is Current, even if its shadow lane is green. No founder decision is needed for an ordinary LTS promotion that satisfies these gates. Choosing Current for production, accepting an unsupported dependency, or bypassing a failed ring is a founder decision.

## Bounded rollback

Keep the previous verified Vercel deployment and prior Node pin available until the new runtime has cleared production health. If a runtime regression appears, the production controller promotes the prior verified deployment immediately; the pin-change PR is reverted through the native queue. The rollback owner is singular (`production-controller`) and the maximum recovery window is 30 minutes. Do not rebuild an old source tree during the incident—the immutable prior deployment is the rollback artifact.

## Adopt-first receipt

Category: runtime update management. Existing Dependabot does not manage the Node runtime contract, while adding Renovate or another updater would introduce a second dependency bot and broader mutation authority. Jovie therefore composes its existing GitHub Actions/setup-node substrate with official Node metadata and a small repository-specific policy evaluator. Revisit Renovate if the repository adopts it for dependency management generally or if more than one runtime needs the same lifecycle controller.
