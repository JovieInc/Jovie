#!/usr/bin/env node
/**
 * Server-side artifact freshness reconciler (JOV-5368 slice).
 *
 * Observes certified → published → feed for production and staging desktop
 * channels. Installed/running stay explicit unknown until a device heartbeat
 * exists. Pages Summer via Linear upsert when a stage mismatch is red; closes
 * the Summer issue when the receipt is green.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchShippedDesktopVersions } from './desktop-installed-apps-audit.mjs';
import {
  buildArtifactFreshnessReceipt,
  reconcileArtifactFreshness,
} from './lib/artifact-freshness-graph.mjs';
import {
  closeLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const ARTIFACT_FRESHNESS_KEY = 'artifact-freshness';

export const DESKTOP_PRODUCTION_PATHS = Object.freeze([
  'VERSION',
  '.github/workflows/desktop-release.yml',
  'apps/desktop/build',
  'apps/desktop/electron-builder.yml',
  'apps/desktop/package.json',
  'apps/desktop/scripts/apply-electron-fuses.cjs',
  'apps/desktop/scripts/generate-dmg-background.mjs',
  'apps/desktop/scripts/prepare-icons.mjs',
  'apps/desktop/scripts/sync-version.mjs',
  'apps/desktop/scripts/write-env.mjs',
  'apps/desktop/src',
  'pnpm-lock.yaml',
  'scripts/desktop-release-assets.mjs',
]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const GITHUB_API = 'https://api.github.com';
const DEFAULT_REPO = 'JovieInc/Jovie';
const PRODUCTION_CONTROLLER_WORKFLOW = 'production-controller.yml';

/**
 * @param {string} publishedSha
 * @param {string} certifiedSha
 * @param {{ readonly execFileSync?: typeof execFileSync }} [deps]
 */
export function desktopRelevantBetween(publishedSha, certifiedSha, deps = {}) {
  if (!FULL_SHA.test(publishedSha) || !FULL_SHA.test(certifiedSha)) {
    return null;
  }
  if (publishedSha === certifiedSha) return false;
  const run = deps.execFileSync ?? execFileSync;
  try {
    const out = run(
      'git',
      [
        'diff',
        '--name-only',
        '-z',
        `${publishedSha}...${certifiedSha}`,
        '--',
        ...DESKTOP_PRODUCTION_PATHS,
      ],
      { encoding: 'utf8' }
    );
    return out.split('\0').filter(Boolean).length > 0;
  } catch {
    return null;
  }
}

/**
 * Production Verified lives on production-controller.yml, which triggers on
 * workflow_run (not push). Query that workflow's runs — never event=push.
 *
 * @param {{
 *   readonly repo?: string;
 *   readonly token?: string | null;
 *   readonly fetchImpl?: typeof fetch;
 * }} [input]
 */
export async function fetchLatestProductionVerifiedSha(input = {}) {
  const repo = input.repo ?? DEFAULT_REPO;
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovie-artifact-freshness',
  };
  const token = input.token ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${PRODUCTION_CONTROLLER_WORKFLOW}/runs?branch=main&status=completed&per_page=30`;
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return {
        status: 'unknown',
        reason: `Production Verified lookup returned ${response.status}`,
      };
    }
    const body = await response.json();
    const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
    for (const run of runs) {
      if (run?.conclusion !== 'success') continue;
      if (typeof run?.head_sha !== 'string' || !FULL_SHA.test(run.head_sha)) {
        continue;
      }
      const jobsUrl = `${GITHUB_API}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`;
      const jobsResponse = await fetchImpl(jobsUrl, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!jobsResponse.ok) continue;
      const jobsBody = await jobsResponse.json();
      const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
      const verified = jobs.some(
        job =>
          job?.name === 'Production Verified' && job?.conclusion === 'success'
      );
      if (verified) {
        return {
          status: 'known',
          sourceRevision: run.head_sha,
          at: run.updated_at ?? null,
          verified: true,
        };
      }
    }
    return {
      status: 'unknown',
      reason: 'No recent successful Production Verified job on main.',
    };
  } catch (error) {
    return {
      status: 'unknown',
      reason: `Production Verified lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * @param {unknown} error
 * @returns {ReturnType<typeof buildArtifactFreshnessReceipt>}
 */
