import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCurrentPullRequest,
  resolveMergeGroupMembers,
  validateMergeGroupEvent,
} from '../../scripts/lib/merge-group-member-policy.mjs';
import { collectPaged } from './collect-quarantine-evidence.mjs';
import parity from './dep-parity.js';

const REPO = 'JovieInc/Jovie';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
function receiptPath(name, environment = process.env) {
  const directory = resolve(environment.DEPENDENCY_PARITY_RECEIPT_DIR || '.');
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}
function fact(ok, message) {
  if (!ok) throw new Error(message);
}
export function validateDependencyDigest(digest) {
  fact(
    digest?.schemaVersion === 1 &&
      digest.repository === REPO &&
      SHA.test(digest.headSha) &&
      positive(digest.runId) &&
      positive(digest.runAttempt) &&
      ['pull_request', 'merge_group'].includes(digest.event) &&
      Number.isFinite(Date.parse(digest.generatedAt)) &&
      HASH.test(digest.lockfileSha) &&
      HASH.test(digest.resolvedDigest) &&
      digest.resolved &&
      typeof digest.resolved === 'object' &&
      !Array.isArray(digest.resolved),
    'Invalid dependency digest identity'
  );
  const entries = Object.entries(digest.resolved);
  fact(
    entries.length > 0 &&
      entries.length <= 10000 &&
      entries.every(
        ([name, versions]) =>
          typeof name === 'string' &&
          name.length <= 300 &&
          Array.isArray(versions) &&
          versions.length > 0 &&
          versions.length <= 100 &&
          new Set(versions).size === versions.length &&
          JSON.stringify(versions) === JSON.stringify([...versions].sort()) &&
          versions.every(
            version =>
              typeof version === 'string' &&
              /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
                version
              )
          )
      ),
    'Invalid installed dependency graph'
  );
  const canonical = Object.fromEntries(
    entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => [name, [...versions].sort()])
  );
  fact(
    createHash('sha256').update(JSON.stringify(canonical)).digest('hex') ===
      digest.resolvedDigest,
    'Dependency graph hash mismatch'
  );
  return digest;
}
export function writeDependencyDigest(
  environment = process.env,
  execute = execFileSync
) {
  fact(
    environment.GITHUB_REPOSITORY === REPO,
    'Dependency repository mismatch'
  );
  const event = JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
  const expected =
    environment.GITHUB_EVENT_NAME === 'pull_request'
      ? event.pull_request?.head?.sha
      : event.merge_group?.head_sha;
  const headSha = execute('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
  fact(
    SHA.test(expected) && headSha === expected,
    'Dependency source mismatch'
  );
  const digest = validateDependencyDigest({
    ...parity.computeDigest({ exec: execute }),
    schemaVersion: 1,
    repository: REPO,
    headSha,
    runId: Number(environment.GITHUB_RUN_ID),
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
    event: environment.GITHUB_EVENT_NAME,
  });
  writeFileSync(
    receiptPath('dep-digest.json', environment),
    `${JSON.stringify(digest, null, 2)}\n`,
    {
      flag: 'wx',
    }
  );
  return digest;
}
export function compareDependencyDigests(group, sources) {
  validateDependencyDigest(group);
  fact(
    group.event === 'merge_group' &&
      Array.isArray(sources) &&
      sources.length > 0 &&
      sources.length <= 5,
    'Dependency group evidence incomplete'
  );
  const comparisons = [],
    mismatches = [];
  for (const source of sources) {
    validateDependencyDigest(source.digest);
    fact(
      positive(source.prNumber) && source.digest.event === 'pull_request',
      'Dependency source evidence incomplete'
    );
    if (source.digest.lockfileSha !== group.lockfileSha) {
      comparisons.push({
        prNumber: source.prNumber,
        sourceHeadSha: source.digest.headSha,
        comparable: false,
        reason: 'combined-lockfile-differs',
      });
      continue;
    }
    const names = new Set([
      ...Object.keys(source.digest.resolved),
      ...Object.keys(group.resolved),
    ]);
    for (const name of [...names].sort()) {
      const a = source.digest.resolved[name] ?? [],
        b = group.resolved[name] ?? [];
      if (JSON.stringify(a) !== JSON.stringify(b))
        mismatches.push(
          `#${source.prNumber} ${name}: source=${JSON.stringify(a)} group=${JSON.stringify(b)}`
        );
    }
    comparisons.push({
      prNumber: source.prNumber,
      sourceHeadSha: source.digest.headSha,
      comparable: true,
    });
  }
  fact(
    new Set(sources.map(source => source.prNumber)).size === sources.length,
    'Duplicate dependency group member'
  );
  fact(
    mismatches.length === 0,
    `DEPENDENCY PARITY MISMATCH\n${mismatches.join('\n')}`
  );
  return {
    schemaVersion: 1,
    repository: REPO,
    groupHeadSha: group.headSha,
    comparisons,
  };
}
export function readDigestArtifact(artifact, execute = execFileSync) {
  const root = mkdtempSync(join(tmpdir(), 'dependency-parity-'));
  try {
    const zip = join(root, 'digest.zip');
    writeFileSync(
      zip,
      execute(
        'gh',
        ['api', `repos/${REPO}/actions/artifacts/${artifact.id}/zip`],
        { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
      )
    );
    const names = execFileSync('unzip', ['-Z1', zip], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 4096,
    })
      .trim()
      .split('\n');
    fact(
      names.length === 1 && names[0] === 'dep-digest.json',
      'Unexpected dependency archive contents'
    );
    return JSON.parse(
      execFileSync('unzip', ['-p', zip, 'dep-digest.json'], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      })
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
/** @param {object} input
 * @param {any} input.event
 * @param {any} input.group
 * @param {(path:string)=>any} input.api
 * @param {(artifact:any)=>any} [input.download]
 */
export function collectDependencyParity({
  event,
  group,
  api,
  download = readDigestArtifact,
}) {
  const identity = validateMergeGroupEvent(event);
  fact(
    identity.repository === REPO && group.headSha === identity.headSha,
    'Dependency group source mismatch'
  );
  const comparison = api(
    `repos/${REPO}/compare/${identity.baseSha}...${identity.headSha}`
  );
  const members = resolveMergeGroupMembers({ event, comparison });
  const sources = members.map(member => {
    const pr = api(`repos/${REPO}/pulls/${member.number}`);
    assertCurrentPullRequest(member, pr);
    fact(
      pr.head.repo.full_name === REPO && !pr.head.repo.fork,
      'Foreign dependency source'
    );
    const sourceHead = pr.head.sha;
    const candidates = collectPaged(
      `repos/${REPO}/actions/runs?event=pull_request&head_sha=${sourceHead}`,
      'workflow_runs',
      api
    ).filter(
      run =>
        run.path === '.github/workflows/source-validation.yml' &&
        run.name === 'Source Validation' &&
        run.status === 'completed' &&
        run.conclusion === 'success'
    );
    candidates.sort((a, b) => b.id - a.id);
    fact(
      candidates.length > 0,
      `No successful dependency source run for #${pr.number}`
    );
    const run = api(`repos/${REPO}/actions/runs/${candidates[0].id}`);
    fact(
      run.id === candidates[0].id &&
        positive(run.run_attempt) &&
        run.event === 'pull_request' &&
        run.head_sha === sourceHead &&
        run.repository?.full_name === REPO &&
        run.head_repository?.full_name === REPO &&
        run.path === '.github/workflows/source-validation.yml' &&
        run.status === 'completed' &&
        run.conclusion === 'success',
      'Unbound dependency source run'
    );
    const name = `dependency-digest-${run.id}-${run.run_attempt}-${sourceHead}`;
    const artifacts = collectPaged(
      `repos/${REPO}/actions/runs/${run.id}/artifacts`,
      'artifacts',
      api
    ).filter(artifact => artifact.name === name);
    fact(
      artifacts.length === 1,
      'Dependency source artifact missing or ambiguous'
    );
    const artifact = artifacts[0];
    fact(
      positive(artifact.id) &&
        artifact.expired === false &&
        artifact.workflow_run?.id === run.id &&
        artifact.workflow_run?.head_sha === sourceHead,
      'Unbound dependency source artifact'
    );
    const digest = validateDependencyDigest(download(artifact));
    fact(
      digest.headSha === sourceHead &&
        digest.runId === run.id &&
        digest.runAttempt === run.run_attempt,
      'Unbound dependency source digest'
    );
    const latest = api(`repos/${REPO}/pulls/${member.number}`);
    fact(
      latest.state === 'open' && latest.head?.sha === sourceHead,
      'Dependency member source changed'
    );
    return { prNumber: member.number, digest };
  });
  return compareDependencyDigests(group, sources);
}
export function main() {
  if (process.argv[2] === 'write') return writeDependencyDigest();
  fact(
    process.argv[2] === 'compare' &&
      process.env.DEPENDENCY_PARITY_ENFORCED === 'true',
    'Dependency parity comparison is disabled'
  );
  const api = path =>
    JSON.parse(
      execFileSync('gh', ['api', path], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
      })
    );
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const group = JSON.parse(
    readFileSync(receiptPath('dep-digest.json'), 'utf8')
  );
  const result = collectDependencyParity({ event, group, api });
  writeFileSync(
    receiptPath('dep-parity.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    {
      flag: 'wx',
    }
  );
  console.log(JSON.stringify(result));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
