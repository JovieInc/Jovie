# OSS Spin-Out — AI Maintenance Loop (Phase 0)

The structural moat: human maintainers burn out at month 3; Jovie's skills are already run by AI 24/7. The portfolio stays alive forever, cheaply.

## The loop (weekly, per OSS repo)
1. **Dependency bump** — run dependency bots, merge safe updates.
2. **README freshness** — keep the "<60s sales page" current as features land.
3. **Issue triage** — triage every issue within 24h (label, close dupes, surface real bugs).
4. **PR review + merge** — review inbound PRs, merge clean ones.
5. **Responsiveness** — within the Trending window, respond to every issue/PR/discussion within hours (algorithm amplifier).

## Existing Jovie skills that power it
- `github-issues` / `verify-your-work` — issue triage + honest verification
- `pr-closeout-enroll-or-park` — drive PRs to enrolled/merged/parked
- `github-complex-rebase` / `github-pr-rebase` — rebase maintenance
- `shipping-watchdog` / `mq-guard` — keep the loop green
- `ci-ownership-and-queue-drain` — CI health

## Setup (Phase 0)
- Point the existing maintenance cron/skills at the future OSS repo dirs.
- Tagline to sell: "Maintained by an AI agent, forever, for free." — the consistency IS the differentiator sponsors pay for.

## Status
- This is the plan. Actual cron wiring happens per-repo at launch (Phase 1+).