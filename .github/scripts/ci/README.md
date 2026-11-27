# CI step scripts

[CI](../../workflows/ci.yml) declares all job IDs, names, triggers, dependencies,
permissions, runners, timeouts, applicability, and artifact actions. These
scripts hold Bash that already ran after checkout at the job's source SHA.
Each call keeps its original working directory, environment, and Bash options.

The table covers every job in the workflow. A script link in the workflow is
the entry point for moved logic. The remaining shell stays where its Actions
expression, credentials, checkout, or cross-job context is declared.

| Area | Job IDs | Responsibility |
| --- | --- | --- |
| Runner and workspace proof | `runner-image-offline-proof`, `runner-image-canary`, `ci-merge-group-workspace`, `ci-unit-runner-route`, `ci-lockfile-preflight` | Runner image evidence has local entry points after exact checkout. The pinned actions and prepared dependency workspace still own bootstrap. Runner routing reads the existing sparse trusted policy. |
| Intake and protected gates | `ci-path-changes`, `ci-merge-group-admission`, `ci-merge-group-supersede`, `ci-risk-classifier`, `ci-env-example-guard`, `ci-secret-scan`, `ci-golden-path-lock`, `ci-pen-diff`, `ci-slop-guard`, `security-gate` | Path and placeholder checks run local scripts. Admission and cancellation keep their sparse trusted entry points and token boundaries. The secret scan, Pen diff, and risk logic keep their existing selectors and tooling. |
| Rendered marketing evidence | `ci-visual-snapshot-compare`, `ci-visual-snapshot-homepage`, `ci-visual-marketing-dom`, `ci-visual-marketing-routes` | One build supplies the same three downstream consumers. Smokes and captures are scripts. Job conditions, artifact names, and artifact staging stay in the workflow. |
| Fast and structural gates | `ci-fast-typecheck`, `ci-fast-remaining`, `ci-fast-remaining-shards`, `ci-profile-admission-browser`, `ci-profile-viewport-sweep`, `ci-fast`, `ci-fast-structural-python`, `ci-fast-structural-web`, `ci-fast-structural-lanes`, `ci-fast-structural-lanes-shards`, `ci-knip` | Shared history-fetch start and wait scripts preserve the existing parallel setup. Coverage checks remain available after checkout. No-work receipt collection stays inline so it can run without a checkout. The required fan-ins and the existing lane runner retain their identities. The grandfathered incident service query stays in its declared workflow step. |
| Model-free evals and blog | `ci-promptfoo-evals`, `ci-golden-eval-set`, `ci-blog-content` | Existing commands own the eval suites. Blog classification and the qualification latency receipt use standalone scripts while the job still owns applicability and upload. |
| Database and migration | `neon-db`, `drizzle-migration-guard`, `ci-drizzle-check`, `ci-integration-ready`, `ci-pr-neon-migrate`, `ci-e2e-migrate` | Neon URL and artifact preparation use local scripts. Provider provisioning, migration credentials, and cleanup keep their current actions, conditions, and permissions. |
| Product build and promotion receipts | `ci-build-layout`, `ci-build-ovie`, `ci-typecheck-ovie`, `ci-storybook-surfaces`, `ci-apple-post-queue`, `ci-ios`, `ci-macos`, `ci-cross-product-integration`, `ci-product-lane-receipt`, `ci-build-public`, `ci-layout-guard` | Layout, Apple deferral, and joined-lane receipt logic move after checkout. Native reusable workflows, Storybook surface evidence, and all producer/consumer contracts retain their event and artifact wiring. |
| Browser and performance | `ci-mobile-overflow`, `ci-lighthouse-pr`, `ci-lighthouse-dashboard-pr`, `ci-lighthouse-onboarding-pr`, `ci-lighthouse-admin-pr`, `ci-lighthouse-chat-pr`, `ci-a11y`, `ci-a11y-authed`, `ci-test-performance` | Lighthouse and a11y proof procedures have executable entries. Browser bootstrap, fixtures, credential selection, and rendered evidence uploads keep the existing boundaries. The visual comparator’s required commands remain visible in their three workflow steps. |
| Unit and coverage | `ci-unit-tests`, `ci-exact-head-coverage-shard`, `ci-exact-head-coverage` | Exact-head coverage reuses its history-fetch script. The exact collection command stays visible for the source/queue parity guard. Matrix selection, quarantine operands, same-attempt coverage evidence, and final coverage gating retain their contexts. |
| E2E and golden path | `ci-e2e-smoke`, `ci-golden-path`, `ci-golden-path-report`, `ci-admin-smoke`, `ci-e2e-tests`, `ci-smoke-required` | Quarantine loading and keyframe review move after checkout. Run bodies with GitHub interpolation, test identity setup, and cleanup retain their current environment and sequencing. |
| Preview and reporting | `ci-pr-vercel-preview`, `ci-summary` | Preview sanitation, deploy, readiness, and summary artifact assembly use separate scripts. The workflow still provides conditions, credentials, artifact identity, and the advisory publication steps. |
| Queue and release fan-in | `main-queue-provenance`, `ci-merge-suite-scope`, `ci-merge-group-ready`, `ci-pr-ready`, `main-release-ready` | The cheap final verdicts stay in the workflow so they can use `needs` and publish the same checks without gaining a checkout or coupling to candidate files. The post-verdict sparse release routing checkout stays narrow. |

Scripts in this directory receive values through the workflow environment.
Keep GitHub expressions in YAML. Commands that run before checkout stay
inline or use the existing trusted bootstrap. Preserve the exact source ref,
artifact producer identity, and secret scope when extracting another step.
