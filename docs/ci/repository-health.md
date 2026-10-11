# Repository health policy

Status: candidate checks in shadow. Baseline: exact `origin/main` `93fadfe7d3c9807dddb1ae58398035b58e07168b`, measured 2026-08-04. Checkout/history timings were captured at starting main `bc23f8e0724c3d48e73981759841b8fe9f74f753`; intervening main rebases changed 13,284 text bytes but no path count.

## Decision

Keep the monorepo. Retire the arbitrary 10,000-file failure through a compatibility phase: exact main is the visible grandfathered measurement, not a blocking number. Existing payload, generated-output, and snapshot gates remain blocking. Measured incremental file-growth and tighter binary-churn candidates ship in shadow first.

Commit `3ca7976f` / PR #14346 introduced 10,000 when the repository had 9,230 files. Its derivation was 770 files of headroom with re-evaluation at 9,500. That condition has been met: exact main has 10,014 regular files, or 9,945 under the old exclusions. Raising the same number would not improve health. Checkout and scan cost remain small; repeated binary screenshot history is the measured bloat, not file number 10,000.

## Exact-main audit receipt

### Tree, history, and concentration

| Measure | Result |
| --- | ---: |
| Indexed paths / regular files / symlinks | 10,067 / 10,014 / 53 |
| Regular / binary payload | 162.55 MiB / 75.77 MiB |
| Fresh worktree checkout / clean status / hygiene scan | 2.11s / 0.23s / 0.13s |
| Fresh checkout disk | 184.3 MiB |

The shared object store for all local refs/worktrees was 7.0 GiB (6.45 GiB packs, 539.46 MiB loose), so it is not exact-main size. The initial shallow exact-main reachable set was 230,445,053 bytes; all then-local refs reached 1,452,480,031 bytes. Deepening main to 2026-05-01 transferred 730.80 MiB, 37,356 objects, and 31,113 deltas: history weight is materially larger than the checkout.

| Area | Files | Bytes |
| --- | ---: | ---: |
| `apps/web` | 8,002 | 147,155,459 |
| `scripts` | 357 | 2,858,525 |
| `.agents` / `.claude` | 341 / 225 | 5,133,129 / 2,920,881 |
| `docs` / `.github` | 209 / 159 | 4,760,265 / 1,537,550 |
| `apps/ios` / `packages/ui` | 153 / 137 | 1,797,280 / 688,875 |

| Type | Files | Bytes |
| --- | ---: | ---: |
| `.ts` / `.tsx` | 4,860 / 2,868 | 27,054,784 / 13,720,182 |
| Markdown / MJS | 622 / 290 | 7,727,421 / 2,205,771 |
| PNG / JSON | 244 / 211 | 60,509,421 / 32,729,562 |

Tests account for 3,020 files / 24.47 MiB; fixtures 103 / 0.56 MiB; stories 140 / 0.33 MiB; snapshots 65 / 6.39 MiB; current visual catalog and public exports 95 / 41.30 MiB; generated design output 3 / 15 KiB; migration metadata 58 / 32.27 MiB. These are separate cost classes.

Largest current blobs are the 9.06 MiB pitch PDF, 4.04 MiB demo video, 1.2-2.1 MiB pitch/catalog images, 1.23 MiB lockfile, and 0.8-0.86 MiB migration snapshots. Hashing found 62 duplicate groups, 70 duplicate paths, and 15.52 MiB duplicated checkout payload. Most are intentional export/catalog pairs, logos, or fonts; Git stores identical blobs once. No path is deleted without consumer and replacement proof.

### Growth and churn

| Window | Regular files | Net files | Tree bytes | Net bytes |
| --- | ---: | ---: | ---: | ---: |
| 2026-08-04 | 10,014 | - | 170,445,756 | - |
| 30 days | 8,945 | +1,069 | 160,657,700 | +9,788,056 |
| 90 days | 6,504 | +3,510 | 89,659,970 | +80,785,786 |

