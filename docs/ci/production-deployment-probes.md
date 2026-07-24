# Production Deployment Probe Contract

The production controller proves the immutable Vercel deployment before it can
emit `Production Verified`. A successful HTTP status alone is not evidence: the
response must belong to the requested deployment route and the build identity
must match the exact release commit.

## Fail-closed invariants

1. Protected probes accept only the HTTPS `jovie-*-jovie.vercel.app` project and
   team hostname shape, with no embedded credentials, fragment, or unexpected
   query string. Before emitting that URL, the reusable release stages and
   inspects the deployment under the configured Vercel project ID. Browser
   bootstrap also requires that independently emitted origin to exactly match
   the Lighthouse target before attaching the credential.
2. The protection credential is required for an immutable deployment and is
   read from process memory by the shared Node bootstrap. It is never placed in
   a `curl` argument, query string, generated config, or child-process argument.
   It is used only on a manual-redirect bootstrap request to that exact origin.
   Ordinary health, page, SEO, and Lighthouse navigation requests are
   cookie-only. Missing credentials or cross-origin redirects stop the job.
3. Bootstrap cookies are taken only from that authorized response and are
   installed with the exact deployment URL rather than a Domain attribute; curl
   jars must also identify the host as non-tail-matching. No credential or
   cookie may be sent to canonical production, Vercel login, a sibling
   subdomain, or another origin. Before Lighthouse navigation, intercepted
   browser requests prove that the cookie is present on the exact host and
   absent from a child hostname without making either probe request.
4. Cookie-only access is verified against `/api/health/build-info`. The response
   must be HTTP 200 JSON from the exact origin and path, contain a non-empty
   build ID, identify the expected full release SHA by its application-reported
   prefix, and report the environment explicitly selected by the caller:
   `preview` for staging canary or `production` after a Production-target build.
   Omitting the environment is a configuration failure.
5. The live SEO ratchet tests the immutable deployment and `https://jov.ie`
   independently. The immutable ratchet reuses the public smoke job's verified
   exact-host cookie and never sends the bypass credential itself. Redirects,
   login HTML, malformed surfaces, or the wrong route fail the check.
6. Production Lighthouse runs in this order: collect, assert, then one
   exact-evidence guard that owns upload. Every collected report must preserve
   its requested immutable origin and path, produce the configured run count,
   and have assertion results for exactly one configured route. Zero matching
   assertions is a failure. The guard rejects symlinks, FIFOs, directories, and
   other non-regular entries; reads with `O_NOFOLLOW`; scans every artifact for
   the bypass secret and returned cookie values; hash-seals the complete upload
   set; copies that sealed set into a mode-0700 sibling temporary directory with
   mode-0400 files; runs the upload job from only that isolated copy without
   OIDC/attestation permission; and gives the third-party upload child only an
   explicit `PATH`/home/temp allowlist (never Actions runtime, GitHub, Vercel,
   token, or secret environment state). The guard re-proves the source seal
   after upload; its isolated-copy proof also includes inode, mode, size, mtime,
   and ctime, so a same-UID child cannot hide a chmod/write/restore mutation. It
   requires the uploader's derived `links.json` to cover every exact route,
   scans and removes it, and deletes the entire isolated tree and runner-local
   receipt.
7. The public smoke job owns homepage, profile, critical-page, and SEO proof;
   there is no duplicate homepage runner. Authenticated smoke is explicitly
   optional until a complete credential pair exists. Once configured, runtime
   verification challenges and unavailable sign-in forms fail instead of
   skipping. The job emits `passed` only after Playwright succeeds, and the
   verified-generation marker copies that result-derived state (or the explicit
   `not-configured` state) rather than inferring success from credential
   presence. Credentials are selected as one complete named pair: the primary
   email/password pair (and only its verification code) or the complete legacy
   pair. Values from different pairs are never combined. Every successful auth
   navigation and `/app` redirect must retain the exact configured immutable
   origin; canonical or foreign `/app` pages are explicit negative fixtures.
