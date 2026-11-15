#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CANONICAL_PRO_MONTHLY_USD,
  type CanonicalArtistSiteCheckId,
  type CanonicalArtistSiteReceipt,
  evaluateCanonicalArtistSiteCertification,
} from '@/lib/acquisition/canonical-artist-site-certification';

export interface CanonicalArtistSiteCliOptions {
  readonly candidateId: string;
  readonly runId: string;
  readonly sourceRevision: string;
  readonly runUrl: string;
  readonly goldenPathStatus: string;
  readonly claimContractStatus: string;
  readonly waitlistStatus: string;
  readonly m2Status: string;
  readonly m2ReceiptPath: string;
  readonly profileStatus: string;
  readonly navigationStatus?: string;
  readonly profileResultPath: string;
  readonly outputPath: string;
  /** Newest-first SHAs from the certified revision. Empty means equality only. */
  readonly sourceHistory?: readonly string[];
  /**
   * Checkout root for the git-path lineage binding. Defaults to the repo that
   * contains the process working directory; only used when git can answer.
   */
  readonly gitRoot?: string;
  /**
   * True when `--source-history` was passed and its file parsed to zero
   * entries. The Golden Path shell pre-creates the history file and clears it
   * only when a history page failed (e.g. a GitHub installation-quota 403),
   * so empty lineage evidence is a transport failure — never proof that the
   * deployed revision is unrelated to the certified one.
   */
  readonly lineageFileEmpty?: boolean;
}

interface M2Receipt {
  readonly steps?: readonly {
    readonly name?: string;
    readonly ok?: boolean;
    readonly detail?: string;
    readonly evidence?: readonly string[];
  }[];
}

interface ProfileResult {
  readonly failed?: boolean;
  readonly reportPath?: string;
  readonly exposedDeferredSurfaces?: readonly string[];
}

interface ProfileReport {
  readonly snapshot?: { readonly releaseSha?: string | null };
  readonly linkChecks?: readonly {
    readonly url?: string;
    readonly status?: number | null;
    readonly finalStatus?: number | null;
    readonly canonicalArtistReturn?: boolean;
  }[];
}

const REFERENCE_RELEASE_URL = 'https://jov.ie/tim/never-say-a-word';
const COMMIT_SHA = /^[a-f0-9]{40}$/;

export type DeployedRevisionBinding =
  | 'same'
  | 'ancestor'
  | 'unrelated'
  | 'unknown';

/** One non-empty line per commit, newest first, as the commits API returns. */
export function parseSourceHistory(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase())
    .filter(line => line.length > 0);
}

/**
 * A live release is bound when it is the certified SHA, or an ancestor of it.
 * Ancestry counts only when history starts with the certified SHA and later
 * lists the live SHA. Empty, swapped, or non-SHA history stays unbound.
 */
export function classifyDeployedRevision(
  sourceRevision: string,
  deployedRevision: string | null | undefined,
  history: readonly string[]
): DeployedRevisionBinding {
  const source = sourceRevision.trim().toLowerCase();
  const deployed = deployedRevision?.trim().toLowerCase() ?? '';
  if (!COMMIT_SHA.test(source) || !COMMIT_SHA.test(deployed)) return 'unknown';
  if (source === deployed) return 'same';
  const lineage = history.map(entry => entry.trim().toLowerCase());
  if (lineage[0] === source && lineage.includes(deployed)) return 'ancestor';
  return 'unrelated';
}

export type GitRun = (
  file: string,
  args: readonly string[],
  cwd: string
) => { readonly status: number; readonly stdout: string };

/** Non-throwing git invocation: exit status plus captured stdout. */
export const runGit: GitRun = (file, args, cwd) => {
  try {
    return {
      status: 0,
      stdout: execFileSync(file, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString(),
    };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: Buffer };
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? err.stdout.toString() : '',
    };
  }
};