Thirty-day growth: `apps/web` +641, tests +440, TypeScript +495, scripts +123, `.claude` +103, TSX +134. Ninety-day growth: `apps/web` +2,487, tests +1,321, TypeScript +1,856, TSX +551, scripts +323, MJS +252. This is chiefly product/test growth, not leaked build directories.

The 30/90-day windows contained 1,045/2,928 squash commits, 8,491/24,061 touches, 3,903/7,015 unique paths, 572,215/1,557,791 additions, and 129,222/256,198 deletions. Per-commit net regular-file p99 was +12/+16; 90-day `apps/web` p99 +12 and `scripts` +4.

New reachable blobs cost 293.71 MiB on disk over 30 days and 985.26 MiB over 90 days, while the current tree grew 9.33 MiB and 77.04 MiB. Screenshot paths accumulated 125-144 versions; automated commits added 30-41 MiB each. Binary-file count p99 was 20 and max 98; new-blob disk p99 was 9.52 MiB and max 41.39 MiB.

### Dependency, build, and organizational cost

The workspace has 11 Turbo packages (12 `pnpm list` entries including root), three internal dependency edges, and 8,313 typecheck inputs; `apps/web` owns 8,002. Only 4.0% of 30-day and 6.1% of 90-day commits touched multiple workspaces. This compact graph has one dominant app, not evidence that more repositories reduce burden.

- Warm/local-store install: 18.6s; `node_modules` 3.6 GiB. Setup then hit the pre-existing fail-closed `lsof` retention check.
- Cache-cold web typecheck: 42.70s.
- Unsharded web `test:fast`: 2,336 files, 18,379 tests, green in 14m27s; CI uses ten shards.
- Knip: 7.90s and one proven obsolete dependency, `flag-icons`; removal saves 552 installed files / 5.5 MiB. Two owned SVGs already serve the live flags.

File count, checkout/history size, dependency/build complexity, and organizational coupling are reported and governed separately.

## Automated policy and rollout

### Blocking at launch

| Existing rule | Limit |
| --- | ---: |
| Single changed file / binary | 10 MiB / 10 MiB |
| Changed payload / binaries | 60 MiB / 120 files and 60 MiB |
| Tracked regular / binary payload | 198 MiB / 96 MiB |
| Canonical visual baselines | 100 files / 12 MiB |
| Forbidden tracked outputs | Zero new violations |

The 10,000-file failure is retired, not raised. `scripts/repo-health-baseline.json` records the 10,014 exact-main total, 9,945 old compatibility count, and legacy findings by rule/area. Receipts show the current total and delta. Existing PR-size, generated-placement, payload, binary, and visual gates still fail normally; there is no `continue-on-error`.

### Candidate rules: shadow first

| Candidate | Advisory threshold | Evidence |
| --- | ---: | --- |
| Net regular files per PR | +20 | 90-day p99 +16 plus 25% |
| `apps/web` / `scripts` | +15 / +5 | p99 +12 / +4 plus 25% |
| `.github` / other area | +3 / +5 | p99 +1 plus bounded headroom |
| Changed binaries | 24 files / 12 MiB | p99 20 / 9.52 MiB |

`scripts/repo-health-rollout.json` controls maturity. Changing the mode alone cannot promote it: evidence is schema-checked, and approval must name the exact target mode.

| Mode | Behavior | Required evidence |
| --- | --- | --- |
| `shadow` (ships first) | Candidate findings are advisory; existing gates block | Typed legacy baseline and retained receipts |
| `delta-blocking` | Only current-diff findings or growth above a rule baseline block | 14 days, 20 shadow runs, 20 representative real PRs, false positives at most 5%, p95 at most 1s, ownership at least 95%, GitHub approver + Linear issue + date |
| `full-blocking` | All findings for the promoted rule block | 14 days and 20 delta runs, zero legacy findings for that rule, false positives at most 2%, explicit approval |