8. The credential boundary is repo-wide. Staged-production probes bind the
   deploy result to a project-scoped `vercel inspect`; the reusable canary binds
   caller URL and deployment ID to the READY deployment returned for the
   configured project and exact full commit. After the documented initial wait,
   resolution repeatedly scans a bounded number of Vercel API pages under one
   absolute deadline. Transport errors, known transient API statuses, missing
   list fields, and non-terminal deployment states may converge within that
   deadline; a present malformed or contradictory URL, ID, project, SHA, or
   terminal state fails immediately. A commit-only fallback must be unique and
   every scanned page must complete, so duplicate same-commit deployments or a
   partial scan cannot silently select the wrong origin.

   After the exact deployment ID and full SHA own `staging.jov.ie`, the staging
   browser exchanges the protection credential once against that trusted alias,
   with redirects disabled, and proves its host-only cookie through build-info.
   The pre-alias canary is mechanically forbidden from probing the shared alias.
   Staging and production then load the real sign-in UI, click both provider
   buttons, observe the actual Better Auth catch-all POST for each provider, and
   intercept the resulting Google/Apple navigation. The provider, canonical
   callback path, origin, and runtime `redirect_uri` must all match. Static
   `/api/auth/ok` namespace liveness and provider-console configuration are never
   accepted as Better Auth or OAuth runtime proof. Playwright global bypass
   headers and credential-bearing query URLs are forbidden; browser lanes use
   the same build-identity and outgoing-cookie boundary proof as Lighthouse.
   Browser interception is awaited before navigation, so the proof cannot race
   a real request.
9. Bootstrap, response-body consumption, browser cookie proof, exact build
   identity, and the shared public-surface checks run under one aborting
   absolute deadline with cleanup in `finally`. A stalled `fetch()` or response
   body cannot occupy a production runner until the workflow timeout. The
   shared semantic verifier requires exact HTTP 200 HTML documents for `/`,
   `/tim`, `/signup`, `/signin`, `/start`, and `/pricing`, rejects
   error/not-found shells, and requires JSON `status: ok` health evidence. HTTP
   204 and a 200 "Profile not found" shell are failures.
10. Every cookie value returned at runtime is masked immediately. Lighthouse
    and Playwright write mode-0600 receipts outside upload roots; their guards
    add those values to artifact scanning and delete the receipts on every exit.
11. Vercel authentication is supplied only through the child process environment.
    Workflow and helper command lines never include `--token` or `--env KEY=value`;
    runtime and build environment names use `--env KEY`/`--build-env KEY`, whose
    values are read from the pinned Vercel CLI process environment. Deploy output
    is captured in a mode-0600 temporary file, only the validated deployment URL
    is emitted, and raw CLI output is never replayed into logs.
12. Workflow permissions are least-privilege and explicit. Reusable-workflow
    caller permissions are only a ceiling. Only the dedicated no-checkout,
    no-secret `attest-staging-build` job receives `id-token: write` and
    `attestations: write`; it receives `contents: read` and only the fixed
    subject name/digest from the secret-bearing staging job. Deploy, Playwright,
    Lighthouse, promotion, rollback, Sentry, and verification jobs receive no
    OIDC/attestation permission, and every checkout disables persisted Git
    credentials.
13. A production-generation marker is authoritative only when its controller run
    and exact `Production Verified` job both completed successfully for the same
    SHA. One interrupted post-upload marker may recover once; the authorization
    job uploads the SHA-bound recovery lease before any production mutation.
    Thereafter a second attempt fails closed, preventing both permanent
    suppression and an unbounded redeploy loop.

The enforcement lives in `apps/web/scripts/vercel-protected-origin.cjs`,
`apps/web/scripts/lighthouse-vercel-bypass.cjs`,
`apps/web/scripts/lighthouse-exact-target-guard.ts`, and
`.github/scripts/guard-playwright-artifacts.mjs`, with callers in
`.github/workflows/ci.yml`,
`.github/workflows/canary-health-gate.yml`,
`.github/workflows/production-release.yml`, and
`.github/workflows/production-controller.yml`.