export function observationFailureReceipt(error) {
  const reason = `artifact freshness observation failed: ${
    error instanceof Error ? error.message : String(error)
  }`;
  // published known+unverified surfaces `reason` into pageSummer (publication-unverified).
  return buildArtifactFreshnessReceipt({
    channels: [
      reconcileArtifactFreshness({
        channel: 'production',
        certified: { status: 'unknown', reason },
        published: { status: 'known', verified: false, reason },
        feed: { status: 'unknown', reason },
      }),
      reconcileArtifactFreshness({
        channel: 'staging',
        certified: { status: 'unknown', reason: 'staging uses rolling tag' },
        published: { status: 'known', verified: false, reason },
        feed: { status: 'unknown', reason },
      }),
    ],
  });
}

/**
 * @param {{
 *   readonly shipped?: Awaited<ReturnType<typeof fetchShippedDesktopVersions>>;
 *   readonly certified?: Awaited<ReturnType<typeof fetchLatestProductionVerifiedSha>>;
 *   readonly desktopRelevant?: boolean | null;
 *   readonly fetchImpl?: typeof fetch;
 *   readonly token?: string | null;
 * }} [input]
 */
export async function collectArtifactFreshness(input = {}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  let shipped = input.shipped;
  if (!shipped) {
    try {
      shipped = await fetchShippedDesktopVersions(fetchImpl);
    } catch (error) {
      return observationFailureReceipt(error);
    }
  }

  let certified = input.certified;
  if (!certified) {
    certified = await fetchLatestProductionVerifiedSha({
      fetchImpl,
      token: input.token,
    });
  }

  const channels = [];
  for (const channel of /** @type {const} */ (['production', 'staging'])) {
    const published = shipped[channel];
    const publishedStage = published?.version
      ? {
          status: 'known',
          sourceRevision: published.sourceRevision,
          version: published.version,
          at: published.publishedAt,
          verified: published.publicationIdentityVerified === true,
          reason: published.publicationError ?? null,
        }
      : {
          status: 'missing',
          reason: `${channel}: release missing`,
        };
    const feedStage =
      published?.publicationIdentityVerified === true
        ? {
            status: 'known',
            sourceRevision: published.sourceRevision,
            version: published.version,
            at: published.publishedAt,
            verified: true,
          }
        : {
            status: published?.version ? 'known' : 'unknown',
            sourceRevision: published?.sourceRevision ?? null,
            version: published?.version ?? null,
            verified: false,
            reason: published?.publicationError ?? 'feed unverified',
          };

    let desktopRelevant = input.desktopRelevant ?? null;
    if (
      channel === 'production' &&
      desktopRelevant === null &&
      certified.status === 'known' &&
      FULL_SHA.test(published?.sourceRevision ?? '')
    ) {
      desktopRelevant = desktopRelevantBetween(
        published.sourceRevision,
        certified.sourceRevision
      );
    }

    channels.push(
      reconcileArtifactFreshness({
        channel,
        certified:
          channel === 'production'
            ? certified
            : { status: 'unknown', reason: 'staging uses rolling tag' },
        published: publishedStage,
        feed: feedStage,
        desktopRelevantSincePublished: desktopRelevant,
      })
    );
  }

  return buildArtifactFreshnessReceipt({ channels });
}

/**
 * Stable Summer fingerprint. Title always contains ARTIFACT_FRESHNESS_KEY so
 * upsertLinearIssueByTitleFingerprint can dedupe; labelKey matches close path.
 *
 * @param {{
 *   readonly receipt: ReturnType<typeof buildArtifactFreshnessReceipt>;
 *   readonly sourceUrl?: string;
 *   readonly apiKey?: string | null;
 *   readonly upsert?: typeof upsertLinearIssueByTitleFingerprint;
 * }} input
 */
export async function pageSummerForFreshness(input) {
  const pageable = input.receipt.pageSummer ?? [];
  if (pageable.length === 0) {
    return { ok: true, action: 'noop', count: 0 };
  }
  const upsert = input.upsert ?? upsertLinearIssueByTitleFingerprint;
  const apiKey = input.apiKey ?? process.env.LINEAR_API_KEY;
  const lines = pageable.map(
    m => `- \`${m.channel}\` \`${m.code}\`: ${m.reason}`
  );
  const codes = pageable.map(m => m.code).join(', ');
  const result = await upsert({
    fingerprint: ARTIFACT_FRESHNESS_KEY,
    title: `[${ARTIFACT_FRESHNESS_KEY}] Desktop stage mismatch: ${codes}`,
    description: [
      'Automated artifact freshness graph (JOV-5368).',
      '',
      'Stages: certified → published → feed → installed → running.',
      'Installed/running stay unknown without a device heartbeat.',
      '',
      ...lines,
      '',
      input.sourceUrl ? `Source: ${input.sourceUrl}` : null,
      '',
      '## Done when',
      '- The mismatched stage closes through the existing desktop publisher or updater path.',
      '- A later reconcile receipt is green (or the exact governed blocker is named).',
      '',
      `Fingerprint: ${ARTIFACT_FRESHNESS_KEY}`,
    ]
      .filter(Boolean)
      .join('\n'),
    priority: 2,
    createStateName: 'Todo',
    reopenTerminal: true,
    labelKey: ARTIFACT_FRESHNESS_KEY,
    apiKey,
  });
  return { ...result, count: pageable.length };
}

