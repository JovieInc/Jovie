#!/usr/bin/env node
/**
 * JOV-13105 workflow half: assemble a run-file from a workflow_run event
 * (and bounded, event-driven API reads) and decide whether to request one
 * infra-only retry. Flip detection, bulk-rerun exclusion, gate-vs-test
 * split, and quarantine live in scripts/lib/flake-ledger.mjs — this hook
 * never classifies a flake itself.
 *
 *   node scripts/flake-ledger-workflow-hook.mjs build-run-file
 *   node scripts/flake-ledger-workflow-hook.mjs maybe-retry
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEDGER_SCHEMA = 'jovie-flake-ledger/v1';
export const COLLECTOR_ENTRYPOINT = 'scripts/lib/flake-ledger.mjs';
export const RECORD_COMMAND =
  'node scripts/lib/flake-ledger.mjs record --ledger';
export const REPORT_COMMAND =
  'node scripts/lib/flake-ledger.mjs report --ledger';
export const EMPTY_LEDGER = {
  schemaVersion: LEDGER_SCHEMA,
  failures: [],
  flips: [],
  retries: [],
};

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const POSITIVE_INT = /^[1-9][0-9]*$/;
const CONCLUSIONS = new Set(['success', 'failure', 'timed_out', 'cancelled']);
const SOURCE_VALIDATION_PATH = '.github/workflows/source-validation.yml';
const PR_READY = 'PR Ready';

function githubRequest(
  path,
  { token, method = 'GET', fetchImpl = fetch } = {}
) {
  const apiUrl = (
    process.env.GITHUB_API_URL || 'https://api.github.com'
  ).replace(/\/$/, '');
  return fetchImpl(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }).then(async response => {
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('GitHub returned invalid JSON');
      }
    }
    return { ok: response.ok, status: response.status, data };
  });
}

function ensureLedger(ledgerPath, { readFile, writeFile, exists }) {
  if (exists(ledgerPath)) {
    try {
      return JSON.parse(readFile(ledgerPath, 'utf8'));
    } catch {
      // Fall through and replace a missing or unreadable ledger.
    }
  }
  writeFile(ledgerPath, `${JSON.stringify(EMPTY_LEDGER, null, 2)}\n`);
  return { ...EMPTY_LEDGER };
}

function writeJson(writeFile, mkdir, path, value) {
  mkdir(dirname(path), { recursive: true });
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function workflowRunFrom(payload) {
  return payload?.workflow_run ?? payload ?? {};
}

function subjectList(jobs = []) {
  const subjects = [];
  for (const job of jobs) {
    if (job?.conclusion !== 'failure' && job?.conclusion !== 'timed_out')
      continue;
    if (typeof job.name === 'string' && job.name.trim())
      subjects.push(`job:${job.name.trim()}`);
    for (const step of job.steps ?? []) {
      if (step?.conclusion !== 'failure' && step?.conclusion !== 'timed_out')
        continue;
      if (typeof step.name === 'string' && step.name.trim())
        subjects.push(`step:${job.name}::${step.name.trim()}`);
    }
  }
  return [...new Set(subjects)];
}

function onlyPrReadyFailed(subjects) {
  const jobs = subjects.filter(s => s.startsWith('job:'));
  return jobs.length > 0 && jobs.every(s => s === `job:${PR_READY}`);
}

function annotationText(annotations = []) {
  return annotations
    .map(item =>
      [item?.title, item?.message, item?.raw_details].filter(Boolean).join('\n')
    )
    .join('\n');
}

export function runRecordFromEvent(payload, extras = {}) {
  const run = workflowRunFrom(payload);
  const pull = Array.isArray(run.pull_requests) ? run.pull_requests[0] : null;
  const baseSha = extras.baseSha ?? pull?.base?.sha ?? null;
  const headSha = extras.headSha ?? pull?.head?.sha ?? run.head_sha ?? null;
  const observedAt =
    extras.observedAt ??
    run.updated_at ??
    run.run_started_at ??
    new Date().toISOString();
  return {
    workflowPath: run.path ?? SOURCE_VALIDATION_PATH,
    runId: Number(run.id),
    runAttempt: Number(run.run_attempt ?? 1),
    headSha,
    baseSha,
    conclusion: run.conclusion,
    failedSubjects: extras.failedSubjects ?? [],
    completedAt: run.updated_at ?? observedAt,
    observedAt,
  };
}

export function assertRunnableRecord(record) {
  if (
    !String(record.workflowPath ?? '').endsWith('.yml') &&
    !String(record.workflowPath ?? '').endsWith('.yaml')
  )
    throw new Error('workflow path must be a .yml workflow file');
  if (!SHA.test(record.headSha ?? '')) throw new Error('head SHA is required');
  if (record.baseSha != null && !SHA.test(record.baseSha))
    throw new Error('base SHA must be 40 hex characters when present');
  if (!POSITIVE_INT.test(String(record.runId)))
    throw new Error('run id must be a positive integer');
  if (!POSITIVE_INT.test(String(record.runAttempt)))
    throw new Error('run attempt must be a positive integer');
  if (!CONCLUSIONS.has(record.conclusion))
    throw new Error('conclusion is not a completed run conclusion');
}

export async function buildRunFile(options = {}, dependencies = {}) {
  const {
    eventPath = process.env.GITHUB_EVENT_PATH,
    repository = process.env.GITHUB_REPOSITORY,
    token = process.env.GH_READ_TOKEN,
    outDir = process.env.FLAKE_LEDGER_OUT_DIR || '.flake-ledger',
    now = new Date().toISOString(),
  } = options;
  const readFile = dependencies.readFile ?? readFileSync;
  const writeFile = dependencies.writeFile ?? writeFileSync;
  const mkdir = dependencies.mkdir ?? mkdirSync;
  const request = dependencies.request ?? githubRequest;

  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required');
  const payload = JSON.parse(readFile(eventPath, 'utf8'));
  const run = workflowRunFrom(payload);
  const repo = repository ?? '';
  if (!REPOSITORY.test(repo)) throw new Error('repository is required');

  const record = runRecordFromEvent(payload, { observedAt: now });
  const meta = {
    event: run.event ?? null,
    actorLogin: run.actor?.login ?? null,
    triggeringActorLogin:
      run.triggering_actor?.login ?? run.actor?.login ?? null,
    runStartedAt: run.run_started_at ?? null,
    createdAt: run.created_at ?? null,
    headRepository: run.head_repository?.full_name ?? null,
    attempt1Conclusion: null,
    attempt1FailedSubjects: [],
  };

  if (token && REPOSITORY.test(repo) && POSITIVE_INT.test(String(run.id))) {
    const jobsPath = `/repos/${repo}/actions/runs/${run.id}/attempts/${record.runAttempt}/jobs?filter=all&per_page=100`;
    const jobsResult = await request(jobsPath, { token });
    if (jobsResult.ok)
      record.failedSubjects = subjectList(jobsResult.data?.jobs ?? []);

    if (record.runAttempt > 1) {
      const attemptPath = `/repos/${repo}/actions/runs/${run.id}/attempts/1`;
      const attemptResult = await request(attemptPath, { token });
      if (attemptResult.ok) {
        meta.attempt1Conclusion = attemptResult.data?.conclusion ?? null;
        const attemptJobs = await request(
          `/repos/${repo}/actions/runs/${run.id}/attempts/1/jobs?filter=all&per_page=100`,
          { token }
        );
        const attempt1 = runRecordFromEvent(
          {
            workflow_run: {
              ...run,
              run_attempt: 1,
              conclusion: meta.attempt1Conclusion,
            },
          },
          {
            observedAt: attemptResult.data?.updated_at ?? now,
            failedSubjects: attemptJobs.ok
              ? subjectList(attemptJobs.data?.jobs ?? [])
              : [],
          }
        );
        meta.attempt1FailedSubjects = attempt1.failedSubjects;
        writeJson(writeFile, mkdir, resolve(outDir, 'attempt1.json'), attempt1);
      }
    }
  }

  assertRunnableRecord(record);
  writeJson(writeFile, mkdir, resolve(outDir, 'run.json'), record);
  writeJson(writeFile, mkdir, resolve(outDir, 'meta.json'), meta);
  return { record, meta, outDir };
}

export function ensureCollectorEntrypoint(
  root = process.cwd(),
  exists = existsSync
) {
  return exists(resolve(root, COLLECTOR_ENTRYPOINT));
}

export async function loadCollector(
  root = process.cwd(),
  importer = url => import(url)
) {
  const path = resolve(root, COLLECTOR_ENTRYPOINT);
  return importer(pathToFileURL(path).href);
}

export async function maybeRetry(options = {}, dependencies = {}) {
  const {
    eventPath = process.env.GITHUB_EVENT_PATH,
    repository = process.env.GITHUB_REPOSITORY,
    readToken = process.env.GH_READ_TOKEN,
    writeToken = process.env.GH_TOKEN,
    ledgerPath = process.env.FLAKE_LEDGER_PATH || '.flake-ledger/ledger.json',
    outDir = process.env.FLAKE_LEDGER_OUT_DIR || '.flake-ledger',
    root = process.cwd(),
    now = Date.now(),
  } = options;
  const readFile = dependencies.readFile ?? readFileSync;
  const writeFile = dependencies.writeFile ?? writeFileSync;
  const exists = dependencies.exists ?? existsSync;
  const request = dependencies.request ?? githubRequest;
  const notice =
    dependencies.notice ?? (msg => console.log(`::notice::${msg}`));

  const finish = result => {
    writeJson(
      writeFile,
      dependencies.mkdir ?? mkdirSync,
      resolve(outDir, 'retry-decision.json'),
      result
    );
    return result;
  };

  if (!ensureCollectorEntrypoint(root, exists)) {
    notice(
      `HA collector ${COLLECTOR_ENTRYPOINT} is not on this ref; no retry was requested.`
    );
    return finish({ retried: false, reason: 'collector-entrypoint-missing' });
  }

  const payload = JSON.parse(readFile(eventPath, 'utf8'));
  const run = workflowRunFrom(payload);
  const conclusion = run.conclusion;
  if (conclusion !== 'failure' && conclusion !== 'timed_out')
    return finish({ retried: false, reason: 'run-not-failed' });

  const runAttempt = Number(run.run_attempt ?? 1);
  if (runAttempt >= 2)
    return finish({ retried: false, reason: 'already-retried' });

  if (!readToken)
    return finish({ retried: false, reason: 'missing-read-token' });

  const repo = repository ?? '';
  const jobsResult = await request(
    `/repos/${repo}/actions/runs/${run.id}/attempts/${runAttempt}/jobs?filter=all&per_page=100`,
    { token: readToken }
  );
  if (!jobsResult.ok)
    return finish({ retried: false, reason: 'jobs-lookup-failed' });
  const jobs = jobsResult.data?.jobs ?? [];
  const failedSubjects = subjectList(jobs);
  if (onlyPrReadyFailed(failedSubjects))
    return finish({
      retried: false,
      reason: 'pr-ready-only-left-to-fleet-rules',
    });

  const annotations = [];
  for (const job of jobs) {
    if (!job?.id) continue;
    if (job.conclusion !== 'failure' && job.conclusion !== 'timed_out')
      continue;
    const listed = await request(
      `/repos/${repo}/check-runs/${job.id}/annotations`,
      { token: readToken }
    );
    if (listed.ok && Array.isArray(listed.data))
      annotations.push(...listed.data);
  }

  const collector = await loadCollector(root, dependencies.importCollector);
  const classification = collector.classifyRerunEligibility({
    conclusion,
    annotationText: annotationText(annotations),
    failedSteps: failedSubjects,
  });
  if (
    !classification?.retryable ||
    classification.kind !== 'transient-infrastructure'
  )
    return finish({
      retried: false,
      reason: 'classifier-denied',
      classification,
    });

  const ledger = ensureLedger(ledgerPath, {
    readFile,
    writeFile,
    exists,
  });
  const key = {
    headSha: run.head_sha,
    baseSha: run.pull_requests?.[0]?.base?.sha ?? null,
    workflowPath: run.path ?? SOURCE_VALIDATION_PATH,
  };
  if (!collector.canRetry(ledger, key, { now }).allowed)
    return finish({
      retried: false,
      reason: 'retry-rate-limited',
      classification,
    });

  if (!SHA.test(key.baseSha ?? ''))
    return finish({
      retried: false,
      reason: 'missing-base-sha',
      classification,
    });

  if (!writeToken)
    return finish({
      retried: false,
      reason: 'missing-write-token',
      classification,
    });

  const rerun = await request(
    `/repos/${repo}/actions/runs/${run.id}/rerun-failed-jobs`,
    { token: writeToken, method: 'POST' }
  );
  if (rerun.status === 409)
    return finish({
      retried: false,
      reason: 'rerun-already-in-flight',
      classification,
    });
  if (!rerun.ok) throw new Error(`rerun-failed-jobs failed (${rerun.status})`);

  const next = collector.recordRetry(ledger, key, { now });
  writeFile(ledgerPath, `${JSON.stringify(next.ledger ?? next, null, 2)}\n`);
  return finish({
    retried: true,
    reason: 'infra-retry-requested',
    classification,
  });
}

export function main(argv = process.argv.slice(2), dependencies = {}) {
  const mode = argv[0];
  if (mode === 'build-run-file') return buildRunFile({}, dependencies);
  if (mode === 'maybe-retry') return maybeRetry({}, dependencies);
  throw new Error(`Unsupported mode ${JSON.stringify(mode)}`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  Promise.resolve(main())
    .then(result => {
      if (result && !process.env.GITHUB_OUTPUT)
        console.log(JSON.stringify(result.record ?? result));
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