## Incident record: 2026-07-19 false production evidence

**Impact.** An immutable deployment protected by Vercel redirected probes to an
SSO login. Automatic redirect following turned that into HTTP 200 HTML. The SEO
ratchet rejected the HTML, but Lighthouse audited the login page and uploaded
successful-looking reports. Its route-specific assertion matrices matched zero
reports, which the CLI treated as no failed assertions. Production verification
was blocked by SEO, but Lighthouse emitted false-green evidence.

**Live corroboration.** Main Production Controller run `29702874377` promoted
exact deployment `dpl_13TokjqhwBheB8qYfmj2uZwgqwUp`
(`https://jovie-dojdmaf42-jovie.vercel.app`). Post-Deploy Smoke job
`88237170017` then reported the characteristic false SEO cascade: every major
AI crawler rule appeared missing and sitemap XML appeared malformed, while the
separate homepage and Lighthouse jobs passed. Production Verified job
`88237442493` correctly remained failed. The regression fixture now feeds that
login-HTML shape to both SEO routes and requires the exact-origin boundary to
reject it before semantic robots or sitemap diagnosis.

**Root causes.** Protection credentials and deploy-time values were exposed in
process arguments and attached to redirect-capable requests; response identity
was not bound to the immutable origin, deployment ID, path, commit, and
environment; the staging
canary queried only the newest 50 deployments and selected the first matching
SHA; public checks accepted empty 2xx and HTTP-200 not-found shells; auth status
was inferred from configured credentials even when every test skipped; browser
interception could race navigation; network bodies had no absolute deadline;
and the Lighthouse lane trusted CLI exit status and a mutable, symlink-following
artifact tree without proving per-route assertion coverage. OAuth checks proved
static configuration instead of exercising the UI and Better Auth catch-all;
independently named auth secrets could be mixed into a synthetic credential;
permissions and persisted checkout credentials were broader than each job
needed; and an interrupted marker upload could suppress recovery forever.

**Permanent controls.** One shared Node boundary now performs the
environment-only credential exchange, exact build verification, host-only
cookie creation, semantic surface verification, masking, deadline, and cleanup.
Deployment lookup is deadline-bounded, propagation-aware, and exact
URL/ID/full-SHA aware. Auth evidence is result-derived, exact-origin bound, and
selected from one complete credential pair. Both OAuth providers are exercised
through the real UI and catch-all only after alias ownership. Browser route
installation is ordered. Vercel CLI secrets stay out of argv. Job permissions
are explicit and minimal, and checkouts never persist credentials. Lighthouse
validation and upload are one hash-sealed isolated-copy operation whose
third-party child receives no Actions, GitHub, Vercel, token, or secret
environment state. Production markers require completed-success evidence and
have one durable, pre-mutation recovery lease.

Regression fixtures cover cross-origin SSO redirects, HTTP-200 login HTML,
preview/production confusion, hung fetches, list lag and transient deployment
states, field-by-field propagation (including READY without SHA and ID without
URL), retryable transport/API failures, malformed present identity, wrong
full-SHA READY results, duplicate-SHA pagination, canonical and
foreign `/app` redirects, pre-alias shared-staging topology, empty 204 pages,
HTTP-200 not-found profiles, route-install races, dynamic-cookie
artifacts, unsafe cookie files, protected-login SEO HTML, symlinks, FIFOs,
non-regular entries, same-UID post-validation chmod/write/restore mutation,
incomplete upload route maps, mixed credential pairs, Vercel secret-bearing
argv, over-broad workflow permissions, interrupted marker recovery, zero
assertion matches, and a valid exact authorized response.

**Re-evaluate when.** Vercel changes its deployment-protection response contract
or Lighthouse CI changes its report/assertion schema. Then update the fixtures
and this contract before accepting new production evidence.
