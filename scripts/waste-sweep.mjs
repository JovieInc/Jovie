#!/usr/bin/env node
/**
 * Repository waste sweep (jovie-waste-sweep/v1). Policy: scripts/lib/waste-sweep.mjs.
 *
 *   node scripts/waste-sweep.mjs measure [--ci] [--ci-days 30] [--write-latest] [--json <path>]
 *   node scripts/waste-sweep.mjs ratchet [--base <sha>] [--report <path>]
 *   node scripts/waste-sweep.mjs tighten --report <path>
 *   node scripts/waste-sweep.mjs file-candidates --report <path> [--limit 5] [--run-url <url>]
 *
 * `measure` runs knip with every issue type enabled (knip.json keeps its
 * dependency-only report for `pnpm knip`), measures always-loaded agent
 * context and lockfile duplication, and with --ci samples Actions run history
 * through the gh CLI (one call per active workflow).
 * `ratchet` fails when any dead-code count rose above docs/metrics/waste-baseline.json
 * or when a file added since --base is itself unused, and names the knip
 * issues in the changed files.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGh } from '../packages/api-client/gh.ts';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';
import {
  candidateIssueBody,
  deletionCandidates,
  divergentDirectDependencies,
  evaluateWasteRatchet,
  issuesInFiles,
  lockfileDuplicates,
  measureAgentContext,
  summarizeCiRuns,
  summarizeKnip,
  tightenBaseline,
  WASTE_SCHEMA,
  wasteScore,
} from './lib/waste-sweep.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const BASELINE_PATH = 'docs/metrics/waste-baseline.json';
export const LATEST_PATH = 'docs/metrics/waste-latest.json';
const TMP_CONFIG = '.knip.waste-sweep.json';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const git = args =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

export function runKnip(root = ROOT) {
  const config = JSON.parse(readFileSync(join(root, 'knip.json'), 'utf8'));
  delete config.exclude;
  const configPath = join(root, TMP_CONFIG);
  writeFileSync(configPath, JSON.stringify(config));
  try {
    const stdout = execFileSync(
      'pnpm',
      [
        'exec',
        'knip',
        '--config',
        TMP_CONFIG,
        '--reporter',
        'json',
        '--no-exit-code',
        '--no-progress',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      }
    );
    return JSON.parse(stdout.slice(stdout.indexOf('{')));
  } finally {
    rmSync(configPath, { force: true });
  }
}

function sizeOf(path) {
  try {
    return statSync(join(ROOT, path)).size;
  } catch {
    return 0;
  }
}

async function gh(args) {
  const result = await runGh(args, { priority: 'report' });
  if (result.code !== 0)
    throw new Error(
      `gh ${args.slice(0, 2).join(' ')} exited ${result.code}: ${result.stderr.slice(0, 200)}`
    );
  return result.stdout;
}

async function sampleCi(days) {
  const since = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const listed = (
    await gh([
      'api',
      'repos/{owner}/{repo}/actions/workflows?per_page=100',
      '--paginate',
      '--jq',
      '.workflows[] | select(.state == "active" and (.path | startswith(".github/workflows/"))) | {id, path} | @json',
    ])
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const rows = [];
  for (const workflow of listed) {
    if (!existsSync(join(ROOT, workflow.path))) continue;
    try {
      rows.push(
        JSON.parse(
          await gh([
            'api',
            `repos/{owner}/{repo}/actions/workflows/${workflow.id}/runs?per_page=100&created=>=${since}`,
            '--jq',
            `{path: "${workflow.path}", total: .total_count, runs: [.workflow_runs[] | {c: .conclusion, s: .run_started_at, u: .updated_at}]} | @json`,
          ])
        )
      );
    } catch (error) {
      rows.push({ path: workflow.path, total: 0, runs: [], error: true });
      process.stderr.write(
        `ci sample failed for ${workflow.path}: ${error.message}\n`
      );
    }
  }
  return summarizeCiRuns(rows, { days });
}

function manifests() {
  const out = {};
  for (const path of git(['ls-files', '*package.json', 'package.json'])
    .split('\n')
    .filter(p => p && !p.startsWith('.agents/'))) {
    try {
      out[path] = JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
    } catch {
      // A fixture manifest that is not JSON is not a workspace.
    }
  }
  return out;
}

export async function measure({ ci = false, ciDays = 30, knipReport } = {}) {
  const report = knipReport ?? runKnip();
  const knip = summarizeKnip(report, sizeOf);
  const ciSummary = ci ? await sampleCi(ciDays) : null;
  const metrics = {
    knip: knip.counts,
    agentContext: measureAgentContext(ROOT),
    dependencies: {
      ...lockfileDuplicates(readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')),
      divergentDirect: divergentDirectDependencies(manifests()),
    },
    ci: ciSummary,
  };
  return {
    schema: WASTE_SCHEMA,
    measuredAt: new Date().toISOString(),
    sha: git(['rev-parse', 'HEAD']),
    score: wasteScore(metrics),
    ...metrics,
    candidates: deletionCandidates(knip, ciSummary, 10),
    _report: report,
  };
}

function publicSnapshot(result) {
  const { _report, ...snapshot } = result;
  return snapshot;
}

function readBaseline() {
  return JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8'));
}

function changedFiles(base) {
  if (!base) return { changed: [], added: [] };
  const diff = filter =>
    git(['diff', '--name-only', `--diff-filter=${filter}`, `${base}...HEAD`])
      .split('\n')
      .filter(Boolean);
  return { changed: diff('ACMR'), added: diff('A') };
}

export function ratchetVerdict(result, baseline, { changed, added }) {
  const verdict = evaluateWasteRatchet(result.knip, baseline);
  const addedUnused = (result._report?.issues ?? [])
    .filter(
      issue => added.includes(issue.file) && (issue.files?.length ?? 0) > 0
    )
    .map(issue => issue.file);
  return {
    ...verdict,
    ok: verdict.ok && addedUnused.length === 0,
    addedUnused,
    inChangedFiles: issuesInFiles(result._report, changed),
  };
}

async function main() {
  const command = process.argv[2];
  if (command === 'measure') {
    const result = await measure({
      ci: process.argv.includes('--ci'),
      ciDays: Number(arg('--ci-days', '30')),
    });
    const snapshot = publicSnapshot(result);
    if (process.argv.includes('--write-latest'))
      writeFileSync(
        join(ROOT, LATEST_PATH),
        `${JSON.stringify(snapshot, null, 2)}\n`
      );
    const out = arg('--json');
    if (out) writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ score: snapshot.score, knip: snapshot.knip, alwaysLoadedBytes: snapshot.agentContext.alwaysLoadedBytes, ciWallMinutes: snapshot.ci?.wallMinutes ?? null }, null, 2)}\n`
    );
    return;
  }
  if (command === 'ratchet') {
    const reportPath = arg('--report');
    const result = reportPath
      ? { ...JSON.parse(readFileSync(reportPath, 'utf8')), _report: undefined }
      : await measure();
    const verdict = ratchetVerdict(
      result,
      readBaseline(),
      changedFiles(arg('--base'))
    );
    for (const row of verdict.results)
      process.stdout.write(
        `${row.ok ? 'ok  ' : 'FAIL'} ${row.dimension}: ${row.measured} (baseline ${row.baseline ?? '-'}, ${row.status})\n`
      );
    for (const path of verdict.addedUnused)
      process.stdout.write(
        `::error file=${path}::new file is not imported by anything (knip). Delete it or wire it up.\n`
      );
    if (!verdict.ok) {
      for (const hit of verdict.inChangedFiles)
        process.stdout.write(
          `::error file=${hit.path}::knip: ${hit.kinds.join('; ')}\n`
        );
      process.stdout.write(
        'Dead code rose above docs/metrics/waste-baseline.json. Remove the unused code above, or add a real entry point to knip.json. The baseline only shrinks.\n'
      );
      process.exitCode = 1;
    } else if (verdict.improvements.length) {
      process.stdout.write(
        `Improved: ${verdict.improvements.map(r => `${r.dimension} ${r.baseline}->${r.measured}`).join(', ')}. Optionally lower ${BASELINE_PATH} (node scripts/waste-sweep.mjs tighten --report <json>).\n`
      );
    }
    return;
  }
  if (command === 'tighten') {
    const snapshot = JSON.parse(readFileSync(arg('--report'), 'utf8'));
    const { changed, baseline } = tightenBaseline(
      readBaseline(),
      snapshot.knip
    );
    if (changed)
      writeFileSync(
        join(ROOT, BASELINE_PATH),
        `${JSON.stringify(baseline, null, 2)}\n`
      );
    process.stdout.write(
      changed ? 'baseline tightened\n' : 'baseline unchanged\n'
    );
    return;
  }
  if (command === 'file-candidates') {
    const snapshot = JSON.parse(readFileSync(arg('--report'), 'utf8'));
    const limit = Number(arg('--limit', '5'));
    const receipts = [];
    for (const candidate of snapshot.candidates.slice(0, limit)) {
      const result = await upsertLinearIssueByTitleFingerprint({
        fingerprint: candidate.fingerprint,
        title: `[waste] ${candidate.title}`,
        description: candidateIssueBody(candidate, arg('--run-url')),
        priority: 4,
        createStateName: 'Todo',
        reopenTerminal: false,
      });
      receipts.push({
        fingerprint: candidate.fingerprint,
        ok: result.ok,
        reason: result.reason ?? null,
        identifier: result.identifier ?? result.issue?.identifier ?? null,
      });
    }
    process.stdout.write(`${JSON.stringify(receipts, null, 2)}\n`);
    return;
  }
  process.stderr.write(
    'usage: waste-sweep.mjs measure|ratchet|tighten|file-candidates\n'
  );
  process.exitCode = 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