If a rule discovers 800 legacy findings, its typed baseline stores rule, area, count, owner, and disposition. Shadow prints/uploads 800 without failing. Delta keeps 800 visible and blocks finding 801 or a current-diff violation. Full mode cannot pass validation until the approved legacy count is zero. Unit tests lock this behavior.

Each source PR retains `repo-health-receipt.json` for 90 days with runtime, mode/evidence, limits, baseline, total and old-compatibility counts, bytes, binaries, visual baselines, area growth, exceptions, advisories, and failures. The evidence file starts at zero; representative feature, test, docs, dependency, and binary-heavy receipts must be reviewed before promotion.

### Release-updates compatibility proof

The untouched `codex/unified-release-updates` worktree has 12 staged files: five modifications and seven source/test additions. Its historical guard failed only with `10007 tracked regular files exceed the 10000-file repository budget`. This compatibility guard passes the same index: 12 changed files, 0.26 MiB, net +7, 10,013 total regular files, 163.00 MiB tracked, 76.32 MiB binary, and no candidate finding. This removes that obsolete blocker only; it does not prove product tests, review, merge, or deployment.

### Placement, baselines, and exceptions

Generated/build/test output remains forbidden under `node_modules`, `.next`, `.turbo`, cache, coverage, Playwright, build, temp, runtime, and local-agent paths. Track generated output only when a named runtime or audit consumes the stable path; it still counts in receipts and budgets.

Baselines are shrink-only by default. CI compares them with the PR base. Every measurement edit requires a new SHA and revision; an increase or new nonzero legacy rule additionally requires a GitHub approver, Linear issue, date, reason, and measurements in `changeApproval`.

Exceptions in `scripts/repo-hygiene-exceptions.json` require one exact branch, scoped path prefixes, GitHub owner, Linear issue, measured reason, bounded keys, and at most 30 days. Expired exceptions fail. Shadow validates but never applies exceptions, so they cannot hide advisory signal.

## Hard decision rules

### Keep the monorepo

Keep it unless one extraction candidate satisfies every split rule below for two consecutive 30-day receipts. File count alone is never a split signal. Prefer a typed in-repo package boundary first.

### Raise a budget

Approved raise (JOV-6635, measured 2026-09-27): `maxTrackedBytes` 180 → 198 MiB
(+10%, the per-raise cap). Exact `origin/main` measured 178.14 MiB of tracked
regular files — 99.0% of the prior budget, over the ≥90% qualifying threshold —
leaving ~1.9 MiB of headroom that blocked any PR adding tracked bytes. Fresh
measurements (`git ls-tree -r -l` blob sums on `origin/main`): tree payload
158,180,819 B 90 days ago → 187,760,331 B 30 days ago → 184,001,777 B now
(+25.8 MB / 90d; the 30-day figure exceeds today because a recent binary purge
shrunk the tree); tracked regular files 8,627 → 10,988 → 13,299; 11 distinct
contributors over 90 days. `pnpm knip` reports only three small unused
dependency entries (no tracked-byte savings); the prior hash audit's 15.52 MiB
of duplicates are intentional export/catalog pairs, logos, and fonts; the
largest blobs (9.06 MiB pitch PDF, 4.04 MiB demo video, catalog PNGs, ~32 MiB
migration metadata) have live consumers. No safe removal approaches the scale
of the shortfall, so the budget, test, and this rationale change together.

