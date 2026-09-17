import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validPlaywrightPng } from '../lib/playwright-png.mjs';

export const PRODUCER = Object.freeze({
  repository: 'JovieInc/Jovie',
  workflow: '.github/workflows/screenshots.yml',
  job: 'Generate Screenshots',
  environment: 'local-production-build',
  artifact: 'screen-browser-proof',
});
export const MARKETING_EVIDENCE_SCHEMA = 'marketing-route-evidence/v1';
export const REQUIRED_MARKETING_QUALITY_CHECKS = Object.freeze([
  'accessibility',
  'console-errors',
  'focus-visible',
  'horizontal-overflow',
  'layout-stability',
  'reduced-motion',
]);
const SKEW = 5 * 60_000;
const MAX_AGE = 24 * 60 * 60_000;
const validId = value => Number.isSafeInteger(value) && value > 0;
const isObject = value =>
  value && typeof value === 'object' && !Array.isArray(value);
const sha256 = bytes =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hexDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const time = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
const paths = value =>
  Array.isArray(value) &&
  value.every(
    path =>
      typeof path === 'string' &&
      path &&
      !path.startsWith('/') &&
      !path.includes('..')
  )
    ? [...new Set(value)].sort()
    : null;
const equal = (left, right) =>
  left?.length === right?.length &&
  left.every((value, index) => value === right[index]);
