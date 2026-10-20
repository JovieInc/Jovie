#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
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

function loadSourceHistory(path: string | undefined): readonly string[] {
  if (!path) return [];
  try {
    return parseSourceHistory(readFileSync(resolve(path), 'utf8'));
  } catch {
    return [];
  }
}

function parseOptions(argv: readonly string[]): CanonicalArtistSiteCliOptions {
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
    sourceHistory: loadSourceHistory(optional(argv, '--source-history')),
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
  const revisionRelation = classifyDeployedRevision(
    options.sourceRevision,
    deployedRevision,
    options.sourceHistory ?? []
  );
  const revisionBound =
    revisionRelation === 'same' || revisionRelation === 'ancestor';
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
  const revisionDetail = `Live profile revision ${deployedRevision ?? 'unknown'} is not ${options.sourceRevision}.`;
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
        ? 'Live claim-first pricing exposed the truthful $199 monthly Pro handoff.'
        : 'Live claim-first pricing or the $199 monthly Pro handoff failed.',
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
    if (!certificate.safeToSend) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