Approved raise (measured 2026-10-10, visual-baseline auto-refresh PR #21189):
`maxSnapshotFiles` 100 → 110 (+10%, the per-raise cap). Exact `origin/main`
measured 100 canonical baselines in `apps/web/tests/e2e/__snapshots__/` — 100%
of the prior budget — so the admin-surface coverage added by the JOV-4326
consolidation (`admin-surface-manifest.ts` grew to 24 desktop + 10 mobile
slugs) could not land its generated baselines. The refresh also surfaced 10
orphaned baselines whose slugs no longer exist in the manifest
(`admin-algorithm-health-*`, `admin-overview-*`, `admin-growth-outreach-{all,dm,email,review}-desktop`,
`admin-growth-leads-mobile`, `admin-people-waitlist-mobile`); no spec
references them, so they were pruned in the same change. Resulting tree: 106
files (~8.7 MiB of the unchanged 12 MiB `maxSnapshotBytes` budget). The +10%
raise restores a small headroom so ordinary new coverage does not trip the
guard on every landing.

All must hold: exact-main is at least 90% of an absolute byte budget or two ordinary changes exceed a p99 delta; 30/90-day tree/new-blob, contributor, checkout, and CI measurements are included; Knip, hashes, generated paths, and owners prove no safe removal; increase is at most p99 +25% for deltas or 10% for payloads; tests and rationale change together. Larger changes require a separate decision and Linear issue. A number-only change fails review and never promotes rollout mode.

### Prune or archive

Delete only after an owner, consumer/import search, replacement proof, history, and focused tests show obsolescence. Knip is evidence, not sole authorization. Remove generated output only when regeneration/retrieval and retention are tested. Never delete user work for a budget. History rewriting or LFS migration requires explicit approval, coordinated clone/worktree migration, and at least 25% measured reachable-history savings.

Pruned under this rule (JOV-6671): historical `apps/web/drizzle/migrations/meta/*_snapshot.json` files. Each snapshot is a ~1 MiB full-schema copy; the directory grew to 83 files / ~54 MiB, the single largest tracked cost class, and pushed main to ~99% of the tracked-bytes budget. `drizzle-kit generate` reads only the newest snapshot as its diff base and `drizzle-kit check`/`up` only validate the snapshots that remain; the runtime migrator reads `_journal.json` + `*.sql` and never touches snapshots. Ship now: retain only the newest snapshot (deleted 0000–0116, kept `0117_snapshot.json`), recover ~52.7 MiB, and cap retention at 8 snapshots — enforced by `scripts/repo-hygiene-guard.test.mjs`, which tells the crossing PR to `git rm` the oldest snapshots. Re-evaluate when: a `drizzle-kit` upgrade consumes older snapshots (`up`/`generate` fails citing a missing `*_snapshot.json`) or the diff history is needed for a schema audit. Then: restore from git history (`git checkout <sha> -- <path>`) or regenerate via `drizzle-kit` from the live database.

### Split a package or repository

All must hold for two consecutive 30-day windows:

1. **Coupling:** fewer than 10% of commits require atomic cross-boundary edits; no dependency cycle.
2. **Release cadence:** at least 80% of releases are independent; shared version/changelog stamping is unnecessary.
3. **Ownership:** one durable team owns compatibility, incidents, security, and deprecation.
4. **Build/cache:** at least 20% measured CI wall time or invalidated inputs disappear after cache effects.
5. **History/checkout:** candidate owns at least 25% of weight, and sparse/partial clone cannot remove half that cost.
6. **Operations:** access, secrets, releases, dependency updates, observability, rollback, and cross-repo changes have lower total operator cost.

Otherwise keep the monorepo and address the measured payload, build, or ownership problem directly.

## Safe cleanup playbook

1. Run `node scripts/repo-hygiene-guard.mjs --diff-base origin/main --report repo-health-receipt.json` from exact main.
2. Run `pnpm knip`; confirm candidates with `rg`, manifests, registries, history, owners, and tests.
3. Hash duplicates; remove only paths with owned replacement proof. Export/catalog copies can both be valid.
4. Move ephemeral output to an ignored owned path or retained CI artifact; keep stable consumed manifests only.
5. Curate/split binary churn. Use an expiring exception only after promotion, never a global raise to land one change.
6. Run focused tests, typecheck/lint, hygiene, and Knip; retain the receipt and write durable decisions to GBrain.
