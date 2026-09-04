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
const SKEW = 5 * 60_000;
const MAX_AGE = 24 * 60 * 60_000;
const validId = value => Number.isSafeInteger(value) && value > 0;
const isObject = value =>
  value && typeof value === 'object' && !Array.isArray(value);
const sha256 = bytes =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
const sha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
const equal = (left, right) =>
  left?.length === right?.length &&
  left.every((value, index) => value === right[index]);
const compareStatus = Object.freeze({
  added: 'A',
  modified: 'M',
  removed: 'D',
  renamed: 'R',
});
function compareChangedFiles(compare, headCommit, sourceBaseSha, headSha) {
  const files = compare?.files;
  if (
    !sha(sourceBaseSha) ||
    sha(sourceBaseSha) === sha(headSha) ||
    compare?.status !== 'ahead' ||
    !Number.isSafeInteger(compare.ahead_by) ||
    compare.ahead_by < 1 ||
    compare.behind_by !== 0 ||
    sha(compare.base_commit?.sha) !== sha(sourceBaseSha) ||
    sha(compare.merge_base_commit?.sha) !== sha(sourceBaseSha) ||
    sha(headCommit?.sha) !== sha(headSha) ||
    !Number.isSafeInteger(compare.total_commits) ||
    compare.total_commits < 1 ||
    compare.total_commits > 250 ||
    !Array.isArray(compare.commits) ||
    compare.commits.length !== compare.total_commits ||
    compare.commits.some(commit => !sha(commit?.sha)) ||
    sha(compare.commits.at(-1)?.sha) !== sha(headSha) ||
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length >= 300
  )
    return null;
  /** GitHub exposes at most 300 files here; exactly 300 is ambiguous. */
  const changed = [];
  for (const file of files) {
    const status =
      typeof file?.status === 'string' &&
      Object.hasOwn(compareStatus, file.status)
        ? compareStatus[file.status]
        : null;
    if (
      !isObject(file) ||
      typeof file.filename !== 'string' ||
      !file.filename ||
      file.filename.startsWith('/') ||
      file.filename.includes('..') ||
      !status
    )
      return null;
    if (file.status === 'renamed') {
      if (
        typeof file.previous_filename !== 'string' ||
        !file.previous_filename ||
        file.previous_filename.startsWith('/') ||
        file.previous_filename.includes('..')
      )
        return null;
      changed.push({ path: file.previous_filename, status: 'R' });
    }
    changed.push({
      path: file.filename,
      status,
    });
  }
  return changed;
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
function archive(archiveBytes, expected) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-screen-proof-'));
  const zip = join(root, 'proof.zip');
  try {
    writeFileSync(zip, archiveBytes, { mode: 0o600 });
    const members = run('unzip', ['-Z1', zip])
      .toString()
      .split(/\r?\n/)
      .filter(Boolean);
    if (
      !equal([...members].sort(), expected) ||
      members.some(
        name =>
          name.startsWith('/') || name.includes('..') || name.includes('\\')
      )
    )
      throw new Error('unsafe artifact member set');
    const bytes = new Map(
      expected.map(name => [
        name,
        Buffer.from(run('unzip', ['-p', zip, name], true)),
      ])
    );
    return {
      proof: JSON.parse(bytes.get('screen-proof.json').toString('utf8')),
      bytes,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
/** Owned GitHub transport; tests replace `gh` on PATH, never a verifier result. */
export function resolveTrustedScreenProof({ artifactId, context }) {
  const now = Date.now();
  const viewports = Array.isArray(context?.viewports)
    ? [...context.viewports].sort()
    : [];
  const fail = finding => ({ proof: null, findings: [finding] });
  if (
    !validId(artifactId) ||
    !sha(context?.headSha) ||
    !context?.screenId ||
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
    if (
      !validId(runId) ||
      !validId(attempt) ||
      artifact.id !== artifactId ||
      artifact.name !== PRODUCER.artifact ||
      artifact.expired ||
      !/^sha256:[0-9a-f]{64}$/i.test(artifact.digest ?? '') ||
      workflowRun.repository?.full_name !== PRODUCER.repository ||
      workflowRun.head_branch !== 'main' ||
      workflowRun.head_sha?.toLowerCase() !== context.headSha.toLowerCase() ||
      workflowRun.path !== PRODUCER.workflow ||
      workflowRun.event !== 'push' ||
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
      sha(proof.headSha) !== sha(context.headSha) ||
      proof.environment !== PRODUCER.environment ||
      !paths(proof.sourcePaths) ||
      !sha(proof.sourceBaseSha) ||
      sha(proof.sourceBaseSha) === sha(context.headSha) ||
      proof.stateScope !==
        (context.screenId === 'web.homepage'
          ? 'homepage-cookie-state-observed'
          : 'bounded-public-route-transient-ui-suppressed') ||
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
      captures.some(([, bytes]) => !validPlaywrightPng(bytes))
    )
      return fail(
        'candidate identity, capture, or decoded bundle is unavailable'
      );
    // sourceBaseSha is recorded from the trusted push event.before in the
    // immutable artifact. The authoritative compare below rejects a base that
    // is not the exact ancestor of this captured run head.
    const compare = JSON.parse(
      api(
        `compare/${proof.sourceBaseSha.toLowerCase()}...${context.headSha.toLowerCase()}`
      )
    );
    const headCommit = JSON.parse(
      api(`commits/${context.headSha.toLowerCase()}`)
    );
    const changedFiles = compareChangedFiles(
      compare,
      headCommit,
      proof.sourceBaseSha,
      context.headSha
    );
    if (!changedFiles)
      return fail(
        'authoritative push source scope is unavailable or ambiguous'
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
    return { proof, changedFiles, findings: [] };
  } catch {
    return fail('controlled GitHub artifact resolver is unavailable');
  }
}
