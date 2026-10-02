#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const PAXEL_UPLOAD_URL = 'https://paxel.ycombinator.com/upload.sh';
export const PAXEL_UPLOAD_SHA256 =
  'a930885e3119fa2f29e6c29526ba35280e991b2ecfbdeb51f48d9af8a14042ef';
export const IS_AGENTIC_TARGETS = ['jov.ie', 'logyourbody.com'];
export const MAX_MEASUREMENT_AGE_DAYS = 8;

const PAXEL_SCORE_KEYS = [
  'throughput',
  'steering',
  'eng_quality',
  'product_thinking',
  'planning',
];
const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function parseTimestamp(value, name) {
  const timestamp = Date.parse(requiredText(value, name));
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${name} must be an ISO-8601 timestamp`);
  }
  return timestamp;
}

function normalizedTarget(value) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError(`invalid Is Agentic target: ${value}`);
  }
  return url.hostname.toLowerCase();
}

function isFailedResult(value) {
  return value === 'fail' || value === 'failed';
}

export function parsePaxelProfile(raw, name = 'Paxel profile') {
  if (!isRecord(raw) || !isRecord(raw.scores)) {
    throw new TypeError(`${name} must contain a scores object`);
  }
  const measuredAt = parseTimestamp(raw.measured_at, `${name}.measured_at`);
  const scores = {};
  for (const key of PAXEL_SCORE_KEYS) {
    const score = raw.scores[key];
    if (
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 10
    ) {
      throw new TypeError(
        `${name}.scores.${key} must be a number from 0 to 10`
      );
    }
    scores[key] = score;
  }
  return {
    measured_at: new Date(measuredAt).toISOString(),
    report_url: requiredText(raw.report_url, `${name}.report_url`),
    growth_edge: requiredText(raw.growth_edge, `${name}.growth_edge`),
    scores,
  };
}

export function computePaxelDelta(previous, current) {
  const delta = {};
  for (const key of PAXEL_SCORE_KEYS) {
    delta[key] = Number(
      (current.scores[key] - previous.scores[key]).toFixed(2)
    );
  }
  return delta;
}

function measurementFailure(timestamp, now, label) {
  const measuredAt = Date.parse(timestamp);
  if (measuredAt > now.getTime() + 5 * 60 * 1000) {
    return `${label} measurement is in the future`;
  }
  if (now.getTime() - measuredAt > MAX_MEASUREMENT_AGE_DAYS * DAY_MS) {
    return `${label} measurement is older than ${MAX_MEASUREMENT_AGE_DAYS} days`;
  }
  return null;
}

function normalizeShip(ship, label) {
  const ref = typeof ship?.ref === 'string' ? ship.ref.trim() : '';
  const summary = typeof ship?.summary === 'string' ? ship.summary.trim() : '';
  return {
    ref: ref || null,
    summary: summary || null,
    failure:
      ref && summary ? null : `${label} ship requires both ref and summary`,
  };
}

function normalizeIsAgenticReport(raw, requestedTarget, now) {
  const target = normalizedTarget(requestedTarget);
  const failures = [];
  if (!isRecord(raw)) {
    return {
      target,
      score: null,
      scanned_at: null,
      report_url: null,
      essential_failures: [],
      failures: ['report unavailable'],
    };
  }
  let reportTarget = null;
  try {
    reportTarget = normalizedTarget(String(raw.target ?? ''));
  } catch {
    failures.push('report target is invalid');
  }
  if (reportTarget && reportTarget !== target) {
    failures.push(`report target ${reportTarget} does not match ${target}`);
  }
  const score =
    typeof raw.score === 'number' && Number.isFinite(raw.score)
      ? raw.score
      : null;
  if (score !== 100) failures.push(`score is ${score ?? 'unavailable'}/100`);
  let scannedAt = null;
  try {
    scannedAt = new Date(
      parseTimestamp(raw.scanned_at, 'scanned_at')
    ).toISOString();
    const freshnessFailure = measurementFailure(scannedAt, now, target);
    if (freshnessFailure) failures.push(freshnessFailure);
  } catch {
    failures.push('scanned_at is unavailable');
  }
  const issues = Array.isArray(raw.issues) ? raw.issues : [];
  const essentialFailures = issues
    .filter(
      issue =>
        isRecord(issue) &&
        issue.tier === 'essential' &&
        isFailedResult(issue.result)
    )
    .map(issue => String(issue.id ?? 'unknown'));
  if (essentialFailures.length > 0) {
    failures.push(`essential failures: ${essentialFailures.join(', ')}`);
  }
  return {
    target,
    score,
    scanned_at: scannedAt,
    report_url: typeof raw.report_url === 'string' ? raw.report_url : null,
    essential_failures: essentialFailures,
    failures,
  };
}

export function buildWeeklyReceipt({
  previousProfile,
  currentProfile,
  reports,
  ships,
  now = new Date(),
}) {
  const previous = parsePaxelProfile(previousProfile, 'previous Paxel profile');
  const current = parsePaxelProfile(currentProfile, 'current Paxel profile');
  const actions = [];
  if (Date.parse(previous.measured_at) >= Date.parse(current.measured_at)) {
    actions.push(
      'current Paxel profile must be newer than the previous profile'
    );
  }
  const paxelFreshnessFailure = measurementFailure(
    current.measured_at,
    now,
    'Paxel'
  );
  if (paxelFreshnessFailure) actions.push(paxelFreshnessFailure);

  const normalizedReports = reports.map(report =>
    normalizeIsAgenticReport(report.raw, report.target, now)
  );
  for (const report of normalizedReports) {
    actions.push(
      ...report.failures.map(failure => `${report.target}: ${failure}`)
    );
  }
  const paxelShip = normalizeShip(ships?.paxel, 'Paxel');
  const isAgenticShip = normalizeShip(ships?.is_agentic, 'Is Agentic');
  if (paxelShip.failure) actions.push(paxelShip.failure);
  if (isAgenticShip.failure) actions.push(isAgenticShip.failure);

  return {
    schema: 'jovie-weekly-agent-readiness-receipt/v1',
    receipt_id: `agent-readiness-${now.toISOString().slice(0, 10)}`,
    generated_at: now.toISOString(),
    status: actions.length === 0 ? 'complete' : 'action_required',
    compute_placement: {
      schema: 'compute-placement-v1',
      paxel: {
        execution: 'local-docker',
        schedule: 'weekly-weekday',
        boundary:
          'raw sessions and source stay local; only Paxel-approved redacted excerpts and scores upload',
      },
      is_agentic: {
        execution: 'public-vendor-report',
        schedule: 'weekly-weekday',
        boundary: 'public URLs and public scan evidence only',
      },
      receipt: {
        execution: 'local',
        retention: 'outside-repository',
        boundary:
          'five Paxel axis scores, growth edge, public Is Agentic results, and ship references only',
      },
    },
    paxel: {
      previous,
      current,
      delta: computePaxelDelta(previous, current),
      ship: { ref: paxelShip.ref, summary: paxelShip.summary },
    },
    is_agentic: {
      required_score: 100,
      reports: normalizedReports.map(({ failures, ...report }) => report),
      ship: { ref: isAgenticShip.ref, summary: isAgenticShip.summary },
    },
    actions,
  };
}

export function verifyPaxelUploader(source, expectedSha = PAXEL_UPLOAD_SHA256) {
  const actualSha = createHash('sha256').update(source).digest('hex');
  if (actualSha !== expectedSha) {
    throw new Error(
      `Paxel uploader changed: expected ${expectedSha}, received ${actualSha}; review before updating the pin`
    );
  }
  return actualSha;
}

async function runPaxelWeekly() {
  const tokenPath = join(homedir(), '.paxel', 'token');
  try {
    const token = await readFile(tokenPath, 'utf8');
    if (!token.trim()) throw new Error('empty token');
  } catch {
    throw new Error(
      'Paxel token missing. Complete the one-time YC SSO flow at https://paxel.ycombinator.com before the weekly run.'
    );
  }
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (docker.status !== 0) throw new Error('Docker is not running');

  const response = await fetch(PAXEL_UPLOAD_URL, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      `Paxel uploader download failed with HTTP ${response.status}`
    );
  const source = await response.text();
  if (Buffer.byteLength(source) > 2_000_000)
    throw new Error('Paxel uploader exceeds the reviewed size bound');
  verifyPaxelUploader(source);

  const tempDirectory = await mkdtemp(join(tmpdir(), 'jovie-paxel-'));
  const uploaderPath = join(tempDirectory, 'upload.sh');
  try {
    await writeFile(uploaderPath, source, { mode: 0o700 });
    const syntax = spawnSync('bash', ['-n', uploaderPath], {
      stdio: 'inherit',
    });
    if (syntax.status !== 0)
      throw new Error('Paxel uploader failed bash syntax validation');
    const run = spawnSync(
      'bash',
      [uploaderPath, '--project', 'Jovie', '--since', '1w', '--no-sentry'],
      { cwd: process.cwd(), env: process.env, stdio: 'inherit' }
    );
    if (run.status !== 0)
      throw new Error(
        `Paxel weekly run failed with exit ${run.status ?? 'unknown'}`
      );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function parseFlags(argv) {
  const flags = { targets: [], reportFiles: new Map() };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`expected --flag value, received ${flag ?? '(nothing)'}`);
    }
    index += 1;
    if (flag === '--target') flags.targets.push(normalizedTarget(value));
    else if (flag === '--is-agentic-report') {
      const separator = value.indexOf('=');
      if (separator < 1)
        throw new Error('--is-agentic-report must be target=path');
      flags.reportFiles.set(
        normalizedTarget(value.slice(0, separator)),
        value.slice(separator + 1)
      );
    } else flags[flag.slice(2).replaceAll('-', '_')] = value;
  }
  return flags;
}

async function readJson(path) {
  const source = await readFile(path, 'utf8');
  if (Buffer.byteLength(source) > 1_000_000)
    throw new Error(`${path} exceeds the 1 MB input limit`);
  return JSON.parse(source);
}

async function getIsAgenticReport(target, reportFiles) {
  const fixture = reportFiles.get(target);
  if (fixture) return readJson(fixture);
  const url = new URL('https://is-agentic.com/api/v1/report');
  url.searchParams.set('url', `https://${target}`);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return {
      target: `https://${target}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(tempPath, path);
}

async function createReceipt(argv) {
  const flags = parseFlags(argv);
  const previousPath = requiredText(flags.paxel_previous, '--paxel-previous');
  const currentPath = requiredText(flags.paxel_current, '--paxel-current');
  const outputPath = requiredText(flags.output, '--output');
  const targets = flags.targets.length > 0 ? flags.targets : IS_AGENTIC_TARGETS;
  const [previousProfile, currentProfile, ...rawReports] = await Promise.all([
    readJson(previousPath),
    readJson(currentPath),
    ...targets.map(target => getIsAgenticReport(target, flags.reportFiles)),
  ]);
  const receipt = buildWeeklyReceipt({
    previousProfile,
    currentProfile,
    reports: targets.map((target, index) => ({
      target,
      raw: rawReports[index],
    })),
    ships: {
      paxel: { ref: flags.paxel_ship_ref, summary: flags.paxel_ship_summary },
      is_agentic: {
        ref: flags.is_agentic_ship_ref,
        summary: flags.is_agentic_ship_summary,
      },
    },
  });
  await writeJsonAtomic(outputPath, receipt);
  process.stdout.write(`${receipt.status}: ${outputPath}\n`);
  if (receipt.status !== 'complete') {
    for (const action of receipt.actions) process.stderr.write(`- ${action}\n`);
    process.exitCode = 1;
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'paxel') return runPaxelWeekly();
  if (command === 'receipt') return createReceipt(argv);
  throw new Error(
    'Usage: weekly-agent-readiness.mjs paxel | receipt [options]'
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 2;
  });
}
