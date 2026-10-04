#!/usr/bin/env node

/**
 * Test Flakiness Analyzer
 *
 * Analyzes Playwright test results from CI runs to identify flaky tests.
 * Tracks failure rates, retry rates, and generates actionable reports.
 *
 * Usage:
 *   node analyze-test-flakiness.js <github-token> <owner> <repo>
 *
 * Environment:
 *   - GITHUB_TOKEN: GitHub API token (or passed as arg)
 *   - GITHUB_REPOSITORY: owner/repo (or passed as args)
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const ANALYSIS_LIMIT = 30; // Number of recent workflow runs to analyze
const MAIN_BRANCH = 'main'; // Only main-branch runs — PR failures are deterministic, not flaky
const ARTIFACT_RUN_LIMIT = 12; // Max main runs to scan JUnit artifacts from
const MERGE_GROUP_ARTIFACT_LIMIT = 12; // Max merge_group runs to scan (queue-only flakes)
const QUARANTINE_WINDOW_HOURS = 24; // Rolling window for quarantine candidacy
const QUARANTINE_MIN_OCCURRENCES = 3; // Flakes in window -> quarantine candidate
const FLAKY_FAILURE_THRESHOLD = 5; // % failure rate to flag as flaky
const FLAKY_RETRY_THRESHOLD = 10; // % retry rate to flag as flaky
const HIGH_FLAKINESS_THRESHOLD = 5; // Number of flaky tests to trigger alert
const HIGH_RETRY_RATE_THRESHOLD = 20; // % of runs with retries to trigger alert
// Unit Tests shards upload Vitest retried-then-passed tests under this prefix
// (scripts/lib/vitest-retry-reporter.mjs). Vitest's in-process --retry keeps
// the step green, so step conclusions alone can never reveal these flakes.
const UNIT_FLAKY_ARTIFACT_PATTERN = 'unit-flaky-*';
const UNIT_FLAKY_REPORT_SUFFIX = '.flaky.json';

/**
 * Make GitHub API request
 */
function githubRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Jovie-Test-Flakiness-Analyzer',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };

    https
      .get(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Build the GitHub API path for completed workflow runs on a single branch.
 * Restricting to main avoids counting PR-branch test failures as flakiness.
 */
function buildWorkflowRunsApiPath(
  owner,
  repo,
  { limit = ANALYSIS_LIMIT, branch = MAIN_BRANCH } = {}
) {
  const params = new URLSearchParams({
    per_page: String(limit),
    status: 'completed',
    branch,
  });
  return `/repos/${owner}/${repo}/actions/workflows/ci.yml/runs?${params}`;
}

/**
 * Fetch workflow runs
 */
async function fetchWorkflowRuns(token, owner, repo) {
  console.log(
    `Fetching last ${ANALYSIS_LIMIT} completed ${MAIN_BRANCH}-branch CI runs...`
  );
  const data = await githubRequest(
    buildWorkflowRunsApiPath(owner, repo),
    token
  );
  return data.workflow_runs;
}

/**
 * Fetch jobs for a workflow run
 */
async function fetchRunJobs(token, owner, repo, runId) {
  const data = await githubRequest(
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
    token
  );
  return data.jobs;
}

/**
 * Fetch artifacts for a workflow run. Errors propagate so a failed read is
 * never cached as "no artifacts".
 */
async function fetchRunArtifacts(token, owner, repo, runId) {
  const data = await githubRequest(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`,
    token
  );
  return data.artifacts || [];
}

/**
 * Completed-run evidence is immutable per (run id, attempt). Every CI,
 * changed-evidence, and E2E completion on main wakes this report, and an
 * uncached wake re-reads ~30 runs' jobs and artifacts from the repository's
 * shared 1,000/h GITHUB_TOKEN quota (JOV-7744). With FLAKY_RUN_CACHE_DIR
 * restored between wakes, only runs not seen before cost API calls. Only
 * successful loads are stored; a failed read stays uncached.
 */
function createRunEvidenceCache(dir) {
  return async function runEvidence(kind, run, load) {
    const attempt = run?.run_attempt;
    if (
      !dir ||
      !Number.isSafeInteger(run?.id) ||
      !Number.isSafeInteger(attempt)
    ) {
      return load();
    }
    const file = path.join(dir, `${kind}-${run.id}-${attempt}.json`);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    const value = await load();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  };
}

let runEvidence = createRunEvidenceCache(process.env.FLAKY_RUN_CACHE_DIR);

const RUN_EVIDENCE_CACHE_KEEP = 400; // ~13 report windows of runs

/**
 * Keep the newest entries by run id and return a content digest, so the
 * workflow saves a new cache entry only when the evidence changed.
 */
function boundRunEvidenceCache(dir, keep = RUN_EVIDENCE_CACHE_KEEP) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  } catch {
    return null;
  }
  const runId = name => Number(name.split('-')[1]) || 0;
  names.sort((a, b) => runId(b) - runId(a) || a.localeCompare(b));
  for (const name of names.slice(keep)) fs.rmSync(path.join(dir, name));
  const hash = crypto.createHash('sha256');
  for (const name of names.slice(0, keep).sort()) {
    hash.update(name).update(fs.readFileSync(path.join(dir, name)));
  }
  return hash.digest('hex').slice(0, 16);
}

/** Test seam: route run evidence through a cache rooted at dir. */
function setRunEvidenceCacheDir(dir) {
  runEvidence = createRunEvidenceCache(dir);
}

/**
 * Fetch recent merge_group runs — queue-only flakes (green on PR head, red in
 * the queue) only appear here.
 */
async function fetchMergeGroupRuns(token, owner, repo) {
  const params = new URLSearchParams({
    per_page: String(MERGE_GROUP_ARTIFACT_LIMIT),
    status: 'completed',
    event: 'merge_group',
  });
  const data = await githubRequest(
    `/repos/${owner}/${repo}/actions/workflows/ci.yml/runs?${params}`,
    token
  );
  return data.workflow_runs || [];
}

/**
 * Normalize failure text into a stable signature input.
 * Strips timestamps, durations, UUIDs, ports, shard ids, hex blobs, and
 * absolute paths so the same root cause across shards/runs hashes identically.
 */
function normalizeFailureText(text) {
  return String(text || '')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[\d.:Z+-]*/g, '<ts>')
    .replace(/\b\d+(\.\d+)?\s*(ms|s|min)\b/gi, '<dur>')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<uuid>'
    )
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\b\d{4,5}\b/g, '<port>')
    .replace(/\(\d+\/\d+\)/g, '(<shard>)')
    .replace(
      /(?:[A-Za-z]:)?[\w./-]*?(?:\.run|\.work|runner|home|Users)\/[\w./-]+/g,
      '<path>'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Signature hash for a single test failure: normalized test id + normalized
 * error text. Same root cause on 10 shards -> one signature.
 */
function failureSignature(testId, errorText) {
  const input = `${normalizeFailureText(testId)}::${normalizeFailureText(errorText).slice(0, 500)}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function decodeXml(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function xmlAttr(tag, attr) {
  const match = tag.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

/**
 * Parse JUnit XML into failure/flaky-retry records.
 * `flakyFailure` elements mean the test failed then passed on retry within one
 * run — the strongest flake signal (vitest/Playwright retries).
 */
function parseJunitXml(xml) {
  const records = [];
  const testcaseRegex = /<testcase\b[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = testcaseRegex.exec(xml)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const body = m[1] || '';
    const name = xmlAttr(openTag, 'name');
    const file = xmlAttr(openTag, 'file') || xmlAttr(openTag, 'classname');
    const testId = `${file}::${name}`;

    const terminal = body.match(
      /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/
    );
    if (terminal) {
      records.push({
        testId,
        file,
        name,
        kind: 'failure',
        error: decodeXml(terminal[1]).slice(0, 2000),
      });
      continue;
    }

    const flakyRegex = /<flakyFailure\b[^>]*>([\s\S]*?)<\/flakyFailure>/g;
    let f;
    let sawFlaky = false;
    while ((f = flakyRegex.exec(body)) !== null) {
      sawFlaky = true;
      const error = decodeXml(f[1]).slice(0, 2000);
      records.push({ testId, file, name, kind: 'flaky-retry', error });
    }

    if (!sawFlaky) {
      const failMatch = body.match(
        /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/
      );
      if (failMatch) {
        const error = decodeXml(failMatch[1]).slice(0, 2000);
        records.push({ testId, file, name, kind: 'failure', error });
      }
    }
  }
  return records;
}

/**
 * Download and parse JUnit artifacts for a run, returning failure records
 * annotated with run metadata.
 */
async function collectRunFailureRecords(token, owner, repo, run) {
  const artifacts = await runEvidence('artifacts', run, () =>
    fetchRunArtifacts(token, owner, repo, run.id)
  );
  const junitArtifacts = artifacts.filter(
    a =>
      !a.expired && /unit-test|test-report|junit|playwright/i.test(a.name || '')
  );
  if (junitArtifacts.length === 0) return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flake-junit-'));
  const records = [];
  try {
    for (const artifact of junitArtifacts) {
      if (!Number.isSafeInteger(artifact.id) || artifact.id < 1)
        throw new Error('Invalid artifact identifier');
      const artifactDir = path.join(tmpDir, String(artifact.id));
      fs.mkdirSync(artifactDir);
      const zipPath = path.join(artifactDir, 'report.zip');
      fs.writeFileSync(
        zipPath,
        execFileSync(
          'gh',
          [
            'api',
            `repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`,
          ],
          { timeout: 60000, maxBuffer: 32 * 1024 * 1024 }
        )
      );
      execFileSync('unzip', ['-o', '-q', '-j', zipPath, '-d', artifactDir], {
        timeout: 10000,
      });
      for (const file of fs
        .readdirSync(artifactDir)
        .filter(f => f.endsWith('.xml'))) {
        const xml = fs.readFileSync(path.join(artifactDir, file), 'utf8');
        for (const rec of parseJunitXml(xml)) {
          records.push({
            ...rec,
            artifactFile: file,
            artifactId: artifact.id,
            artifactShard:
              file.match(/test-report\.([\d-]+)\.junit/)?.[1] || null,
            runId: run.id,
            runAttempt: run.run_attempt,
            runUrl: run.html_url,
            runEvent: run.event,
            runAt: run.created_at,
          });
        }
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return records;
}

/**
 * Cluster failure records by signature hash across shards, runs, and events.
 * A js-yaml-style failure across 10 shards reads as ONE incident.
 */
function clusterFailureRecords(records) {
  const clusters = new Map();
  const now = Date.now();
  const windowStart = now - QUARANTINE_WINDOW_HOURS * 3600 * 1000;

  for (const rec of records) {
    const sig = failureSignature(rec.testId, rec.error);
    if (!clusters.has(sig)) {
      clusters.set(sig, {
        signature: sig,
        testId: rec.testId,
        file: rec.file,
        occurrences: 0,
        occurrences24h: 0,
        flakyRetries: 0,
        flakyRunAttempts24h: new Set(),
        shards: new Set(),
        firstSeenAt: rec.runAt,
        lastSeenAt: rec.runAt,
        runUrls: new Set(),
        events: new Set(),
        mergeGroupOnly: true, // cleared when seen on a non-merge_group run
        errorExcerpt: rec.error.split('\n').slice(0, 3).join(' ').slice(0, 300),
      });
    }
    const c = clusters.get(sig);
    c.occurrences++;
    if (rec.kind === 'flaky-retry') c.flakyRetries++;
    const at = new Date(rec.runAt).getTime();
    if (at >= windowStart && at <= now) {
      c.occurrences24h++;
      if (
        rec.kind === 'flaky-retry' &&
        Number.isSafeInteger(rec.runId) &&
        rec.runId > 0 &&
        Number.isSafeInteger(rec.runAttempt) &&
        rec.runAttempt > 0
      ) {
        c.flakyRunAttempts24h.add(`${rec.runId}:${rec.runAttempt}`);
      }
    }
    if (rec.artifactShard) c.shards.add(rec.artifactShard);
    if (rec.runAt < c.firstSeenAt) c.firstSeenAt = rec.runAt;
    if (rec.runAt > c.lastSeenAt) c.lastSeenAt = rec.runAt;
    if (c.runUrls.size < 10) c.runUrls.add(rec.runUrl);
    c.events.add(rec.runEvent);
    if (rec.runEvent !== 'merge_group') c.mergeGroupOnly = false;
  }

  return [...clusters.values()]
    .map(c => ({
      ...c,
      shards: [...c.shards],
      runUrls: [...c.runUrls],
      events: [...c.events],
      flakyRunAttempts24h: c.flakyRunAttempts24h.size,
      quarantineCandidate:
        c.flakyRunAttempts24h.size >= QUARANTINE_MIN_OCCURRENCES,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Signature-clustered failure analysis: scans JUnit artifacts from recent main
 * runs AND merge_group runs so queue-only flakes are visible.
 */
async function analyzeFailureSignatures(token, owner, repo, mainRuns) {
  let mergeGroupRuns = [];
  try {
    mergeGroupRuns = await fetchMergeGroupRuns(token, owner, repo);
  } catch (error) {
    console.warn(`Could not fetch merge_group runs: ${error.message}`);
  }

  const candidates = [
    ...mainRuns.slice(0, ARTIFACT_RUN_LIMIT),
    ...mergeGroupRuns,
  ];
  const allRecords = [];

  for (const run of candidates) {
    try {
      const records = await runEvidence('junit', run, () =>
        collectRunFailureRecords(token, owner, repo, run)
      );
      allRecords.push(...records);
    } catch (error) {
      console.warn(`Run ${run.id}: ${error.message}`);
    }
  }

  return clusterFailureRecords(allRecords);
}

/**
 * Parse test name from job step
 * Currently unused but kept for future granular test name parsing
 */
function _parseTestName(stepName) {
  // Extract test file name from step output
  // Example: "tests/e2e/profile.spec.ts:42:5 › should render profile"
  const match = stepName.match(/tests\/e2e\/([^:]+\.spec\.ts)/);
  return match ? match[1] : stepName;
}

/**
 * Filter workflow jobs down to test-relevant lanes.
 */
function filterTestJobs(jobs) {
  return jobs.filter(
    job =>
      job.name.includes('E2E') ||
      job.name.includes('Smoke') ||
      job.name.includes('Unit')
  );
}

/**
 * Collect normalized test-step executions from a workflow run's jobs.
 */
function collectRunExecutions(jobs) {
  const executions = [];

  for (const job of filterTestJobs(jobs)) {
    executions.push(...extractTestExecutions(job));
  }

  return executions;
}

/**
 * Record attempt-1 outcomes per commit so later workflow retries only count
 * when the same step failed on the first attempt.
 */
function buildAttemptOneOutcomes(runsWithJobs) {
  const outcomesBySha = new Map();

  for (const { run, jobs } of runsWithJobs) {
    if (run.run_attempt !== 1) continue;

    const stepOutcomes = new Map();
    for (const execution of collectRunExecutions(jobs)) {
      stepOutcomes.set(execution.name, execution.conclusion);
    }

    outcomesBySha.set(run.head_sha, stepOutcomes);
  }

  return outcomesBySha;
}

/**
 * Count a retry only when a workflow re-run recovered a step that failed on
 * attempt 1. Unrelated workflow retries should not inflate stable steps.
 */
function shouldCountAsRetry({ attemptOneConclusion, runAttempt, conclusion }) {
  return (
    runAttempt > 1 &&
    conclusion === 'success' &&
    attemptOneConclusion === 'failure'
  );
}

/**
 * Analyze workflow runs for test flakiness
 */
async function analyzeFlakiness(token, owner, repo) {
  const runs = await fetchWorkflowRuns(token, owner, repo);
  console.log(`Analyzing ${runs.length} workflow runs...`);

  const runsWithJobs = [];
  for (const run of runs) {
    const jobs = await runEvidence('jobs', run, () =>
      fetchRunJobs(token, owner, repo, run.id)
    );
    runsWithJobs.push({ run, jobs });
  }

  const attemptOneOutcomes = buildAttemptOneOutcomes(runsWithJobs);
  const testStats = new Map(); // testName -> { failures, successes, retries, runs }
  let totalRuns = 0;
  let runsWithRetries = 0;
  let runsWithFailures = 0;

  for (const { run, jobs } of runsWithJobs) {
    totalRuns++;
    const runHadRetry = run.run_attempt > 1;
    let runHadFailure = false;
    const firstAttemptOutcomes =
      attemptOneOutcomes.get(run.head_sha) ?? new Map();

    for (const execution of collectRunExecutions(jobs)) {
      if (!testStats.has(execution.name)) {
        testStats.set(execution.name, {
          failures: 0,
          successes: 0,
          retries: 0,
          runs: 0,
          lastFailure: null,
        });
      }

      const stats = testStats.get(execution.name);
      stats.runs++;

      if (execution.conclusion === 'failure') {
        stats.failures++;
        stats.lastFailure = run.created_at;
        runHadFailure = true;
      } else if (execution.conclusion === 'success') {
        stats.successes++;
        if (
          shouldCountAsRetry({
            attemptOneConclusion: firstAttemptOutcomes.get(execution.name),
            runAttempt: run.run_attempt,
            conclusion: execution.conclusion,
          })
        ) {
          stats.retries++;
        }
      }
    }

    if (runHadRetry) runsWithRetries++;
    if (runHadFailure) runsWithFailures++;
  }

  const unitStats = collectUnitRetryFlakes(
    await runsWithUnitFlakeArtifacts(token, owner, repo, runs),
    `${owner}/${repo}`
  );

  return {
    testStats,
    unitStats,
    totalRuns,
    runsWithRetries,
    runsWithFailures,
    runs,
  };
}

/**
 * Extract concrete test executions from a workflow job.
 *
 * Unit test jobs can fail for non-test reasons (dependency install, environment setup,
 * runner drift), which creates noisy "Unit Tests" flakiness reports. When a Unit Tests
 * job has NO test steps that actually ran (e.g. setup failed before the test step was
 * created), we skip it entirely — it was an infra failure, not a flaky test.
 *
 * Prefer explicit test run steps when available; only fall back to job-level status
 * for non-Unit-Tests jobs that have no test steps defined.
 */
function extractTestExecutions(job) {
  const runStepRegex = /^run .*tests?/i;
  const normalizedJobName = normalizeJobName(job.name || '');

  // First, check if any test steps exist at all (regardless of conclusion)
  const allTestSteps = (job.steps || []).filter(step =>
    runStepRegex.test(step.name || '')
  );

  // If test steps exist, only report those that actually completed (success/failure).
  // Skipped/cancelled test steps mean the job failed before tests ran (e.g. setup failure)
  // — do NOT fall back to job-level conclusion in that case.
  if (allTestSteps.length > 0) {
    const completedSteps = allTestSteps.filter(step =>
      ['success', 'failure'].includes(step.conclusion)
    );

    return completedSteps.map(step => ({
      name: `${normalizedJobName} › ${step.name}`,
      conclusion: step.conclusion,
    }));
  }

  // Unit Tests jobs with no test steps at all: the failure was in setup/infra
  // (runner drift, dependency install, etc.), NOT in the tests themselves.
  // Do not count these as test flakiness.
  if (normalizedJobName === 'Unit Tests') {
    return [];
  }

  // Fall back to job-level conclusion for non-Unit-Tests jobs
  if (['success', 'failure'].includes(job.conclusion)) {
    return [{ name: normalizedJobName, conclusion: job.conclusion }];
  }

  return [];
}

/**
 * Normalize CI matrix job names so shard variants are grouped together.
 * Example: "Unit Tests (1/3)" -> "Unit Tests". The unsharded "packages/ui"
 * unit matrix entry groups with its shards too, so its step history stays
 * "Unit Tests › Run packages/ui unit tests".
 */
function normalizeJobName(name) {
  return name.replace(/\s*\((?:\d+\/\d+|packages\/ui)\)$/, '');
}

/**
 * Download a run's retried-then-passed unit-test reports with the gh CLI.
 * Missing artifacts (older runs, no Unit Tests job) are not an error.
 */
function downloadUnitFlakeArtifacts(
  runId,
  repository,
  destDir,
  exec = execFileSync
) {
  try {
    exec(
      'gh',
      [
        'run',
        'download',
        String(runId),
        '--repo',
        repository,
        '--pattern',
        UNIT_FLAKY_ARTIFACT_PATTERN,
        '--dir',
        destDir,
      ],
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read every *.flaky.json under dir and return its flaky entries.
 */
function readUnitFlakeReports(dir) {
  const entries = [];
  let files = [];
  try {
    files = fs.readdirSync(dir, { recursive: true });
  } catch {
    return entries;
  }
  for (const relative of files) {
    const file = String(relative);
    if (!file.endsWith(UNIT_FLAKY_REPORT_SUFFIX)) continue;
    try {
      const report = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const entry of Array.isArray(report.flaky) ? report.flaky : []) {
        if (entry && typeof entry.name === 'string') {
          entries.push({
            file: String(entry.file ?? ''),
            name: entry.name,
            retryCount: Number(entry.retryCount) || 1,
          });
        }
      }
    } catch (error) {
      console.warn(`Could not parse ${file}: ${error.message}`);
    }
  }
  return entries;
}

/**
 * Fold per-run flaky entries into per-test stats.
 * @param {Array<{ runId: number|string, entries: Array<{file: string, name: string, retryCount: number}> }>} runs
 */
function aggregateUnitFlakes(runs) {
  const stats = new Map();
  for (const { runId, entries } of runs) {
    for (const entry of entries) {
      const key = `Unit › ${entry.file} › ${entry.name}`;
      const current = stats.get(key) ?? { runIds: new Set(), retries: 0 };
      current.runIds.add(String(runId));
      current.retries += entry.retryCount;
      stats.set(key, current);
    }
  }
  return stats;
}

/**
 * Every unit test that failed and then passed on retry against the same code
 * is flaky by definition, so each one is reported (no rate threshold).
 */
function calculateUnitRetryFlakes(unitStats, runsAnalyzed) {
  const flakyTests = [];
  for (const [name, stats] of unitStats.entries()) {
    const runs = stats.runIds.size;
    const retryRate = runsAnalyzed > 0 ? (runs / runsAnalyzed) * 100 : 100;
    const flakinessScore = retryRate * 0.3;
    flakyTests.push({
      name,
      failureRate: '0.0',
      retryRate: retryRate.toFixed(1),
      flakinessScore: flakinessScore.toFixed(1),
      failures: 0,
      successes: runs,
      retries: stats.retries,
      runs,
      lastFailure: null,
      severity:
        flakinessScore > 30 ? 'high' : flakinessScore > 15 ? 'medium' : 'low',
    });
  }
  return flakyTests;
}

/**
 * Skip `gh run download` (one or more API calls per run) for runs whose
 * cached artifact list proves they uploaded no unit-flaky-* report. A run
 * whose list cannot be read is still downloaded, as before.
 */
async function runsWithUnitFlakeArtifacts(token, owner, repo, runs) {
  const prefix = UNIT_FLAKY_ARTIFACT_PATTERN.replace(/\*$/, '');
  const selected = [];
  for (const run of runs) {
    try {
      const artifacts = await runEvidence('artifacts', run, () =>
        fetchRunArtifacts(token, owner, repo, run.id)
      );
      if (artifacts.some(a => !a.expired && a.name?.startsWith(prefix))) {
        selected.push(run);
      }
    } catch (error) {
      console.warn(
        `Could not list artifacts for run ${run.id}: ${error.message}`
      );
      selected.push(run);
    }
  }
  return selected;
}

/**
 * Collect retried-then-passed unit tests from the analyzed runs' artifacts.
 * @param {Array<{ id: number|string }>} runs
 * @param {string} repository
 * @param {{ download?: (runId: number|string, repository: string, destDir: string) => boolean, rootDir?: string }} [options]
 */
function collectUnitRetryFlakes(
  runs,
  repository,
  { download = downloadUnitFlakeArtifacts, rootDir } = {}
) {
  const baseDir =
    rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'unit-flaky-'));
  const perRun = [];
  for (const run of runs) {
    const dir = path.join(baseDir, String(run.id));
    download(run.id, repository, dir);
    perRun.push({ runId: run.id, entries: readUnitFlakeReports(dir) });
  }
  return aggregateUnitFlakes(perRun);
}

/**
 * Calculate flakiness metrics
 */
function calculateMetrics(testStats) {
  const flakyTests = [];

  for (const [testName, stats] of testStats.entries()) {
    const totalAttempts = stats.failures + stats.successes;
    if (totalAttempts === 0) continue;

    const failureRate = (stats.failures / totalAttempts) * 100;
    const retryRate =
      stats.successes > 0 ? (stats.retries / stats.successes) * 100 : 0;

    // Calculate flakiness score (weighted average)
    const flakinessScore = failureRate * 0.7 + retryRate * 0.3;

    // Flag as flaky if exceeds thresholds
    if (
      failureRate > FLAKY_FAILURE_THRESHOLD ||
      retryRate > FLAKY_RETRY_THRESHOLD
    ) {
      flakyTests.push({
        name: testName,
        failureRate: failureRate.toFixed(1),
        retryRate: retryRate.toFixed(1),
        flakinessScore: flakinessScore.toFixed(1),
        failures: stats.failures,
        successes: stats.successes,
        retries: stats.retries,
        runs: stats.runs,
        lastFailure: stats.lastFailure,
        severity:
          flakinessScore > 30 ? 'high' : flakinessScore > 15 ? 'medium' : 'low',
      });
    }
  }

  // Sort by flakiness score descending
  flakyTests.sort(
    (a, b) => parseFloat(b.flakinessScore) - parseFloat(a.flakinessScore)
  );

  return flakyTests;
}

/**
 * Generate markdown report
 */
function generateReport(
  flakyTests,
  totalRuns,
  runsWithRetries,
  runsWithFailures,
  clusters = []
) {
  const reportDate = new Date().toISOString().split('T')[0];
  const retryRate = ((runsWithRetries / totalRuns) * 100).toFixed(1);
  const failureRate = ((runsWithFailures / totalRuns) * 100).toFixed(1);

  let report = `# 📊 Test Flakiness Report - ${reportDate}\n\n`;

  // Summary section
  report += `## Summary\n\n`;
  report += `- **Analysis Period**: Last ${totalRuns} \`${MAIN_BRANCH}\` branch CI runs\n`;
  report += `- **Runs with Retries**: ${runsWithRetries} (${retryRate}%)\n`;
  report += `- **Runs with Failures**: ${runsWithFailures} (${failureRate}%)\n`;
  report += `- **Flaky Tests Detected**: ${flakyTests.length}\n\n`;

  // Health indicator
  if (flakyTests.length === 0 && parseFloat(retryRate) < 5) {
    report += `### ✅ Test Suite Health: Excellent\n\n`;
    report += `All tests are stable with minimal retries!\n\n`;
  } else if (flakyTests.length < 3 && parseFloat(retryRate) < 10) {
    report += `### 🟡 Test Suite Health: Good\n\n`;
    report += `Minor flakiness detected. Monitor and address if it worsens.\n\n`;
  } else if (flakyTests.length < HIGH_FLAKINESS_THRESHOLD) {
    report += `### 🟠 Test Suite Health: Fair\n\n`;
    report += `Moderate flakiness detected. Action recommended.\n\n`;
  } else {
    report += `### 🔴 Test Suite Health: Poor\n\n`;
    report += `Significant flakiness detected. Immediate action required!\n\n`;
  }

  // Signature-clustered incidents: one row per root cause, not per shard.
  if (clusters.length > 0) {
    report += `## Failure Signature Clusters (${clusters.length})\n\n`;
    report += `Failures are fingerprinted by normalized test id + normalized error text (timestamps, durations, UUIDs, ports, shard ids stripped). The same root cause across shards, runs, and events collapses into one incident.\n\n`;
    report += `| Signature | 24h / total | Flaky retries | Shards | Queue-only | Test | First seen | Last seen | Example runs |\n`;
    report += `|-----------|-------------|---------------|--------|------------|------|------------|-----------|--------------|\n`;
    for (const c of clusters) {
      const mark = c.quarantineCandidate ? ' 🚧' : '';
      const runs = c.runUrls
        .slice(0, 3)
        .map(u => `[run](${u})`)
        .join(', ');
      const shardCount = c.shards.length > 0 ? c.shards.length : '-';
      report += `| \`${c.signature}\`${mark} | ${c.occurrences24h} / ${c.occurrences} | ${c.flakyRetries} | ${shardCount} | ${c.mergeGroupOnly ? 'yes' : 'no'} | \`${c.testId}\` | ${c.firstSeenAt.split('T')[0]} | ${c.lastSeenAt.split('T')[0]} | ${runs} |\n`;
    }
    report += `\n🚧 = quarantine candidate (successful retry evidence in ≥${QUARANTINE_MIN_OCCURRENCES} distinct run attempts in ${QUARANTINE_WINDOW_HOURS}h). "Queue-only" means the signature has only been seen on merge_group runs.\n\n`;
  }

  // Flaky tests table
  if (flakyTests.length > 0) {
    report += `## Flaky Tests (${flakyTests.length})\n\n`;
    report += `Tests exceeding thresholds (>${FLAKY_FAILURE_THRESHOLD}% failure rate OR >${FLAKY_RETRY_THRESHOLD}% retry rate), plus every unit test that failed then passed on Vitest retry (\`Unit › …\`):\n\n`;
    report += `| Severity | Test Name | Failure Rate | Retry Rate | Score | Failures | Successes | Retries |\n`;
    report += `|----------|-----------|-------------|-----------|-------|----------|-----------|--------|\n`;

    for (const test of flakyTests) {
      const severityEmoji =
        test.severity === 'high'
          ? '🔴'
          : test.severity === 'medium'
            ? '🟡'
            : '🟢';
      report += `| ${severityEmoji} ${test.severity} | \`${test.name}\` | ${test.failureRate}% | ${test.retryRate}% | ${test.flakinessScore} | ${test.failures} | ${test.successes} | ${test.retries} |\n`;
    }

    report += `\n**Flakiness Score**: Weighted metric combining failure rate (70%) and retry rate (30%)\n\n`;

    // Severity breakdown
    const high = flakyTests.filter(t => t.severity === 'high').length;
    const medium = flakyTests.filter(t => t.severity === 'medium').length;
    const low = flakyTests.filter(t => t.severity === 'low').length;

    if (high > 0 || medium > 0) {
      report += `### 🚨 Priority Actions\n\n`;
      if (high > 0) {
        report += `**🔴 High Severity (${high} tests)**: Immediate investigation required\n`;
        report += `- Add to quarantine.json if blocking releases\n`;
        report += `- Root cause analysis in next sprint\n\n`;
      }
      if (medium > 0) {
        report += `**🟡 Medium Severity (${medium} tests)**: Address in upcoming sprint\n`;
        report += `- Monitor for worsening trends\n`;
        report += `- Consider adding stabilization work to backlog\n\n`;
      }
      if (low > 0) {
        report += `**🟢 Low Severity (${low} tests)**: Monitor only\n\n`;
      }
    }

    // Recommendations
    report += `## Recommended Actions\n\n`;
    report += `1. **Investigate Root Causes**\n`;
    report += `   - Review test logs for high-severity flaky tests\n`;
    report += `   - Check for timing issues, race conditions, or environment dependencies\n\n`;

    report += `2. **Quarantine High-Severity Tests**\n`;
    report += `   - Add tests with >20% failure rate to \`apps/web/quarantine.json\`\n`;
    report += `   - Document reason and target fix date\n\n`;

    report += `3. **Stabilize or Remove**\n`;
    report += `   - Fix flaky tests by improving test isolation and determinism\n`;
    report += `   - Delete tests that provide minimal value or cannot be stabilized\n\n`;

    report += `4. **Monitor Trends**\n`;
    report += `   - Re-run this report weekly to track improvements\n`;
    report += `   - Set up alerts for flakiness score > 30\n\n`;
  }

  // Thresholds and metadata
  report += `---\n\n`;
  report += `**Thresholds**:\n`;
  report += `- Failure rate: >${FLAKY_FAILURE_THRESHOLD}%\n`;
  report += `- Retry rate: >${FLAKY_RETRY_THRESHOLD}%\n`;
  report += `- High severity: Score >30\n`;
  report += `- Medium severity: Score >15\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Workflow**: [Test Flakiness Report](https://github.com/${process.env.GITHUB_REPOSITORY}/actions/workflows/test-flakiness-report.yml)\n`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Parse arguments
    const token = process.argv[2] || process.env.GITHUB_TOKEN;
    const repository = process.argv[3] || process.env.GITHUB_REPOSITORY;

    if (!token) {
      throw new Error(
        'GitHub token required (pass as arg or GITHUB_TOKEN env)'
      );
    }

    if (!repository) {
      throw new Error(
        'Repository required (pass as arg or GITHUB_REPOSITORY env)'
      );
    }

    const [owner, repo] = repository.split('/');

    // Analyze flakiness
    const {
      testStats,
      unitStats,
      totalRuns,
      runsWithRetries,
      runsWithFailures,
      runs,
    } = await analyzeFlakiness(token, owner, repo);

    const flakyTests = [
      ...calculateMetrics(testStats),
      ...calculateUnitRetryFlakes(unitStats, totalRuns),
    ].sort(
      (a, b) => parseFloat(b.flakinessScore) - parseFloat(a.flakinessScore)
    );
    // Signature-clustered failure analysis from JUnit artifacts on main and
    // merge_group runs. Bounded by ARTIFACT_RUN_LIMIT/MERGE_GROUP_ARTIFACT_LIMIT.
    let clusters = [];
    try {
      clusters = await analyzeFailureSignatures(token, owner, repo, runs);
    } catch (error) {
      console.warn(`Signature analysis skipped: ${error.message}`);
    }

    const report = generateReport(
      flakyTests,
      totalRuns,
      runsWithRetries,
      runsWithFailures,
      clusters
    );

    // Write report to file
    const reportPath = path.join(process.cwd(), 'flakiness-report.md');
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Report generated: ${reportPath}`);

    // Write clustered failure signatures for the quarantine/filing steps
    const clustersPath = path.join(process.cwd(), 'flakiness-clusters.json');
    fs.writeFileSync(
      clustersPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          repository: `${owner}/${repo}`,
          headSha: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          generatedAt: new Date().toISOString(),
          clusters,
        },
        null,
        2
      )
    );
    console.log(
      `✅ Clusters written: ${clustersPath} (${clusters.length} signatures)`
    );

    // Output metrics for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const highSeverity = flakyTests.filter(t => t.severity === 'high');
      const candidates = highSeverity.map(t => ({
        name: t.name,
        failureRate: t.failureRate,
        flakinessScore: t.flakinessScore,
      }));
      const output = [
        `flaky_count=${flakyTests.length}`,
        `total_runs=${totalRuns}`,
        `retry_rate=${((runsWithRetries / totalRuns) * 100).toFixed(1)}`,
        `high_severity=${highSeverity.length}`,
        `quarantine_candidates=${JSON.stringify(candidates)}`,
        `cluster_count=${clusters.length}`,
        `signature_quarantine_candidates=${clusters.filter(c => c.quarantineCandidate).length}`,
      ];
      const evidenceDigest = process.env.FLAKY_RUN_CACHE_DIR
        ? boundRunEvidenceCache(process.env.FLAKY_RUN_CACHE_DIR)
        : null;
      // Written before the high-flakiness exit so a red report still saves
      // the evidence it already paid for.
      if (evidenceDigest) {
        output.push(`run_evidence_key=flaky-run-evidence-${evidenceDigest}`);
      }
      fs.appendFileSync(process.env.GITHUB_OUTPUT, output.join('\n') + '\n');
    }

    // Exit with error if high flakiness detected
    if (
      flakyTests.length > HIGH_FLAKINESS_THRESHOLD ||
      (runsWithRetries / totalRuns) * 100 > HIGH_RETRY_RATE_THRESHOLD
    ) {
      console.error(
        `\n🔴 HIGH FLAKINESS DETECTED: ${flakyTests.length} flaky tests`
      );
      process.exit(1);
    }

    console.log(`\n📊 Flakiness Summary:`);
    console.log(`   Total runs: ${totalRuns}`);
    console.log(`   Flaky tests: ${flakyTests.length}`);
    console.log(
      `   Retry rate: ${((runsWithRetries / totalRuns) * 100).toFixed(1)}%`
    );
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  aggregateUnitFlakes,
  analyzeFlakiness,
  calculateUnitRetryFlakes,
  collectUnitRetryFlakes,
  downloadUnitFlakeArtifacts,
  readUnitFlakeReports,
  buildAttemptOneOutcomes,
  buildWorkflowRunsApiPath,
  calculateMetrics,
  collectRunExecutions,
  extractTestExecutions,
  MAIN_BRANCH,
  normalizeJobName,
  generateReport,
  shouldCountAsRetry,
  FLAKY_FAILURE_THRESHOLD,
  FLAKY_RETRY_THRESHOLD,
  normalizeFailureText,
  failureSignature,
  parseJunitXml,
  clusterFailureRecords,
  analyzeFailureSignatures,
  runsWithUnitFlakeArtifacts,
  boundRunEvidenceCache,
  setRunEvidenceCacheDir,
  QUARANTINE_MIN_OCCURRENCES,
};
