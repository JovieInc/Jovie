#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// Read only canonical CI artifacts. Never execute artifact contents or treat
// missing/legacy reports as proof of a clean test run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const REPOSITORY = 'JovieInc/Jovie';
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
const unitFile = s =>
  typeof s === 'string' &&
  /^apps\/web\/tests\/(?!e2e\/).+\.(test|spec)\.(ts|tsx|js|jsx)$/.test(s) &&
  !s.includes('\\') &&
  !s.split('/').some(x => !x || x === '..' || x === '.');
function check(ok, message) {
  if (!ok) throw new Error(message);
}
export function buildQuarantineEvidence(
  bundles,
  { headSha, now = Date.now() }
) {
  check(
    SHA.test(headSha) && Array.isArray(bundles),
    'Invalid collection source'
  );
  const observations = [];
  const blockedFiles = new Set();
  const runKeys = new Set();
  const artifactIds = new Set();
  for (const { run, artifacts } of bundles) {
    check(
      positive(run.id) &&
        positive(run.run_attempt) &&
        SHA.test(run.head_sha) &&
        run.status === 'completed' &&
        ['push', 'merge_group'].includes(run.event),
      'Untrusted run metadata'
    );
    check(
      run.repository === REPOSITORY &&
        Number.isFinite(Date.parse(run.created_at)) &&
        Date.parse(run.created_at) <= now &&
        Array.isArray(artifacts),
      'Foreign or malformed CI run'
    );
    const runKey = `${run.id}:${run.run_attempt}`;
    check(!runKeys.has(runKey), 'Duplicate run attempt');
    runKeys.add(runKey);
    for (const { artifact, reports } of artifacts) {
      check(
        positive(artifact.id) && !artifactIds.has(artifact.id),
        'Duplicate or invalid artifact'
      );
      artifactIds.add(artifact.id);
      check(
        !artifact.expired &&
          artifact.workflow_run?.id === run.id &&
          artifact.workflow_run?.head_sha === run.head_sha &&
          new RegExp(`^unit-flaky-${run.id}-${run.run_attempt}-`).test(
            artifact.name
          ),
        'Unbound execution artifact'
      );
      check(
        Array.isArray(reports) && reports.length > 0,
        'Missing execution report'
      );
      for (const report of reports) {
        // Version 1 reports expose flakes, but contain no clean-run evidence.
        if (report?.schemaVersion === 1) continue;
        check(
          report?.schemaVersion === 2 &&
            Array.isArray(report.executions) &&
            report.run?.repository === REPOSITORY &&
            report.run.headSha === run.head_sha &&
            report.run.runId === run.id &&
            report.run.runAttempt === run.run_attempt &&
            report.run.event === run.event,
          'Unbound execution report'
        );
        for (const row of report.executions) {
          if (!unitFile(row?.file)) continue;
          const eligible =
            report.complete === true &&
            row.complete === true &&
            HASH.test(row.fileHash) &&
            positive(row.executedCount) &&
            row.skippedCount === 0 &&
            Number.isSafeInteger(row.retryCount) &&
            row.retryCount >= 0 &&
            ['clean', 'flaky', 'failed'].includes(row.outcome) &&
            (row.outcome !== 'clean' || row.retryCount === 0) &&
            (row.outcome !== 'flaky' || row.retryCount > 0);
          // Any partial/unknown result for a file blocks ALL its older clean
          // observations; unrelated files can still produce useful evidence.
          if (!eligible) {
            blockedFiles.add(row.file);
            continue;
          }
          observations.push({
            repository: REPOSITORY,
            file: row.file,
            fileHash: row.fileHash,
            headSha: run.head_sha,
            runId: run.id,
            runAttempt: run.run_attempt,
            event: run.event,
            runAt: run.created_at,
            artifactId: artifact.id,
            artifactVerified: true,
            executedCount: row.executedCount,
            skippedCount: 0,
            retryCount: row.retryCount,
            outcome: row.outcome,
          });
        }
      }
    }
  }
  const seen = new Set();
  for (const row of observations) {
    const key = `${row.runId}:${row.runAttempt}:${row.file}`;
    check(!seen.has(key), 'Duplicate test execution');
    seen.add(key);
  }
  return {
    schemaVersion: 1,
    repository: REPOSITORY,
    headSha,
    generatedAt: new Date(now).toISOString(),
    complete: true,
    observations: observations.filter(row => !blockedFiles.has(row.file)),
    blockedFiles: [...blockedFiles].sort(),
  };
}
export function collectPaged(endpoint, key, api) {
  const all = [];
  let expected = null;
  for (let page = 1; page <= 10; page++) {
    const value = api(
      `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    );
    check(
      Number.isSafeInteger(value.total_count) &&
        value.total_count >= 0 &&
        value.total_count <= 1000 &&
        Array.isArray(value[key]),
      'Incomplete API collection'
    );
    if (expected === null) expected = value.total_count;
    check(
      expected === value.total_count && value[key].length <= 100,
      'Collection changed during pagination'
    );
    all.push(...value[key]);
    if (all.length === expected) {
      check(
        new Set(all.map(x => x.id)).size === all.length,
        'Duplicate API identifiers'
      );
      return all;
    }
    check(
      all.length < expected && value[key].length === 100,
      'Truncated API collection'
    );
  }
  throw new Error('API page budget exhausted');
}
function jsonApi(endpoint) {
  return JSON.parse(
    execFileSync('gh', ['api', endpoint], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    })
  );
}
export function collectArtifacts(runs, api = jsonApi, execute = execFileSync) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-evidence-'));
  try {
    return runs.map(run => ({
      run: { ...run, repository: REPOSITORY },
      artifacts: collectPaged(
        `repos/${REPOSITORY}/actions/runs/${run.id}/artifacts`,
        'artifacts',
        api
      )
        .filter(
          a =>
            a.name?.startsWith(`unit-flaky-${run.id}-${run.run_attempt}-`) &&
            !a.expired
        )
        .map(artifact => {
          check(positive(artifact.id), 'Invalid artifact identifier');
          const target = path.join(dir, String(artifact.id));
          fs.mkdirSync(target);
          const zip = path.join(target, 'artifact.zip');
          fs.writeFileSync(
            zip,
            execute(
              'gh',
              [
                'api',
                `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`,
              ],
              { timeout: 60000, maxBuffer: 16 * 1024 * 1024 }
            )
          );
          const names = execFileSync('unzip', ['-Z1', zip], {
            encoding: 'utf8',
            timeout: 10000,
            maxBuffer: 1024 * 1024,
          })
            .trim()
            .split('\n')
            .filter(name => !name.endsWith('/'));
          check(
            names.length > 0 &&
              names.length <= 64 &&
              new Set(names).size === names.length &&
              names.every(
                name =>
                  /^[A-Za-z0-9][A-Za-z0-9._/-]*\.flaky\.json$/.test(name) &&
                  !name
                    .split('/')
                    .some(segment => segment === '..' || segment === '.')
              ),
            'Unexpected execution archive contents'
          );
          // Read each ZIP member to a bounded pipe. A symlink member cannot
          // cause an artifact-controlled filesystem read.
          const reports = names.map(name =>
            JSON.parse(
              execFileSync('unzip', ['-p', zip, name], {
                encoding: 'utf8',
                timeout: 10000,
                maxBuffer: 4 * 1024 * 1024,
              })
            )
          );
          return { artifact, reports };
        }),
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export function collectCiHistory(workflowId, now, api = jsonApi) {
  check(
    positive(workflowId) && Number.isFinite(now),
    'Canonical CI identity required'
  );
  const cutoff = new Date(now - 7 * 86400000).toISOString();
  // Each event has its own ten-page/1,000-run limit. The complete combined
  // history therefore has a 2,000-run bound, rather than rejecting two valid
  // per-event collections whose sum exceeds 1,000. Never truncate a history.
  return ['push', 'merge_group'].flatMap(event =>
    collectPaged(
      `repos/${REPOSITORY}/actions/workflows/${workflowId}/runs?event=${event}&status=completed&created=%3E%3D${cutoff}`,
      'workflow_runs',
      api
    )
  );
}
export function main() {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const now = Date.now();
  const workflow = jsonApi(`repos/${REPOSITORY}/actions/workflows/ci.yml`);
  const runs = collectCiHistory(workflow.id, now);
  const selected = runs.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
  const report = buildQuarantineEvidence(collectArtifacts(selected), {
    headSha,
    now,
  });
  check(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() ===
      headSha,
    'Collection source changed'
  );
  fs.writeFileSync(
    'quarantine-evidence.json',
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    JSON.stringify({
      observations: report.observations.length,
      blockedFiles: report.blockedFiles.length,
      runs: selected.length,
    })
  );
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
