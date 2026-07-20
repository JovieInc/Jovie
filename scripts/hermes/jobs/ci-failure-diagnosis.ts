export type CiFailureClass =
  | 'agent_gate_evidence_missing_without_producer'
  | 'staged_production_deployment_failed'
  | 'production_alias_not_updated'
  | 'production_promotion_state_blocked'
  | 'gate_dependency_cache_timeout'
  | 'required_smoke_suppressed_by_dependency_skip'
  | 'storybook_browser_iframe_transport'
  | 'lighthouse_protocol_timeout'
  | 'lighthouse_loopback_origin_drift'
  | 'lighthouse_deterministic_assertion'
  | 'bounded_source_scan_timeout'
  | 'visual_qa_prune_timestamp_race'
  | 'golden_path_signup_hydration_reset'
  | 'golden_path_competing_start_navigation'
  | 'golden_path_waitlist_gate_before_claim'
  | 'golden_path_auth_provider_bypassed'
  | 'golden_path_app_user_provisioning_gap'
  | 'golden_path_smoke_auth_contract'
  | 'golden_path_stale_runtime_marker'
  | 'golden_path_stale_onboarding_surface'
  | 'profile_release_card_content_box_mismatch'
  | 'profile_mobile_legacy_notifications_route'
  | 'vercel_build_exceeded_maximum_time'
  | 'vercel_concurrent_build_queue'
  | 'layout_guard_contract_missing'
  | 'standalone_runtime_launcher_mismatch'
  | 'vercel_prebuilt_function_closure_missing'
  | 'chat_composer_unsettled_entry_animation'
  | 'neon_endpoint_capacity_admission'
  | 'neon_probe_workspace_dependency_resolution'
  | 'neon_shared_artifact_credential_mismatch'
  | 'neon_concurrency_key_collision'
  | 'broken_profiler_fixture'
  | 'inconclusive_performance_timeout'
  | 'suite_wide_performance_regression'
  | 'broad_test_performance_regression'
  | 'isolated_stuck_test_regression'
  | 'test_fixture_import_timeout'
  | 'mobile_overflow_navigation_race'
  | 'runner_slice_task_saturation'
  | 'runner_process_exhaustion'
  | 'runner_io_pressure_admission'
  | 'runner_io_pressure_post_admission_herd'
  | 'runner_host_pressure'
  | 'shared_neon_endpoint_reaped_while_active'
  | 'runner_image_proof_disk_exhaustion'
  | 'gbrain_ownership_preflight_latency_or_slug_drift'
  | 'unknown';

export interface CiFailureDiagnosis {
  readonly failureClass: CiFailureClass;
  readonly rootCause: string;
  readonly remediation: string;
}

