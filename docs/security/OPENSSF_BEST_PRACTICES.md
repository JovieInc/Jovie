# OpenSSF Best Practices Plan

This document defines Jovie's path to obtaining and maintaining the OpenSSF Best Practices badge, which directly improves the Scorecard `CII-Best-Practices` check.

## Why this exists

Scorecard's `CII-Best-Practices` signal is sourced from the OpenSSF Best Practices program (`bestpractices.dev`).
Without registration and claim verification there, Scorecard reports a low score even when strong practices are present in-repo.

## Current status

- [x] Security policy published (`SECURITY.md`)
- [x] Automated lint, typecheck, format, and test workflows present in CI
- [ ] Repository enrolled in OpenSSF Best Practices
- [ ] Badge level earned (`passing`, `silver`, or `gold`)

## Enrollment runbook

1. Sign in at <https://www.bestpractices.dev/> using an account with repository admin access.
2. Add repository URL: `https://github.com/JovieInc/Jovie`.
3. Complete and submit required claims for at least the **passing** level.
4. Add the issued badge URL and project ID to `README.md`.
5. Re-run Scorecard workflow and verify `CII-Best-Practices` improvement.

## Owner + review cadence

- **Owner:** Security / Platform Engineering
- **Cadence:** Review badge status quarterly or after major process changes

## References

- OpenSSF Scorecard check docs: <https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-best-practices>
- OpenSSF Best Practices program: <https://www.bestpractices.dev/>