/**
 * Summer may close only when production certified was actually observed and
 * desktop relevance between certified/published is not an unobserved null.
 * Unknown certified or null git-diff relevance skips certified-unpublished;
 * closing on that green would bury an open stall.
 *
 * @param {ReturnType<typeof buildArtifactFreshnessReceipt>} receipt
 */
export function canResolveSummerForFreshness(receipt) {
  if (receipt?.red === true) return false;
  const production = (receipt?.channels ?? []).find(
    channel => channel.channel === 'production'
  );
  if (!production) return false;
  if (
    (production.mismatches ?? []).some(
      mismatch => mismatch.code === 'certified-relevance-unknown'
    )
  ) {
    return false;
  }
  const certified = production.stages?.certified;
  const published = production.stages?.published;
  if (
    certified?.status === 'known' &&
    published?.status === 'known' &&
    typeof certified.sourceRevision === 'string' &&
    typeof published.sourceRevision === 'string' &&
    FULL_SHA.test(certified.sourceRevision) &&
    FULL_SHA.test(published.sourceRevision) &&
    certified.sourceRevision !== published.sourceRevision &&
    production.desktopRelevantSincePublished == null
  ) {
    return false;
  }
  return (
    certified?.status === 'known' &&
    certified.verified === true &&
    typeof certified.sourceRevision === 'string' &&
    FULL_SHA.test(certified.sourceRevision)
  );
}

/**
 * @param {{
 *   readonly sourceUrl?: string;
 *   readonly runId?: string;
 *   readonly apiKey?: string | null;
 *   readonly close?: typeof closeLinearIssueByFingerprint;
 * }} [input]
 */
export async function resolveSummerForFreshness(input = {}) {
  const close = input.close ?? closeLinearIssueByFingerprint;
  const apiKey = input.apiKey ?? process.env.LINEAR_API_KEY;
  return close({
    fingerprint: ARTIFACT_FRESHNESS_KEY,
    labelKey: ARTIFACT_FRESHNESS_KEY,
    comment: `Artifact freshness graph is green.${
      input.sourceUrl ? ` Source: ${input.sourceUrl}` : ''
    }`,
    runId: input.runId,
    apiKey,
  });
}

function resolveOutputPath(argv = process.argv) {
  const eq = argv.find(arg => arg.startsWith('--output='));
  if (eq) return eq.slice('--output='.length);
  const flag = argv.indexOf('--output');
  if (flag >= 0 && argv[flag + 1]) return argv[flag + 1];
  return join(process.env.RUNNER_TEMP || '/tmp', 'artifact-freshness.json');
}

async function main() {
  const outputPath = resolveOutputPath();
  const sourceUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : 'local';
  const runId = process.env.GITHUB_RUN_ID ?? undefined;

  let receipt;
  try {
    receipt = await collectArtifactFreshness();
  } catch (error) {
    receipt = observationFailureReceipt(error);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `[artifact-freshness] red=${receipt.red} mismatches=${receipt.pageSummer.length} → ${outputPath}`
  );

  if (!process.env.LINEAR_API_KEY) {
    if (receipt.red) {
      console.log(
        '[artifact-freshness] LINEAR_API_KEY absent; receipt is red but Summer was not paged.'
      );
    }
    return;
  }

  if (receipt.red) {
    const paged = await pageSummerForFreshness({ receipt, sourceUrl });
    console.log(`[artifact-freshness] summer=${JSON.stringify(paged)}`);
    if (!paged.ok) process.exitCode = 1;
    return;
  }

  if (!canResolveSummerForFreshness(receipt)) {
    console.log(
      '[artifact-freshness] observation incomplete (production certified unknown); Summer not resolved.'
    );
    return;
  }

  const resolved = await resolveSummerForFreshness({ sourceUrl, runId });
  console.log(`[artifact-freshness] summer-resolve=${JSON.stringify(resolved)}`);
  if (!resolved.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
