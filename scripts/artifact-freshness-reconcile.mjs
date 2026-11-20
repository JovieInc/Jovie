#!/usr/bin/env node
/**
 * Server-side artifact freshness reconciler (JOV-5368 slice).
 *
 * Observes certified → published → feed for production and staging desktop
 * channels. Installed/running stay explicit unknown until a device heartbeat
 * exists. Pages Summer via Linear upsert when a stage mismatch is red; closes
 * the Summer issue when the receipt is green.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchShippedDesktopVersions } from './desktop-installed-apps-audit.mjs';
import {
  desktopRelevantBetween,
  fetchLatestProductionVerifiedSha,
} from './lib/artifact-freshness-certified.mjs';
import {
  buildArtifactFreshnessReceipt,
  reconcileArtifactFreshness,
} from './lib/artifact-freshness-graph.mjs';
import { fetchDesktopPublishInFlight } from './lib/artifact-freshness-stamp.mjs';
import {
  closeLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export {
  DESKTOP_PRODUCTION_PATHS,
  desktopRelevantBetween,
  fetchLatestProductionVerifiedSha,
} from './lib/artifact-freshness-certified.mjs';
export { fetchDesktopPublishInFlight } from './lib/artifact-freshness-stamp.mjs';

export const ARTIFACT_FRESHNESS_KEY = 'artifact-freshness';

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * @param {unknown} error
 * @returns {ReturnType<typeof buildArtifactFreshnessReceipt>}
 */
export function observationFailureReceipt(error) {
  const reason = `artifact freshness observation failed: ${
    error instanceof Error ? error.message : String(error)
  }`;
  // Incomplete observation — never page as publication-unverified.
  return buildArtifactFreshnessReceipt({
    channels: [
      reconcileArtifactFreshness({
        channel: 'production',
        certified: { status: 'unknown', reason },
        published: { status: 'unknown', reason },
        feed: { status: 'unknown', reason },
      }),
      reconcileArtifactFreshness({
        channel: 'staging',
        certified: { status: 'unknown', reason: 'staging uses rolling tag' },
        published: { status: 'unknown', reason },
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
 *   readonly publishInFlight?: boolean | null;
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

  /** @type {boolean | null} */
  let publishInFlight = input.publishInFlight ?? null;
  if (!Object.hasOwn(input, 'publishInFlight')) {
    const stamp = await fetchDesktopPublishInFlight({
      fetchImpl,
      token: input.token,
    });
    // true / false / null (null = stamp observation incomplete).
    publishInFlight = stamp.inFlight;
  }

  const channels = [];
  for (const channel of /** @type {const} */ (['production', 'staging'])) {
    const published = shipped[channel];
    const stagingObservationError =
      channel === 'staging' ? (shipped.stagingObservationError ?? null) : null;
    const publicationObservationError =
      published?.publicationObservationError ?? null;
    const observationError =
      (stagingObservationError && !published?.version
        ? stagingObservationError
        : null) ?? publicationObservationError;
    // Transient observation failures must not look like unverified publish.
    if (observationError) {
      channels.push(
        reconcileArtifactFreshness({
          channel,
          certified:
            channel === 'production'
              ? certified
              : { status: 'unknown', reason: 'staging uses rolling tag' },
          published: {
            status: 'unknown',
            reason: `${channel}: ${observationError}`,
          },
          feed: {
            status: 'unknown',
            reason: `${channel}: ${observationError}`,
          },
          desktopRelevantSincePublished: false,
        })
      );
      continue;
    }
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
        publishInFlight:
          channel === 'production' ? publishInFlight : false,
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
      .filter(line => line != null)
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
 * Summer may close only when every required server stage was observed.
 * Installed/running stay unknown by design. Staging certified stays unknown
 * (rolling tag). Unknown published/feed — including stagingObservationError —
 * must not green-close an open stall.
 *
 * @param {ReturnType<typeof buildArtifactFreshnessReceipt>} receipt
 */
export function canResolveSummerForFreshness(receipt) {
  if (receipt?.red === true) return false;
  const channels = receipt?.channels ?? [];
  const production = channels.find(channel => channel.channel === 'production');
  const staging = channels.find(channel => channel.channel === 'staging');
  if (!production || !staging) return false;

  for (const channel of channels) {
    if (
      (channel.mismatches ?? []).some(mismatch =>
        [
          'certified-relevance-unknown',
          'certified-unpublished-inflight',
          'certified-unpublished-stamp-unknown',
        ].includes(mismatch.code)
      )
    ) {
      return false;
    }
    // Required server stages for both channels. Device stages stay unknown.
    for (const name of /** @type {const} */ (['published', 'feed'])) {
      if (channel.stages?.[name]?.status === 'unknown') return false;
    }
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
  console.log(
    `[artifact-freshness] summer-resolve=${JSON.stringify(resolved)}`
  );
  if (!resolved.ok) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
