#!/usr/bin/env node
// JOV-6572: file one deduped product defect per canonical artist-site failure.
// A missing certificate is itself a defect. GREEN closes the known keys.

import { readFileSync } from 'node:fs';
import {
  closeLinearIssueByFingerprint,
  isValidRemediationKey,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const CANONICAL_ARTIST_SITE_CONTRACT =
  'jovie.canonical-artist-site-certification/v1';
export const CANONICAL_ARTIST_SITE_CHECK_IDS =
  'identity_catalog profile_hierarchy profile_modes release_smart_link deferred_surfaces waitlist_admission claim_auth_intent ownership_existing_profile refresh_back_retry free_state_value pro_handoff_199 payment_entitlement immediate_value'.split(
    ' '
  );
export const MISSING_CERTIFICATE_KEY =
  'canonical-artist-site-missing-certificate';
export const EVIDENCE_INTEGRITY_KEY =
  'canonical-artist-site-evidence-integrity';

export function checkKey(checkId) {
  return `canonical-artist-site-${String(checkId).replaceAll('_', '-')}`;
}

export function intakeKeys() {
  const keys = [
    MISSING_CERTIFICATE_KEY,
    EVIDENCE_INTEGRITY_KEY,
    'canonical-artist-site-source-revision',
    ...CANONICAL_ARTIST_SITE_CHECK_IDS.map(checkKey),
  ];
  return keys.filter((key, index) => keys.indexOf(key) === index);
}

export function loadCertificate(path) {
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value?.contract === CANONICAL_ARTIST_SITE_CONTRACT ? value : null;
  } catch {
    return null;
  }
}

function isGreen(certificate) {
  return certificate?.status === 'GREEN' && certificate?.safeToSend === true;
}

export function openKeys(certificate) {
  if (!certificate) return [MISSING_CERTIFICATE_KEY];
  if (isGreen(certificate)) return [];
  const keys = new Set();
  const integrity = certificate.evidenceIntegrityFailures ?? [];
  if (integrity.length > 0) keys.add(EVIDENCE_INTEGRITY_KEY);
  for (const check of certificate.failingChecks ?? []) {
    const defect = String(check?.defectRef ?? '');
    keys.add(isValidRemediationKey(defect) ? defect : checkKey(check?.id));
  }
  if (keys.size === 0) keys.add(EVIDENCE_INTEGRITY_KEY);
  return [...keys];
}

function description(certificate, key, runUrl) {
  const checks = (certificate?.failingChecks ?? []).filter(check => {
    const defect = String(check?.defectRef ?? '');
    const owned = isValidRemediationKey(defect) ? defect : checkKey(check?.id);
    return owned === key;
  });
  const related = [
    ...new Set(
      checks
        .map(check => check?.defectRef)
        .filter(ref => ref && !isValidRemediationKey(ref))
    ),
  ];
  const extras = [];
  if (related.length > 0)
    extras.push('', `Related defect: ${related.join(', ')}`);
  if (key === EVIDENCE_INTEGRITY_KEY) {
    for (const failure of certificate?.evidenceIntegrityFailures ?? []) {
      extras.push(`- ${failure}`);
    }
  }
  for (const check of checks) {
    extras.push(`- ${check.id}: ${check.detail}`);
    for (const evidence of check.evidence ?? []) extras.push(`  - ${evidence}`);
  }
  return `## Source
- Current issue: JOV-6572
- Source run: ${runUrl || 'unknown'}
- Candidate: ${certificate?.candidateId ?? 'unknown'}
- Revision: ${certificate?.sourceRevision ?? 'unknown'}

## Follow-up
Canonical artist-site certification is red for ${key}.

## Why it matters
GREEN is required before a candidate enters the human review/send queue.

## Classification
Required

## Acceptance criteria
The next certification of this outbound journey is GREEN for this defect.

## Dependency
None${extras.length > 0 ? `\n${extras.join('\n')}` : ''}`;
}

export async function reportCanonicalArtistSiteCertification(
  { certificate, runUrl = '', runId = '' },
  {
    env = process.env,
    upsert = upsertLinearIssueByTitleFingerprint,
    close = closeLinearIssueByFingerprint,
  } = {}
) {
  const open = openKeys(certificate);
  const closing = certificate
    ? intakeKeys().filter(key => !open.includes(key))
    : [];
  if (!remediationTriggersEnabled(env)) {
    return [...open, ...closing].map(key =>
      logRemediationDryRun({
        action: open.includes(key) ? 'upsert' : 'resolve',
        key,
        fingerprint: key,
      })
    );
  }
  const results = [];
  for (const key of open) {
    results.push(
      await upsert({
        fingerprint: key,
        labelKey: key,
        title: `Canonical artist-site certification is red (${key})`,
        description: description(certificate, key, runUrl),
        priority: 2,
        createStateName: 'Todo',
        reopenTerminal: true,
        apiKey: env.LINEAR_API_KEY,
      })
    );
  }
  for (const key of closing) {
    results.push(
      await close({
        fingerprint: key,
        labelKey: key,
        comment:
          'Canonical artist-site certification no longer reports this defect.',
        runId,
        apiKey: env.LINEAR_API_KEY,
      })
    );
  }
  const failed = results.find(result => result?.ok === false);
  if (failed) {
    throw new Error(
      `canonical artist-site intake failed: ${failed.reason ?? 'unknown'}`
    );
  }
  return results;
}

if (process.argv[1]?.endsWith('canonical-artist-site-intake.mjs')) {
  const certificate = loadCertificate(process.env.CERT_PATH ?? '');
  reportCanonicalArtistSiteCertification({
    certificate,
    runUrl: process.env.RUN_URL,
    runId: process.env.RUN_ID,
  })
    .then(() => {
      if (!certificate) process.exitCode = 1;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
