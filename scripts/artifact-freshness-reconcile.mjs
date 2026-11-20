#!/usr/bin/env node
/**
 * Server-side artifact freshness reconciler (JOV-5368 slice).
 *
 * Observes certified → published → feed for production and staging desktop
 * channels. Installed/running stay explicit unknown until a device heartbeat
 * exists. Pages Summer via Linear upsert when a stage mismatch is red.
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
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

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

  const url = `${GITHUB_API}/repos/${repo}/actions/runs?branch=main&event=push&status=completed&per_page=30`;
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
  const shipped =
    input.shipped ?? (await fetchShippedDesktopVersions(fetchImpl));
  const certified =
    input.certified ??
    (await fetchLatestProductionVerifiedSha({
      fetchImpl,
      token: input.token,
    }));

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
  const fingerprint = `artifact-freshness-${pageable
    .map(m => `${m.channel}:${m.code}`)
    .sort()
    .join('|')
    .slice(0, 80)}`;
  const result = await upsert({
    fingerprint,
    title: `[artifact-freshness] Desktop stage mismatch: ${pageable.map(m => m.code).join(', ')}`,
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
    ]
      .filter(Boolean)
      .join('\n'),
    priority: 2,
    createStateName: 'Todo',
    reopenTerminal: true,
    labelKey: 'remediation:artifact-freshness',
    apiKey,
  });
  return { ...result, count: pageable.length };
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

  const receipt = await collectArtifactFreshness();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `[artifact-freshness] red=${receipt.red} mismatches=${receipt.pageSummer.length} → ${outputPath}`
  );

  if (receipt.red && process.env.LINEAR_API_KEY) {
    const paged = await pageSummerForFreshness({ receipt, sourceUrl });
    console.log(`[artifact-freshness] summer=${JSON.stringify(paged)}`);
    if (!paged.ok) process.exitCode = 1;
  } else if (receipt.red) {
    console.log(
      '[artifact-freshness] LINEAR_API_KEY absent; receipt is red but Summer was not paged.'
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
