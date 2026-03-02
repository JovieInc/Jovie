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

## Compliance evidence map (Scorecard alert #161)

The Scorecard check grants points once the repository is enrolled and a badge level is achieved.
To reduce friction for enrollment, this map links common OpenSSF questionnaire areas to existing repository controls.

| OpenSSF area | Repository evidence |
| --- | --- |
| Public contribution process | `CONTRIBUTING.md` |
| Vulnerability disclosure process | `SECURITY.md` |
| Automated checks on contribution | `.github/workflows/ci.yml`, `.github/workflows/verify.yml` |
| Code review requirement | `.github/CODEOWNERS`, branch protection/rulesets |
| Licensing clarity | `LICENSE` |
| Documentation availability | `README.md`, `docs/` |

If any evidence is missing during self-assessment, create a focused follow-up issue and link it from this section.

## Enrollment runbook

1. Sign in at <https://www.bestpractices.dev/> using an account with repository admin access.
2. Add repository URL: `https://github.com/JovieInc/Jovie`.
3. Complete and submit required claims for at least the **passing** level.
4. Use `docs/security/CII_BADGE_SUBMISSION_CHECKLIST.md` to capture claim-by-claim evidence links.
5. Add the issued badge URL and project ID to `README.md` in the "Security & trust" section.
6. Re-run Scorecard workflow and verify `CII-Best-Practices` improvement.

## Owner + review cadence

- **Owner:** Security / Platform Engineering
- **Cadence:** Review badge status quarterly or after major process changes

## References

- OpenSSF Scorecard check docs: <https://github.com/ossf/scorecard/blob/main/docs/checks.md#cii-best-practices>
- OpenSSF Best Practices program: <https://www.bestpractices.dev/>
- OpenSSF criteria index: <https://www.bestpractices.dev/criteria>