const DIAGNOSES: ReadonlyArray<{
  readonly failureClass: Exclude<CiFailureClass, 'unknown'>;
  readonly matches: (log: string) => boolean;
  readonly rootCause: string;
  readonly remediation: string;
}> = [
  {
    failureClass: 'agent_gate_evidence_missing_without_producer',
    matches: log =>
      /(?:Verify Draft Agent PR|Require GStack gate evidence)/i.test(log) &&
      /Missing recorded gate evidence for:\s*gstack\.qa\.exhaustive,\s*gstack\.review,\s*gstack\.ship/i.test(
        log
      ),
    rootCause:
      'The draft-promotion workflow required exact-head GStack receipts, but no trusted producer recorded them before the deterministic evidence check ran.',
    remediation:
      'Do not blindly rerun the unchanged check or fabricate an artifact. Normally produce trusted exact-head QA, review, and ship evidence. Under explicit time-bounded CI-recovery authorization only, mark the reviewed PR ready before its next substantive push so this draft-only workflow safely skips while required CI remains authoritative.',
  },
  {
    failureClass: 'gate_dependency_cache_timeout',
    matches: log =>
      /complete job name:\s*CI Risk Classifier/i.test(log) &&
      /cache size:[^\n]*\bMB\b/i.test(log) &&
      /tar -xf[^\n]*cache\.tzst/i.test(log) &&
      /\bunzstd\b|use-compress-program/i.test(log) &&
      /(?:the operation was canceled|operation cancelled|job.+(?:3 minutes|timeout))/is.test(
        log
      ),
    rootCause:
      'The dependency-free CI Risk Classifier exhausted its three-minute job budget restoring and extracting the full pnpm dependency cache before classification started.',
    remediation:
      'Remove dependency restore, pnpm fetch, and pnpm install from dependency-free gates; run the native Node classifier directly instead of blindly rerunning the same cache extraction.',
  },
  {
    failureClass: 'vercel_prebuilt_function_closure_missing',
    matches: log =>
      /\/var\/task\/apps\/web\/\.next\/server/i.test(log) &&
      (/(?:Cannot find module|Failed to load external module) ['"]?(?:require|import)-in-the-middle-[a-z0-9]+['"]?/i.test(
        log
      ) ||
        /Cannot find package ['"]@opentelemetry\/sdk-node['"]/i.test(log)),
    rootCause:
      'The prebuilt Vercel function was deployed without repo-relative files referenced by its Build Output filePathMap. Transferring only .vercel/output between jobs can omit those traced runtime sources, so middleware fails before the health handler boots.',
    remediation:
      'Do not rerun or promote the unchanged prebuilt. Build and deploy in the same job and workspace so every filePathMap source remains available; never restore .vercel/output alone. Require the exact deployment to pass /api/health before promotion.',
  },
  {
    failureClass: 'staged_production_deployment_failed',
    matches: log =>
      /failure_subtype=(?:production_artifact_failed|staged_production_not_ready|staged_production_canary_failed)/i.test(
        log
      ),
    rootCause:
      'The exact Production-target prebuilt artifact failed to build, become READY, or pass its direct build-info, health, and homepage canary before promotion.',
    remediation:
      'Inspect the Production env pull, prebuilt deploy JSON, exact deployment state, and direct canary. Never substitute or promote the Preview deployment.',
  },
  {
    failureClass: 'production_alias_not_updated',
    matches: log => /failure_subtype=production_alias_not_updated/i.test(log),
    rootCause:
      'Vercel accepted the staged Production deployment, but canonical jov.ie did not converge to its deployment ID and exact runtime SHA across plain, stable, and canary routes.',
    remediation:
      'Inspect `vercel inspect jov.ie`, rolling-release state, and cache-busted unauthenticated build-info responses. Do not accept direct deployment or Preview evidence as production proof.',
  },
  {
    failureClass: 'production_promotion_state_blocked',
    matches: log =>
      /failure_subtype=production_promotion_(?:foreign_rollout|state_invalid|state_blocked|failed|rollback_failed)/i.test(
        log
      ),
    rootCause:
      'Vercel promotion state was foreign, malformed, failed, or could not be safely returned to a verified terminal state inside the bounded controller window.',
    remediation:
      'Inspect the exact active rolling-release target and `vercel inspect jov.ie`. Never resubmit promotion or mutate a rollout unless its deployment ID proves this run owns it.',
  },
  {
    failureClass: 'required_smoke_suppressed_by_dependency_skip',
    matches: log =>
      /E2E Smoke \(PR Fast Feedback\) was required for this PR, but result was skipped/i.test(
        log
      ) &&
      /ci-build-public:\s*success\s*\(has_artifact=true\)/i.test(log) &&
      /neon-db:\s*skipped/i.test(log),
    rootCause:
      'The required smoke job was selected by risk policy with its shared build artifact present, but GitHub suppressed it after the path-gated Neon prerequisite skipped, so the job-level condition never materialized the intended evidence.',
    remediation:
      'Do not rerun the unchanged workflow. Ensure the smoke job condition begins with always(), preserves explicit accepted prerequisite results, and lets its fallback fixture path run before retrying.',
  },
  {
    failureClass: 'storybook_browser_iframe_transport',
    matches: log => {
      const normalizedLog = log.replace(/(?:\u001b\[|\^\[\[)[0-9;]*m/g, '');
      return (
        /(?:Complete job name:\s*Storybook A11y|storybook \(chromium\))/i.test(
          normalizedLog
        ) &&
        /Failed to import test file [^\n]*\.storybook\/vitest\.setup\.ts/i.test(
          normalizedLog
        ) &&
        /Failed to fetch dynamically imported module:\s*http:\/\/localhost:\d+\/[^\n]*\.storybook\/vitest\.setup\.ts/i.test(
          normalizedLog
        ) &&
        /Cannot connect to the iframe/i.test(normalizedLog) &&
        /Received URL:\s*unknown due to CORS/i.test(normalizedLog) &&
        /Test Files[\s\S]{0,300}\b37 passed\b/i.test(normalizedLog) &&
        /Tests[\s\S]{0,200}\b289 passed\b/i.test(normalizedLog)
      );
    },
    rootCause:
      'The Storybook browser runner completed the substantive suite, then lost its localhost Vitest iframe transport while dynamically importing the shared setup module; the paired unknown-CORS iframe error is runner/browser transport drift, not a story assertion.',
    remediation:
      'After an exact-head local Storybook proof, allow one targeted Storybook A11y rerun. If the paired signature repeats, stop and collect browser process, iframe URL, open-file, memory, and runner-pressure diagnostics; do not change stories, dependencies, or retry the full CI run.',
  },
  {
    failureClass: 'lighthouse_loopback_origin_drift',
    matches: log =>
      /LIGHTHOUSE_FAILURE_CLASS=deterministic_assertion\b/i.test(log) &&
      /BASE_URL:\s*http:\/\/127\.0\.0\.1:3000/i.test(log) &&
      /Network:\s*http:\/\/0\.0\.0\.0:3000/i.test(log) &&
      /result\(s\) for http:\/\/127\.0\.0\.1:3000\/testartist\?mode=subscribe/i.test(
        log
      ) &&
      /categories\.best-practices failure for minScore assertion[\s\S]{0,300}?found:\s*0\.78/i.test(
        log
      ) &&
      /errors-in-console warning for minScore assertion/i.test(log),
    rootCause:
      'The public Lighthouse lane requested the seeded profile on 127.0.0.1 while the standalone runtime advertised 0.0.0.0, allowing a host-derived redirect to cross loopback origins and produce deterministic HTTPS/CORS best-practices evidence.',
    remediation:
      'Do not retry. Pin HOSTNAME and every canonical app/auth base URL to the same 127.0.0.1 origin before launching the standalone server, then rerun the affected shard and verify the seeded profile never redirects to 0.0.0.0.',
  },
  {
    failureClass: 'lighthouse_deterministic_assertion',
    matches: log =>
      /LIGHTHOUSE_FAILURE_CLASS=deterministic_assertion\b/i.test(log) &&
      /(?:assertion failure for|assertion failed|expected[^\n]*(?:but got|found|received|actual))/i.test(
        log
      ),
    rootCause:
      'Lighthouse completed collection and reported a deterministic audit or threshold assertion failure; runner or Chrome transport recovery cannot change that product evidence.',
    remediation:
      'Do not retry. Fix the named audit, fixture, or threshold regression and rerun the affected Lighthouse route once the exact assertion is addressed.',
  },
  {
    failureClass: 'lighthouse_protocol_timeout',
    matches: log =>
      /LIGHTHOUSE_FAILURE_CLASS=transient_protocol\b/i.test(log) &&
      /(?:\bPROTOCOL_TIMEOUT\b|Waiting for DevTools protocol response has exceeded the allotted time)/i.test(
        log
      ),
    rootCause:
      'Lighthouse lost the Chrome DevTools protocol transport while collecting evidence; this is a browser/tooling failure rather than a product threshold assertion.',
    remediation:
      "Use only the wrapper's bounded transient retry. If it exhausts, stop and collect the protocol method, Chrome process, memory, open-file, and runner-pressure diagnostics; do not add another workflow rerun or weaken assertions.",
  },
  {
    failureClass: 'runner_image_proof_disk_exhaustion',
    matches: log =>
      /exporting cache to client directory/i.test(log) &&
      /(?:no space left on device|ResourceExhausted)/i.test(log),
    rootCause:
      'The runner image itself built successfully, but exporting a duplicate local BuildKit cache exhausted the hosted runner disk.',
    remediation:
      'Use the GitHub Actions BuildKit cache backend for the second-build cache proof and upload only bounded text evidence instead of the build context or cache directory.',
  },
  {
    failureClass: 'gbrain_ownership_preflight_latency_or_slug_drift',
    matches: log =>
      /gbrain_ownership_preflight_latency_or_slug_drift/i.test(log),
    rootCause:
      'The ownership preflight could not resolve the canonical GBrain ledger inside its bounded deadline because the requested slug drifted, the CLI exceeded a nested or overall timeout, or the database session was unhealthy.',
    remediation:
      'Read coordination/agent-job-ledger first, preserve the 10s fail-closed ceiling, and use the receipt requested/resolved slug, engine/CLI/MCP latency, timeout tier, lookup health, and DB lock/session signals to repair the lookup path before retrying.',
  },
  {
    failureClass: 'golden_path_signup_hydration_reset',
    matches: log =>
      /Golden Path \(PR\)/i.test(log) &&
      /golden-path\.spec\.ts/i.test(log) &&
      /Continue with Email/i.test(log) &&
      /(?:toBeEnabled|element is not enabled|disabled)/i.test(log),
    rootCause:
      'React hydration reset the server-rendered controlled email value after the Golden Path filled it, so the Continue with Email button remained disabled.',
    remediation:
      'Refill the controlled email input until React retains the exact value and enables submission; keep the behavioral helper covered by a first-fill-reset regression.',
  },
  {
    failureClass: 'golden_path_competing_start_navigation',
    matches: log =>
      /(?:Golden Path \(PR\)|golden-path\.spec\.ts)/i.test(log) &&
      /page\.goto: net::ERR_ABORTED/i.test(log) &&
      /\/start/i.test(log),
    rootCause:
      'The Golden Path issued an explicit /start navigation while the OTP form was still completing its own hard navigation, so one request was deterministically aborted before the authenticated onboarding mount stabilized.',
    remediation:
      'Arm the OTP-driven /start navigation and real claim before submitting the code. If the fixture must approve the app user, withhold the sign-in response until that row is ready instead of issuing a competing goto or reload.',
  },
  {
    failureClass: 'golden_path_waitlist_gate_before_claim',
    matches: log =>
      /Golden Path: Anonymous Chat -> Signup -> Claim -> Live Profile/i.test(
        log
      ) &&
      /page\.waitForResponse: Timeout \d+ms exceeded/i.test(log) &&
      /heldClaimResponsePromise/i.test(log),
    rootCause:
      'The Golden fixture waited for the first onboarding claim before approving the freshly provisioned app user. The start-route auth gate server-redirected /start to /waitlist first, so useOnboardingClaim unmounted and the awaited request could never occur.',
    remediation:
      'Do not rerun the unchanged head. Intercept the Better Auth email-OTP sign-in response, approve the linked app user while withholding that response, then release the response so client navigation reaches the first /start mount and performs the single authoritative claim.',
  },
  {
    failureClass: 'golden_path_auth_provider_bypassed',
    matches: log =>
      /Golden Path \(PR\)/i.test(log) &&
      /export E2E_TEST_MODE=1/i.test(log) &&
      /export PUBLIC_NOAUTH_SMOKE=1/i.test(log) &&
      /page\.waitForResponse: Timeout \d+ms exceeded/i.test(log) &&
      /api\/onboarding\/claim/i.test(log),
    rootCause:
      'The loopback no-auth smoke flag forced the /start route to mount signed-out auth defaults during the real-auth Golden Path, so the cookie-backed session never reached useOnboardingClaim and no claim request was sent.',
    remediation:
      'Keep the live auth provider enabled when E2E_TEST_MODE arms the real-auth Golden Path while retaining the loopback-only Turnstile bypass; cover the combined flag state in the start-layout regression.',
  },
  {
    failureClass: 'golden_path_app_user_provisioning_gap',
    matches: log =>
      /Better Auth app-user provisioning hook did not create a linked users row/i.test(
        log
      ) ||
      (/Golden Path: Anonymous Chat -> Signup -> Claim -> Live Profile/i.test(
        log
      ) &&
        /claimResponse\.status\(\)\)\.toBe\(200\)/i.test(log) &&
        /Received:[^\n]*401/i.test(log)),
    rootCause:
      'The real-auth Golden Path created a valid Better Auth identity, but it did not resolve to a linked app users.id before the onboarding claim. A stale auth merge may have removed databaseHooks.user.create.after, or the claim route may still be reinterpreting the canonical app UUID as a legacy Clerk id.',
    remediation:
      'Do not rerun the unchanged head. Restore the idempotent provisionAppUser create hook, use getCachedAuth().userId directly as the app UUID in the claim route, and preserve both the missing-app-user 401 regression and hook-wiring test.',
  },
  {
    failureClass: 'golden_path_smoke_auth_contract',
    matches: log =>
      /E2E Smoke \(PR Fast Feedback\)/i.test(log) &&
      /export E2E_USE_TEST_AUTH_BYPASS=1/i.test(log) &&
      /golden-path\.spec\.ts/i.test(log) &&
      /(?:That code is incorrect|createFreshUserOnce|page\.waitForURL)/i.test(
        log
      ),
    rootCause:
      'The real-auth golden-path spec ran inside the bypass smoke lane, where E2E_TEST_MODE and the dedicated journey credentials are intentionally absent, so the Better Auth test code was rejected.',
    remediation:
      'Keep golden-path self-skipped whenever the smoke auth bypass is enabled and run the journey only in the dedicated Golden Path job, which supplies E2E_TEST_MODE and real-auth credentials.',
  },
  {
    failureClass: 'layout_guard_contract_missing',
    matches: log =>
      /::error::Layout Guard contract missing required spec: tests\/e2e\/[\w./-]+\.spec\.ts/i.test(
        log
      ) || /layout-overlap-guard\.spec\.ts not found [—-] skipping/i.test(log),
    rootCause:
      'The Layout Guard workflow referenced a deleted or absent Playwright contract and treated the missing test as a successful check.',
    remediation:
      'Restore the required deterministic Layout Guard manifest or update the workflow and its contract test together; never turn a missing required spec into success.',
  },
  {
    failureClass: 'standalone_runtime_launcher_mismatch',
    matches: log =>
      /"next start" does not work with "output: standalone"/i.test(log) &&
      /Failed to load external module require-in-the-middle-[a-z0-9]+/i.test(
        log
      ),
    rootCause:
      'A CI lane launched `next start` against an `output: standalone` artifact, so requests used the regular .next/server runtime instead of the traced standalone runtime and could not resolve its hash-shim packages.',
    remediation:
      'Launch .next/standalone/apps/web/server.js directly, fail closed when that entrypoint is absent or never becomes ready, and preserve the synced standalone runtime instead of reinstalling dependencies or blindly retrying.',
  },
  {
    failureClass: 'chat_composer_unsettled_entry_animation',
    matches: log => {
      const normalizedLog = log.replace(/(?:\u001b\[|\^\[\[)[0-9;]*m/g, '');
      const failureMatch = normalizedLog.match(
        /(?:^|\n)[^\n]*\d+\)\s+\[chromium\]\s+› tests\/e2e\/shell-chat-v1\.spec\.ts:\d+:\d+\s+› chat route picker opens without moving the shell or composer[\s\S]{0,4000}?Expected:\s*<=\s*1[\s\S]{0,1000}?Received:\s+([0-9]+(?:\.[0-9]+)?)/i
      );
      const receivedDelta = Number(failureMatch?.[1]);

      return (
        /E2E Smoke \(PR Fast Feedback\)/i.test(normalizedLog) &&
        Boolean(failureMatch) &&
        Number.isFinite(receivedDelta) &&
        receivedDelta > 1 &&
        receivedDelta <= 6 &&
        !/Composer shifted after entry animations settled/i.test(
          failureMatch?.[0] ?? ''
        )
      );
    },
    rootCause:
      'The Shell V1 geometry smoke captured its baseline while the 450ms chat-enter translateY(6px) entry animation was still running after its 160ms stagger delay; toBeVisible checks visibility, not animation completion.',
    remediation:
      'Wait for the centered composer getAnimations({ subtree: true }) promises to finish before the baseline boundingBox, retain the <=1px assertion, and keep the zero-width autosize measurement sentinel; do not raise the tolerance or retry.',
  },
  {
    failureClass: 'neon_endpoint_capacity_admission',
    matches: log =>
      /HTTP(?:[\s-]+status)?[\s:=-]*402\b/i.test(log) &&
      /You have exceeded the limit of concurrently active endpoints\./i.test(
        log
      ),
    rootCause:
      'The shared ephemeral Neon branch was created, but its database endpoint could not activate because the account had exhausted its concurrently active endpoint capacity.',
    remediation:
      'Preserve the same branch and connection artifact, run the proven-owner orphan reaper, and retry the SELECT 1 admission probe within a bounded budget; do not create another branch or publish an unproven connection artifact.',
  },
  {
    failureClass: 'neon_probe_workspace_dependency_resolution',
    matches: log =>
      /ERR_MODULE_NOT_FOUND/i.test(log) &&
      /Cannot find package ['"]@neondatabase\/serverless['"]/i.test(log) &&
      /scripts[\\/]ci[\\/]probe-neon-branch\.mjs/i.test(log),
    rootCause:
      'The repo-root Neon admission probe imported a dependency declared only by the apps/web workspace. Under the strict pnpm layout, Node resolved from the script directory and could not see the web workspace dependency.',
    remediation:
      'Load @neondatabase/serverless through createRequire anchored to apps/web/package.json, then run the real probe without DATABASE_URL and require it to reach its own environment validation instead of hoisting or reinstalling dependencies.',
  },
  {
    failureClass: 'neon_shared_artifact_credential_mismatch',
    matches: log => {
      const attemptBlindArtifact =
        /Download Neon DB connection artifact/i.test(log) &&
        /name:\s*neon-db-connection-\d+\b(?!-\d+)/i.test(log);
      const exhaustedConsumerMigration =
        /Run migrations \(ephemeral Neon\)/i.test(log) &&
        /Database connection attempt 11\/12 failed/i.test(log);

      return (
        (attemptBlindArtifact || exhaustedConsumerMigration) &&
        /password authentication failed for user ['"]neondb_owner['"]/i.test(
          log
        )
      );
    },
    rootCause:
      'A downstream migration exhausted its Neon connectivity retries because the shared connection artifact carried credentials that no longer authenticated; run-id-only artifact selection permits this drift on reruns.',
    remediation:
      'Bind the Neon connection artifact producer and every consumer to both github.run_id and github.run_attempt, then fail closed when the exact-attempt artifact is absent instead of retrying stale credentials.',
  },
  {
    failureClass: 'golden_path_stale_runtime_marker',
    matches: log =>
      /Golden Path \(PR\)/i.test(log) &&
      /golden-path\.spec\.ts/i.test(log) &&
      /Onboarding runtime policy did not finish initializing/i.test(log) &&
      /data-interaction-ready/i.test(log),
    rootCause:
      'The Golden Path waited for removed onboarding-chat marker attributes even though the canonical chat and composer had rendered and were ready for behavioral interaction.',
    remediation:
      'Wait for the real chat input and enabled send control after installing the document-scoped automation marker; do not couple the fixture to nonexistent component attributes.',
  },
  {
    failureClass: 'golden_path_stale_onboarding_surface',
    matches: log =>
      /Golden Path \(PR\)/i.test(log) &&
      /golden-path\.spec\.ts/i.test(log) &&
      /onboarding-form-wrapper/i.test(log) &&
      /(?:\/start\?handle|waiting for locator|toBeVisible)/i.test(log),
    rootCause:
      'The Golden Path still asserted the removed classic onboarding form after the compatibility route redirected the browser to the canonical /start chat surface.',
    remediation:
      'Drive the canonical /start anonymous chat, persist deterministic artist and handle tool calls, then verify the real signup claim response instead of retrying the removed form.',
  },
  {
    failureClass: 'profile_mobile_legacy_notifications_route',
    matches: log =>
      /profile-mobile-viewport-stability\.spec\.ts/i.test(log) &&
      /alerts walkthrough focus never shifts the shell/i.test(log) &&
      /email target should be visible/i.test(log) &&
      /\[role=["']dialog["']\]\[data-testid=["']profile-mobile-notifications-flow["']\]/i.test(
        log
      ) &&
      /element\(s\) not found/i.test(log),
    rootCause:
      'The mobile profile fixture opened the retired /testartist/notifications surface, followed its redirect to the canonical ?mode=subscribe route, then searched the inline flow through an obsolete role=dialog wrapper and silently allowed the missing notifications-page root to fall back.',
    remediation:
      'Do not rerun the unchanged head. Exercise /testartist?mode=subscribe directly, require profile-compact-surface as the layout root, and scope interactions to the visible profile-mobile-notifications-flow regardless of overlay or inline presentation. Keep the legacy redirect covered separately.',
  },
  {
    failureClass: 'profile_release_card_content_box_mismatch',
    matches: log =>
      /profile-mobile-viewport-stability\.spec\.ts/i.test(log) &&
      /bento artwork should fill the card width/i.test(log) &&
      /Expected:\s*>=\s*\d+[\s\S]*Received:\s*\d+/i.test(log),
    rootCause:
      'The mobile profile fixture compared an image inside the detailed card padding and artwork border with the outer card width, so stable padded geometry failed deterministically.',
    remediation:
      'Compare the rendered image width with its artwork parent content box within the existing two-pixel rendering tolerance; retain the separate outer-card and document-overflow assertions instead of widening the threshold or rerunning.',
  },
  {
    failureClass: 'vercel_build_exceeded_maximum_time',
    matches: log =>
      /BUILD_EXCEEDED_MAXIMUM_TIME/i.test(log) &&
      /(?:Vercel|deployment|deploy)/i.test(log),
    rootCause:
      'A Vercel source deployment occupied a concurrent-build slot until it exceeded the platform build-time ceiling, starving accepted prebuilt PR deployments behind it.',
    remediation:
      'Do not rerun queued PR previews. Inspect the slot-holding deployment, cancel it only when ownership proves it obsolete, suppress irrelevant main deploys, and restore a runtime-closed prebuilt artifact so staging does not force another source build.',
  },
  {
    failureClass: 'vercel_concurrent_build_queue',
    matches: log =>
      /(?:Current PR preview deployment state:\s*QUEUED|PR preview is QUEUED after readiness wait|isInConcurrentBuildsQueue[^\n]*(?:true|1))/i.test(
        log
      ),
    rootCause:
      'Vercel accepted the exact-head deployment, but project concurrent-build capacity was occupied and the deployment remained in the concurrent-build queue past the bounded readiness wait.',
    remediation:
      'Do not rerun the unchanged head or create a duplicate deployment. Inspect the accepted deployment and current slot holder, cancel only provably obsolete work, and retry through normal CI only after a new head or confirmed capacity recovery.',
  },
  {
    failureClass: 'neon_concurrency_key_collision',
    matches: log => /neon-endpoint-pool--[0-3]\b/i.test(log),
    rootCause:
      'A job-level Neon concurrency key used github.job before runner assignment, where that property is null, collapsing distinct jobs into one empty-prefix pool group.',
    remediation:
      'Replace github.job in job-level concurrency with a stable literal job identifier and preserve the four-slot suffix hash.',
  },
  {
    failureClass: 'inconclusive_performance_timeout',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Test suite failed:[\s\S]*signal=SIGTERM[\s\S]*(?:ETIMEDOUT|suite exceeded \d+ms)[\s\S]*classification=inconclusive-performance-timeout/i.test(
        log
      ),
    rootCause:
      'The bounded profiler timed out before producing complete Vitest evidence. The timeout alone cannot distinguish a real performance regression from runner or runtime drift, so it is not safe to retry or ignore without measurement.',
    remediation:
      'Run the exact representative suite printed after `remediation=` in the failed log. A repeatable slowdown indicates suite/test regression; a clean rerun points to runner/runtime drift. Do not change the 60s budget or retry blindly.',
  },
  {
    failureClass: 'broken_profiler_fixture',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Test suite failed:[\s\S]*signal=SIGTERM[\s\S]*suite exceeded 420000ms/i.test(
        log
      ),
    rootCause:
      'The legacy profiler re-ran the entire ~1,900-file fast suite serially behind a fixed 420s timeout. Earlier runs converted that partial timeout output into false-green baselines; fail-closed behavior exposed the broken profiler fixture.',
    remediation:
      'Run the exact representative suite emitted by the bounded profiler and restore the 60s budget without raising it or retrying blindly.',
  },
  {
    failureClass: 'suite_wide_performance_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Total test duration \([^)]*ms\) exceeds threshold \(60000ms\)|Suite "full" duration \([^)]*ms\) exceeds budget \(60000ms\)/i.test(
        log
      ),
    rootCause:
      'The bounded representative suite completed with credible evidence but exceeded its 60s total-duration budget, indicating suite-wide execution or setup drift.',
    remediation:
      'Run the exact representative suite and profiler command from the job, identify the suite-wide setup or execution increase, and restore the 60s budget without raising it.',
  },
  {
    failureClass: 'broad_test_performance_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /P95 test duration \([^)]*ms\) exceeds threshold \(200ms\)/i.test(log),
    rootCause:
      'At least five percent of the representative assertions exceeded the 200ms distribution target, so the slowdown is broad rather than an isolated scheduler outlier.',
    remediation:
      'Use the profiler slow-test report to optimize the recurring slow tail and restore p95 below 200ms; do not weaken the p95 target or treat the run as a single-test flake.',
  },
  {
    failureClass: 'isolated_stuck_test_regression',
    matches: log =>
      /Test Performance Budgets/i.test(log) &&
      /Max individual test duration \([^)]*ms\) exceeds threshold \(2000ms\):/i.test(
        log
      ),
    rootCause:
      'A named assertion exceeded the 2s absolute ceiling (10x the 200ms p95 target), which filters measured cap-10 scheduler noise while still detecting an isolated stuck test.',
    remediation:
      'Rerun and optimize the named assertion. Keep the 2s max ceiling and the 200ms p95 target unchanged; do not retry blindly or classify the isolated stall as harmless runner noise.',
  },
  {
    failureClass: 'visual_qa_prune_timestamp_race',
    matches: log =>
      /diff-artifacts\.test\.ts/i.test(log) &&
      /pruneCompletedVisualQaRuns\s*>\s*preserves candidates and stops pruning when activity, state, or current-run evidence changes/i.test(
        log
      ) &&
      /AssertionError:[\s\S]*completed-old[\s\S]*to deeply equal/i.test(log),
    rootCause:
      'Visual QA pruning revalidated only the run directory identity and newest millisecond mtime, so a late artifact created in the same timestamp tick could look unchanged and an active run could be deleted.',
    remediation:
      'Compare a sorted recursive entry fingerprint and entry count during revalidation, keep the deterministic same-mtime regression, and run the focused diff-artifacts suite; do not blindly rerun the unchanged shard.',
  },
  {
    failureClass: 'bounded_source_scan_timeout',
    matches: log =>
      /(?:analytics-metrics-layer-guard|touch-target-ratchet|destructive-confirm-dialog-audit|feature-flags-registry|arbitrary-values-ratchet|exp-import-boundary|exp-drift-lint-guard)\.test\.ts/i.test(
        log
      ) &&
      /(?:test timed out|timeout).*?\b\d+\s*ms|spawnSync\s+\S+\s+ETIMEDOUT/is.test(
        log
      ),
    rootCause:
      'A source ratchet or nested lint scanner exceeded its bounded test timeout while traversing or analyzing the source tree. The timeout log alone cannot distinguish a scanner regression from shared-host I/O saturation.',
    remediation:
      'Compare the scanner blob with its base and run the exact focused test first. An unchanged blob plus a focused pass identifies shared-host I/O saturation; otherwise inspect and optimize the scanner. Intersect native candidate-token and semantic file sets before JavaScript source reads, preserve a complete fail-closed fallback, match Vitest workers to the runner CPU quota, and keep full-tree scanners within an explicit 30-second ceiling; do not skip the check, add runner fanout, or try to fix the failure by blindly rerunning.',
  },
  {
    failureClass: 'test_fixture_import_timeout',
    matches: log =>
      /FAIL\s+tests\/unit\/app\/hud-page\.test\.ts/i.test(log) &&
      /Error:\s*Test timed out in 5000ms/i.test(log),
    rootCause:
      'The HUD page test counted its cold dynamic module transform and import against the per-test timeout after resetting the module graph.',
    remediation:
      'Hoist the mocked HUD page import outside the timed test bodies and avoid resetting modules when the assertions do not require a fresh module graph.',
  },
  {
    failureClass: 'mobile_overflow_navigation_race',
    matches: log =>
      /Mobile Overflow/i.test(log) &&
      /auth-signin/i.test(log) &&
      /page\.evaluate: Execution context was destroyed, most likely because of a navigation/i.test(
        log
      ) &&
      /utils\/mobile-overflow\.ts/i.test(log),
    rootCause:
      'The no-auth mobile overflow lane only recognized a DOM data-dgst redirect marker, but the raw Next.js response carries the digest in its streamed Flight script, so DOM measurement began before navigation completed and invalidated the evaluation context.',
    remediation:
      'Parse the NEXT_REDIRECT digest from the raw response and wait for its exact target to finish loading before hydration and overflow measurement; do not retry page.evaluate.',
  },
  {
    failureClass: 'runner_slice_task_saturation',
    matches: log =>
      /runner_tasks_status=(?:warning|critical)/i.test(log) &&
      /runner_tasks_(?:current|max|ratio_pct)=/i.test(log),
    rootCause:
      'The self-hosted runner pool is approaching or has reached the systemd ci-runners.slice task ceiling.',
    remediation:
      'Run .github/runner-host/diagnose-capacity.sh and restore the versioned ci-runners.slice TasksMax contract before retrying CI.',
  },
  {
    failureClass: 'shared_neon_endpoint_reaped_while_active',
    matches: log =>
      /The requested endpoint could not be found/i.test(log) &&
      /(?:neon-db-connection|shared Neon (?:branch|artifact)|Download Neon DB connection artifact)/i.test(
        log
      ),
    rootCause:
      'A consumer downloaded the shared Neon connection artifact, but a concurrent legacy cleanup deleted that branch without proving its owning workflow had completed.',
    remediation:
      'Require completed workflow-run ownership proof immediately before every cleanup delete, fail closed for queued, active, or unavailable proof, then rerun the consumer against a newly admitted shared branch.',
  },
  {
    failureClass: 'runner_io_pressure_post_admission_herd',
    matches: log =>
      /runner_failure_class=runner-io-pressure-post-admission\b/i.test(log),
    rootCause:
      'Gem admitted runner work before restore I/O became visible, then a later admission sample detected full-pressure saturation and stopped the remaining cohort.',
    remediation:
      'Do not retry or add runners. Let admitted restores drain; the one-runner-per-tick budget and I/O hysteresis will resume scale-up only after pressure recovers.',
  },
  {
    failureClass: 'runner_io_pressure_admission',
    matches: log =>
      /runner_failure_class=runner-io-pressure(?:-unavailable)?\b/i.test(log) ||
      /runner_spawn_admission=blocked[^\n]*\bio_full_avg10_pct=/i.test(log),
    rootCause:
      'Gem runner scale-up was admission-blocked because Linux I/O full pressure reached the reviewed saturation threshold or PSI telemetry was unavailable.',
    remediation:
      'Do not retry or add runners. Let existing jobs drain, then verify /proc/pressure/io full avg10 stays below the recovery threshold before admission resumes.',
  },
  {
    failureClass: 'runner_process_exhaustion',
    matches: log =>
      /\bEAGAIN\b|ERR_WORKER_INIT_FAILED|resource temporarily unavailable/i.test(
        log
      ),
    rootCause:
      'The runner could not create a process or worker because process resources were exhausted.',
    remediation:
      'Run .github/runner-host/diagnose-capacity.sh to distinguish slice saturation from other host pressure; do not modify the failing test based on this signature alone.',
  },
  {
    failureClass: 'runner_host_pressure',
    matches: log =>
      /pressure stall information|\bPSI\b|sustained (?:cpu|memory|i\/o) pressure/i.test(
        log
      ),
    rootCause:
      'Runner pressure telemetry shows sustained host-level resource contention.',
    remediation:
      'Inspect runner capacity and workload concurrency before changing application or test code.',
  },
];

export function diagnoseCiFailure(log: string): CiFailureDiagnosis {
  const diagnosis = DIAGNOSES.find(candidate => candidate.matches(log));
  if (diagnosis) return diagnosis;

  return {
    failureClass: 'unknown',
    rootCause: 'No deterministic CI failure signature matched the failed log.',
    remediation:
      'Inspect the failed check and add a narrow diagnosis if it recurs.',
  };
}