/** True when the checkout holds the commit object (local read, no network). */
export function gitRevisionExists(
  repoRoot: string,
  revision: string,
  run: GitRun = runGit
): boolean {
  if (!COMMIT_SHA.test(revision.trim().toLowerCase())) return false;
  return (
    run(
      'git',
      ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`],
      repoRoot
    ).status === 0
  );
}

/** The checkout root containing the working directory, when it is a repo. */
export function resolveGitRoot(
  startDirectory: string,
  run: GitRun = runGit
): string | null {
  const result = run('git', ['rev-parse', '--show-toplevel'], startDirectory);
  const root = result.stdout.trim();
  return result.status === 0 && root.length > 0 ? root : null;
}

/**
 * Bind the deployed revision to the certified source from the local checkout,
 * so certification does not depend on the commits REST API (whose
 * installation quota produced the empty lineage reads behind JOV-12646).
 * `git merge-base --is-ancestor` is only trusted when the checkout can see
 * the connecting history: a shallow checkout is unshallowed first
 * (blob-filtered, so it is commits and trees only), and the deployed commit
 * is fetched by SHA when it is missing locally. `unanswered` means git could
 * not answer and the commits-API lineage file decides instead; a genuinely
 * unrelated pair of present commits is real drift, never `unanswered`.
 */
export function classifyDeployedRevisionFromGit(
  repoRoot: string,
  sourceRevision: string,
  deployedRevision: string | null | undefined,
  run: GitRun = runGit
): DeployedRevisionBinding | 'unanswered' {
  const source = sourceRevision.trim().toLowerCase();
  const deployed = deployedRevision?.trim().toLowerCase() ?? '';
  if (!COMMIT_SHA.test(source) || !COMMIT_SHA.test(deployed))
    return 'unanswered';
  // The certified source is this checkout's own revision; when it is not
  // present locally there is no binding to do from git at all.
  if (!gitRevisionExists(repoRoot, source, run)) return 'unanswered';
  if (source === deployed) return 'same';
  if (!gitRevisionExists(repoRoot, deployed, run)) {
    // Materialize the deployed commit: unshallow a shallow checkout, or fetch
    // the exact commit by SHA (blob-filtered; ancestry needs only commits and
    // trees). A failed fetch is unanswered, not unrelated.
    const shallow = run(
      'git',
      ['rev-parse', '--is-shallow-repository'],
      repoRoot
    );
    if (shallow.stdout.trim() === 'true') {
      run(
        'git',
        ['fetch', '--no-tags', '--filter=blob:none', '--unshallow', 'origin'],
        repoRoot
      );
    } else {
      run(
        'git',
        ['fetch', '--no-tags', '--filter=blob:none', 'origin', deployed],
        repoRoot
      );
    }
    if (!gitRevisionExists(repoRoot, deployed, run)) return 'unanswered';
  }
  const ancestor = run(
    'git',
    ['merge-base', '--is-ancestor', deployed, source],
    repoRoot
  );
  if (ancestor.status === 0) return 'ancestor';
  if (ancestor.status === 1) return 'unrelated';
  return 'unanswered';
}

function required(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

function optional(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function loadSourceHistory(path: string | undefined): {
  entries: readonly string[];
  fileWritten: boolean;
} {
  if (!path) return { entries: [], fileWritten: false };
  try {
    const entries = parseSourceHistory(readFileSync(resolve(path), 'utf8'));
    return { entries, fileWritten: true };
  } catch {
    return { entries: [], fileWritten: false };
  }
}

/**
 * A lineage read that promised evidence and delivered none (the flag was
 * passed but the file is missing or empty) is a transport failure, not
 * drift. The Golden Path shell always creates the file, so empty content
 * means every history page failed.
 */
export const LINEAGE_DEFERRAL_DETAIL =
  'github-quota-deferred: canonical artist-site certification could not bind the deployed revision to the certified source: the commits history read came back empty and git could not answer (GitHub installation quota or transport failure). No certificate was issued; this is not a pass and not a product verdict. Re-run after the quota resets.';

export class LineageEvidenceUnavailableError extends Error {
  readonly deployedRevision: string | null;
  constructor(deployedRevision: string | null) {
    super(LINEAGE_DEFERRAL_DETAIL);
    this.name = 'LineageEvidenceUnavailableError';
    this.deployedRevision = deployedRevision;
  }
}

function parseOptions(argv: readonly string[]): CanonicalArtistSiteCliOptions {
  const historyFlag = optional(argv, '--source-history');
  const history = loadSourceHistory(historyFlag);
  return {
    candidateId: required(argv, '--candidate-id'),
    runId: required(argv, '--run-id'),
    sourceRevision: required(argv, '--source-revision'),
    runUrl: required(argv, '--run-url'),
    goldenPathStatus: required(argv, '--golden-path-status'),
    claimContractStatus: required(argv, '--claim-contract-status'),
    waitlistStatus: required(argv, '--waitlist-status'),
    m2Status: required(argv, '--m2-status'),
    m2ReceiptPath: required(argv, '--m2-receipt'),
    profileStatus: required(argv, '--profile-status'),
    navigationStatus: required(argv, '--navigation-status'),
    profileResultPath: required(argv, '--profile-result'),
    outputPath: required(argv, '--output'),
    sourceHistory: history.entries,
    lineageFileEmpty: historyFlag !== undefined && history.entries.length === 0,
    gitRoot: optional(argv, '--git-root'),
  };
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
  } catch {
    return null;
  }
}

function stepPassed(receipt: M2Receipt | null, name: string): boolean {
  return receipt?.steps?.some(step => step.name === name && step.ok) ?? false;
}

export function certifyCanonicalArtistSite(
  options: CanonicalArtistSiteCliOptions
) {
  const observedAt = new Date().toISOString();
  const m2 = readJson<M2Receipt>(options.m2ReceiptPath);
  const profile = readJson<ProfileResult>(options.profileResultPath);
  const profileReport = profile?.reportPath
    ? readJson<ProfileReport>(profile.reportPath)
    : null;

  const goldenPassed = options.goldenPathStatus === 'success';
  const claimContractPassed = options.claimContractStatus === 'success';
  const deployedRevision = profileReport?.snapshot?.releaseSha ?? null;
  const profileHealthy =
    options.profileStatus === 'success' && profile?.failed === false;
  // Bind from the local checkout first (JOV-12646: the commits-API lineage
  // read loses whole pushes to GitHub installation-quota deferrals). Git is
  // only skipped when it cannot answer; the lineage file then decides as
  // before. A git `unrelated` verdict is real evidence — both revisions are
  // present locally — and must stay RED even when the lineage file is empty.
  const gitRoot = options.gitRoot ?? resolveGitRoot(process.cwd());
  const gitLineage = gitRoot
    ? classifyDeployedRevisionFromGit(
        gitRoot,
        options.sourceRevision,
        deployedRevision
      )
    : 'unanswered';
  const revisionRelation =
    gitLineage === 'unanswered'
      ? classifyDeployedRevision(
          options.sourceRevision,
          deployedRevision,
          options.sourceHistory ?? []
        )
      : gitLineage;
  const revisionBound =
    revisionRelation === 'same' || revisionRelation === 'ancestor';
  // A history file the workflow pre-created but left empty means every
  // commits-history page failed (GitHub installation-quota 403 or transport)
  // and git could not answer either: the deployed revision cannot be bound,
  // which is missing evidence, not drift. Report a visible deferral instead
  // of issuing a false GREEN or turning Golden Path (manual) red (JOV-12646):
  // the certificate stays RED with the deferral detail, the CLI announces the
  // quota-deferral and exits 0, and a re-run after the quota reset re-reads
  // the lineage. Real failures keep their hard RED: an unhealthy profile or
  // genuine drift (git-answered or history-answered unrelated) never reaches
  // this branch.
  const revisionDeferral =
    options.lineageFileEmpty === true &&
    gitLineage === 'unanswered' &&
    revisionRelation === 'unrelated' &&
    profileHealthy;
  const revisionSummary = revisionDeferral
    ? new LineageEvidenceUnavailableError(deployedRevision).message
    : `Live profile revision ${deployedRevision ?? 'unknown'} is not ${options.sourceRevision}.`;
  const profilePassed = profileHealthy && revisionBound;
  const exposedDeferred = profile?.exposedDeferredSurfaces;
  const boundDefect = (passesIgnoringRevision: boolean) =>
    profileHealthy && !revisionBound && passesIgnoringRevision
      ? 'canonical-artist-site-source-revision'
      : 'JOV-7192';
  const referenceRelease = profileReport?.linkChecks?.find(
    check => check.url === REFERENCE_RELEASE_URL
  );
  const referenceReleaseReachable =
    (referenceRelease?.status === 200 ||
      referenceRelease?.finalStatus === 200) &&
    referenceRelease?.canonicalArtistReturn === true;
  const referenceReleasePassed = profilePassed && referenceReleaseReachable;
  const claimPassed = options.m2Status === 'success' && stepPassed(m2, 'claim');
  const proPassed = claimPassed && stepPassed(m2, 'pro_checkout_199');
  const activationPassed =
    options.m2Status === 'success' && stepPassed(m2, 'activation');

  const goldenEvidence = [`${options.runUrl}#golden-path`];
  const profileEvidence = [
    `${options.runUrl}#canonical-profile`,
    `https://jov.ie/tim@${deployedRevision ?? 'unknown-release'}`,
    REFERENCE_RELEASE_URL,
  ];
  const claimEvidence = [`${options.runUrl}#premade-claim-contract`];
  const m2Evidence = [`${options.runUrl}#m2-revenue-path`];
  const journeyDetail = goldenPassed
    ? 'Production build passed the prebuilt claim, real-auth golden path, start-entry continuity, and Stripe journey.'
    : 'Production-faithful Golden Path did not pass.';
  const revisionDetail = revisionSummary;
  const profileDetail = profilePassed
    ? revisionRelation === 'ancestor'
      ? `Live Tim White profile passed. Deployed revision ${deployedRevision ?? 'unknown'} is an ancestor of source revision ${options.sourceRevision}.`
      : 'Live Tim White profile passed and is bound to this source revision.'
    : profileHealthy && !revisionBound
      ? revisionDetail
      : `Live Tim White profile failed or deployed ${deployedRevision ?? 'an unknown revision'} instead of ${options.sourceRevision}.`;
  let deferredPassed = false;
  let deferredHidden = false;
  let deferredDefect = 'JOV-7192';
  let deferredDetail =
    'Deferred surfaces were not observed on the bound live profile.';
  if (Array.isArray(exposedDeferred) && exposedDeferred.length > 0) {
    deferredDetail = `Live reference journey exposes deferred surfaces: ${exposedDeferred.join(', ')}.`;
    deferredDefect = 'canonical-artist-site-deferred-surfaces';
  } else if (
    profilePassed &&
    Array.isArray(exposedDeferred) &&
    exposedDeferred.length === 0
  ) {
    deferredPassed = true;
    deferredHidden = true;
    deferredDetail =
      'Scanned markers were absent: pay-trigger, profile-mode-drawer-pay, profile-pay-recipient, tip-button, tip-drawer, ask-jovie launcher, operator-banner, and operator-lists-nav. Deep audience intelligence has no public marker.';
  } else if (profileHealthy && !revisionBound) {
    deferredDetail = revisionDetail;
    deferredDefect = 'canonical-artist-site-source-revision';
  }
  const claimDetail = claimContractPassed
    ? 'Premade claim authorization, collision, idempotency, and ownership contracts passed.'
    : 'Premade claim authorization or ownership contracts did not pass.';

  const common = {
    candidateId: options.candidateId,
    runId: options.runId,
    sourceRevision: options.sourceRevision,
    observedAt,
  };
  const row = (
    checkId: CanonicalArtistSiteCheckId,
    passed: boolean,
    detail: string,
    evidence: readonly string[],
    defectRef = 'JOV-7192',
    hidden = false
  ): CanonicalArtistSiteReceipt => ({
    ...common,
    checkId,
    status: passed ? (hidden ? 'hidden' : 'passed') : 'failed',
    detail,
    evidence,
    ...(!passed && defectRef ? { defectRef } : {}),
  });
  const claimOk = goldenPassed && claimContractPassed;
  const claimText = claimOk ? claimDetail : `${journeyDetail} ${claimDetail}`;
  const claimAndJourney = [...goldenEvidence, ...claimEvidence];
  const waitlistPassed = options.waitlistStatus === 'success';
  const waitlistDetail = waitlistPassed
    ? 'Only explicitly admitted artists crossed the waitlist gate.'
    : 'Waitlist admission did not pass. Unadmitted artists must stay outside the app shell.';
  const waitlistEvidence = [`${options.runUrl}#waitlist-admission`];
  const profileAndJourney = [...profileEvidence, ...goldenEvidence];
  const navigationPassed = options.navigationStatus === 'success';
  const navigationOk = navigationPassed && profilePassed;
  const navigationEvidence = [
    ...profileEvidence,
    `${options.runUrl}#canonical-navigation`,
  ];
  const navigationDetail = navigationOk
    ? 'Live mobile and desktop Events → Home → 15-second wait → reload and Back/Forward passed on the observed profile revision.'
    : 'Live mobile/desktop profile navigation failed, was skipped, or lacks bound profile evidence.';
  const identityOk = profilePassed && claimOk;
  const hierarchyOk = profilePassed && goldenPassed;
  const releaseOk = referenceReleasePassed && goldenPassed;
  const receipts: CanonicalArtistSiteReceipt[] = [
    row(
      'identity_catalog',
      identityOk,
      identityOk
        ? profileDetail
        : `${profileDetail} ${journeyDetail} ${claimDetail}`,
      [...profileEvidence, ...claimAndJourney],
      boundDefect(profileHealthy && claimOk)
    ),
    row(
      'profile_hierarchy',
      hierarchyOk,
      hierarchyOk ? profileDetail : `${profileDetail} ${journeyDetail}`,
      profileAndJourney,
      boundDefect(profileHealthy && goldenPassed)
    ),
    row(
      'profile_modes',
      navigationOk,
      navigationDetail,
      navigationEvidence,
      'canonical-artist-site-refresh-back-retry'
    ),
    row(
      'release_smart_link',
      releaseOk,
      releaseOk
        ? 'The live Never Say a Word release and artist loop are reachable.'
        : profileHealthy && !revisionBound && referenceReleaseReachable
          ? revisionDetail
          : 'The live Never Say a Word reference release loop did not pass.',
      profileAndJourney,
      boundDefect(referenceReleaseReachable && goldenPassed)
    ),
    row(
      'deferred_surfaces',
      deferredPassed,
      deferredDetail,
      profileEvidence,
      deferredDefect,
      deferredHidden
    ),
    row(
      'waitlist_admission',
      waitlistPassed,
      waitlistDetail,
      waitlistEvidence,
      'canonical-artist-site-waitlist-admission'
    ),
    ...(['claim_auth_intent', 'ownership_existing_profile'] as const).map(
      checkId => row(checkId, claimOk, claimText, claimAndJourney)
    ),
    row(
      'refresh_back_retry',
      claimOk && navigationOk,
      `${claimText} ${navigationDetail}`,
      [...claimAndJourney, ...navigationEvidence],
      'canonical-artist-site-refresh-back-retry'
    ),
    ...(['free_state_value', 'payment_entitlement'] as const).map(checkId =>
      row(checkId, goldenPassed, journeyDetail, goldenEvidence)
    ),
    row(
      'pro_handoff_199',
      proPassed,
      proPassed
        ? `Live claim-first pricing exposed the truthful $${CANONICAL_PRO_MONTHLY_USD} monthly Pro handoff.`
        : `Live claim-first pricing or the $${CANONICAL_PRO_MONTHLY_USD} monthly Pro handoff failed.`,
      m2Evidence,
      'JOV-6439'
    ),
    row(
      'immediate_value',
      goldenPassed && activationPassed,
      goldenPassed && activationPassed
        ? 'Claim first value and the live post-checkout activation state passed.'
        : 'Claim first value or the live post-checkout activation state failed.',
      [...goldenEvidence, ...m2Evidence],
      goldenPassed ? 'JOV-6439' : 'JOV-7192'
    ),
  ];

  const certificate = evaluateCanonicalArtistSiteCertification({
    candidateId: options.candidateId,
    runId: options.runId,
    sourceRevision: options.sourceRevision,
    evaluatedAt: observedAt,
    checkoutApplicable: true,
    receipts,
  });
  mkdirSync(dirname(resolve(options.outputPath)), { recursive: true });
  writeFileSync(
    resolve(options.outputPath),
    `${JSON.stringify(certificate, null, 2)}\n`
  );
  return certificate;
}

if (process.argv[1]?.endsWith('certify-canonical-artist-site.ts')) {
  try {
    const certificate = certifyCanonicalArtistSite(
      parseOptions(process.argv.slice(2))
    );
    console.log(certificate.statusLine);
    for (const failure of certificate.failingChecks) {
      console.error(`${failure.id}: ${failure.detail}`);
    }
    for (const failure of certificate.evidenceIntegrityFailures) {
      console.error(`evidence: ${failure}`);
    }
    const deferred = certificate.receipts.some(receipt =>
      receipt.detail.startsWith('github-quota-deferred:')
    );
    if (deferred) {
      // The repository's quota-deferral convention (runWithGitHubRetry): a
      // transport state, never a verdict on the change (JOV-12646). The
      // written certificate stays RED — nothing certifies on an unbound
      // revision — but the deferral must be visible without turning Golden
      // Path (manual) red. Re-running after the quota reset re-reads lineage.
      console.error(
        `::warning title=github-quota-deferred::${LINEAGE_DEFERRAL_DETAIL}`
      );
      process.exitCode = 0;
    } else if (!certificate.safeToSend) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