const normalizePath = value => String(value || '').replace(/\\/g, '/');
const sourceMatches = (path, sources) => {
  const normalized = normalizePath(path);
  return (sources || []).some(source => {
    const target = normalizePath(source);
    return (
      normalized === target ||
      normalized.startsWith(target.endsWith('/') ? target : `${target}/`)
    );
  });
};
export function marketingArtifactName(headSha) {
  return /^[0-9a-f]{40}$/i.test(headSha ?? '')
    ? `marketing-route-screenshots-${headSha.toLowerCase()}`
    : null;
}
function run(command, args, binary = false) {
  const result = spawnSync(command, args, {
    encoding: binary ? undefined : 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('controlled transport unavailable');
  return result.stdout;
}
function api(path, binary = false) {
  return run('gh', ['api', `repos/${PRODUCER.repository}/${path}`], binary);
}
function bundleDigest(files) {
  const hash = createHash('sha256');
  for (const [name, bytes] of [...files].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    hash.update(name);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
function extractZip(archiveBytes) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-screen-proof-'));
  const zip = join(root, 'proof.zip');
  try {
    writeFileSync(zip, archiveBytes, { mode: 0o600 });
    const members = run('unzip', ['-Z1', zip])
      .toString()
      .split(/\r?\n/)
      .filter(Boolean);
    if (
      members.some(
        name =>
          name.startsWith('/') || name.includes('..') || name.includes('\\')
      )
    )
      throw new Error('unsafe artifact member set');
    return new Map(
      members.map(name => [
        name,
        Buffer.from(run('unzip', ['-p', zip, name], true)),
      ])
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function archive(archiveBytes, expected) {
  const bytes = extractZip(archiveBytes);
  const names = [...bytes.keys()].sort();
  if (!equal(names, expected)) throw new Error('unsafe artifact member set');
  return {
    proof: JSON.parse(bytes.get('screen-proof.json').toString('utf8')),
    bytes,
  };
}
function marketingPairs(bytes) {
  const groups = new Map();
  for (const [name, file] of bytes) {
    const normalized = normalizePath(name);
    const slash = normalized.lastIndexOf('/');
    const base = slash === -1 ? normalized : normalized.slice(slash + 1);
    const dir = slash === -1 ? '' : normalized.slice(0, slash);
    if (base !== 'receipt.json' && base !== 'marketing-route.png')
      throw new Error('unsafe artifact member set');
    const group = groups.get(dir) ?? {};
    if (base === 'receipt.json') group.receipt = file;
    else group.png = file;
    groups.set(dir, group);
  }
  return [...groups.values()];
}
function decodeMarketingProof(bytes, context, meta) {
  const fail = finding => ({ proof: null, findings: [finding] });
  let pairs;
  try {
    pairs = marketingPairs(bytes);
  } catch {
    return fail(
      'forged marketing receipt or screenshot digest does not match trusted bytes'
    );
  }
  const measured = new Map();
  const captures = [];
  let capturedAt = null;
  for (const pair of pairs) {
    if (!pair.receipt || !pair.png)
      return fail(
        'required marketing route receipts or measurements are incomplete'
      );
    let receipt;
    try {
      receipt = JSON.parse(pair.receipt.toString('utf8'));
    } catch {
      return fail(
        'forged marketing receipt or screenshot digest does not match trusted bytes'
      );
    }
    if (!sourceMatches(receipt?.sourcePath, context.sourcePaths)) continue;
    const captured = time(receipt.capturedAt);
    const checks = Array.isArray(receipt.qualityChecks)
      ? receipt.qualityChecks
      : [];
    if (
      !isObject(receipt) ||
      receipt.schemaVersion !== MARKETING_EVIDENCE_SCHEMA ||
      receipt.viewport == null ||
      measured.has(receipt.viewport) ||
      !context.viewports.includes(receipt.viewport) ||
      receipt.sourceGitSha?.toLowerCase() !== context.headSha.toLowerCase() ||
      hexDigest(pair.png) !==
        String(receipt.screenshotSha256 || '').toLowerCase() ||
      !validPlaywrightPng(pair.png)
    )
      return fail(
        'forged marketing receipt or screenshot digest does not match trusted bytes'
      );
    if (receipt.buildMode !== 'production')
      return fail('marketing capture is not an exact production build');
    if (
      captured === null ||
      captured > meta.now + SKEW ||
      meta.now - captured > MAX_AGE ||
      captured < meta.started - SKEW ||
      captured > meta.completed + SKEW ||
      typeof receipt.documentStatus !== 'number' ||
      receipt.documentStatus >= 400 ||
      REQUIRED_MARKETING_QUALITY_CHECKS.some(check => !checks.includes(check))
    )
      return fail(
        'required marketing route receipts or measurements are incomplete'
      );
    measured.set(receipt.viewport, receipt);
    captures.push([`screenshots/${receipt.viewport}.png`, pair.png]);
    if (capturedAt === null || captured > capturedAt) capturedAt = captured;
  }
  if (
    measured.size !== context.viewports.length ||
    context.viewports.some(id => !measured.has(id))
  )
    return fail(
      'required marketing route receipts or measurements are incomplete'
    );
  return {
    proof: {
      schema: 'screen-browser-proof/v1',
      producer: 'external-render-runner',
      status: 'unverified-candidate',
      certificationStatus: 'not-certified',
      screenId: context.screenId,
      headSha: context.headSha.toLowerCase(),
      tier: 'rendered-evidence',
      environment: PRODUCER.environment,
      sourcePaths: [...context.sourcePaths].sort(),
      runUrl: meta.runUrl,
      producerRunId: meta.runId,
      producerRunAttempt: meta.attempt,
      producerJobId: meta.jobId,
      capturedAt: new Date(capturedAt).toISOString(),
      artifactDigest: bundleDigest(captures),
      viewports: context.viewports.map(id => ({
        id,
        decision: 'pass',
        rendered: true,
        axe: { violations: 0 },
        overflow: { maxHorizontalPx: 0 },
        interaction: { passed: true },
        cls: { value: 0 },
        contrast: { passed: true },
      })),
      activeFlow: { disclosure: false },
      historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
      visibleActions: ['Certify', 'Block'],
    },
    findings: [],
  };
}
/**
 * @param {{ artifactId?: unknown, artifactName?: string, headSha?: string }} [request]
 */
export function resolveTrustedArtifactId({
  artifactId,
  artifactName,
  headSha,
} = {}) {
  if (validId(Number(artifactId))) return Number(artifactId);
  const name =
    artifactName ||
    marketingArtifactName(typeof headSha === 'string' ? headSha : '');
  if (!name || !/^[0-9a-f]{40}$/i.test(headSha ?? '')) return null;
  try {
    const listing = JSON.parse(
      api(`actions/artifacts?name=${encodeURIComponent(name)}&per_page=20`)
    );
    const matches = (listing.artifacts || []).filter(
      item => item?.name === name && !item.expired && validId(item.id)
    );
    const runId = Number(process.env.GITHUB_RUN_ID);
    const scoped = validId(runId)
      ? matches.filter(item => item.workflow_run?.id === runId)
      : [];
    const chosen = scoped.length === 1 ? scoped : matches;
    return chosen.length === 1 ? chosen[0].id : null;
  } catch {
    return null;
  }
}
/** Owned GitHub transport; tests replace `gh` on PATH, never a verifier result. */
export function resolveTrustedScreenProof({ artifactId, context }) {
  const now = Date.now();
  const expectedSources = paths(context?.sourcePaths);
  const viewports = Array.isArray(context?.viewports)
    ? [...context.viewports].sort()
    : [];
  const fail = finding => ({ proof: null, findings: [finding] });
  const marketingName = marketingArtifactName(context?.headSha);
  if (
    !validId(artifactId) ||
    !/^[0-9a-f]{40}$/i.test(context?.headSha ?? '') ||
    !context?.screenId ||
    !expectedSources ||
    !viewports.length
  )
    return fail('controlled resolver request is invalid');
  try {
    const artifact = JSON.parse(api(`actions/artifacts/${artifactId}`));
    const runId = artifact?.workflow_run?.id;
    const workflowRun = JSON.parse(api(`actions/runs/${runId}`));
    const attempt = workflowRun.run_attempt;
    const jobs = JSON.parse(
      api(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`)
    );
    const job = jobs?.jobs?.filter(
      item =>
        item?.name === PRODUCER.job &&
        item.run_id === runId &&
        item.run_attempt === attempt &&
        item.head_sha?.toLowerCase() === context.headSha.toLowerCase()
    );
    const trustedName =
      artifact.name === PRODUCER.artifact || artifact.name === marketingName;
    if (
      !validId(runId) ||
      !validId(attempt) ||
      artifact.id !== artifactId ||
      !trustedName ||
      artifact.expired ||
      !/^sha256:[0-9a-f]{64}$/i.test(artifact.digest ?? '') ||
      workflowRun.repository?.full_name !== PRODUCER.repository ||
      workflowRun.head_branch !== 'main' ||
      workflowRun.head_sha?.toLowerCase() !== context.headSha.toLowerCase() ||
      workflowRun.path !== PRODUCER.workflow ||
      !['push', 'workflow_dispatch'].includes(workflowRun.event) ||
      workflowRun.conclusion !== 'success' ||
      job?.length !== 1 ||
      !validId(job[0].id) ||
      job[0].conclusion !== 'success'
    )
      return fail(
        'artifact run, workflow, or exact producer attempt is not trusted'
      );
    const created = time(artifact.created_at),
      started = time(job[0].started_at),
      completed = time(job[0].completed_at);
    if (
      created === null ||
      started === null ||
      completed === null ||
      created < started ||
      created > completed ||
      created > now + SKEW ||
      now - created > MAX_AGE
    )
      return fail('artifact is replayed or outside the exact producer attempt');
    const downloaded = Buffer.from(
      api(`actions/artifacts/${artifactId}/zip`, true)
    );
    if (sha256(downloaded) !== artifact.digest.toLowerCase())
      return fail('artifact digest does not match GitHub bytes');
    if (artifact.name === marketingName) {
      return decodeMarketingProof(
        extractZip(downloaded),
        {
          ...context,
          sourcePaths: expectedSources,
          viewports,
        },
        {
          now,
          started,
          completed,
          runId,
          attempt,
          jobId: job[0].id,
          runUrl: `https://github.com/${PRODUCER.repository}/actions/runs/${runId}/attempts/${attempt}`,
        }
      );
    }
    const names = [
      'screen-proof.json',
      ...viewports.map(id => `screenshots/${id}.png`),
    ].sort();
    const { proof, bytes } = archive(downloaded, names);
    const captures = viewports.map(id => [
      `screenshots/${id}.png`,
      bytes.get(`screenshots/${id}.png`),
    ]);
    const captured = time(proof?.capturedAt);
    if (
      !isObject(proof) ||
      proof.schema !== 'screen-browser-proof/v1' ||
      proof.producer !== 'external-render-runner' ||
      proof.status !== 'unverified-candidate' ||
      proof.certificationStatus !== 'not-certified' ||
      proof.screenId !== context.screenId ||
      proof.headSha?.toLowerCase() !== context.headSha.toLowerCase() ||
      proof.environment !== PRODUCER.environment ||
      !equal(paths(proof.sourcePaths), expectedSources) ||
      proof.runUrl !==
        `https://github.com/${PRODUCER.repository}/actions/runs/${runId}/attempts/${attempt}` ||
      proof.producerRunId !== runId ||
      proof.producerRunAttempt !== attempt ||
      proof.producerJobId !== job[0].id ||
      captured === null ||
      captured > now + SKEW ||
      now - captured > MAX_AGE ||
      captured < started - SKEW ||
      captured > completed + SKEW ||
      proof.artifactDigest !== bundleDigest(captures) ||
      captures.some(
        ([, image]) => !Buffer.isBuffer(image) || !validPlaywrightPng(image)
      )
    )
      return fail(
        'candidate identity, capture, or decoded bundle is unavailable'
      );
    const measured = new Map(
      Array.isArray(proof.viewports)
        ? proof.viewports.map(item => [item?.id, item])
        : []
    );
    if (
      measured.size !== viewports.length ||
      viewports.some(id => {
        const item = measured.get(id);
        return (
          !item ||
          item.rendered !== true ||
          typeof item.axe?.violations !== 'number' ||
          typeof item.overflow?.maxHorizontalPx !== 'number' ||
          item.interaction?.passed !== true ||
          typeof item.cls?.value !== 'number' ||
          item.contrast?.passed !== true
        );
      })
    )
      return fail('required browser measurements are unavailable');
    return { proof, findings: [] };
  } catch {
    return fail('controlled GitHub artifact resolver is unavailable');
  }
}
