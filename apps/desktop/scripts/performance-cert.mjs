#!/usr/bin/env node
/** CLI for JOV-7463 installed-Mac performance certification. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildCertReport,
  exitCodeForReport,
  measurementsFromLaunchReadiness,
  measurementsFromProductionBaseline,
  mergeMeasurements,
  PERFORMANCE_CONTRACT,
  renderCertSummary,
} from './performance-contract.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

export function parseCertOptions(args) {
  // pnpm may forward a literal `--` separator when callers use `run … -- --flags`.
  const cleaned = args.filter(arg => arg !== '--');
  const { values } = parseArgs({
    args: cleaned,
    options: {
      mode: { type: 'string', default: 'contract-check' },
      measurements: { type: 'string' },
      readiness: { type: 'string' },
      baseline: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) return { help: true };
  const mode = values.mode;
  if (!['contract-check', 'evaluate', 'live'].includes(mode)) {
    throw new Error('--mode must be contract-check, evaluate, or live');
  }
  return {
    mode,
    measurementsPath: values.measurements
      ? path.resolve(values.measurements)
      : null,
    readinessPath: values.readiness ? path.resolve(values.readiness) : null,
    baselinePath: values.baseline ? path.resolve(values.baseline) : null,
    outputDir: path.resolve(
      values.output ??
        path.join(
          repoRoot,
          'artifacts/desktop-test-results/performance-cert',
          new Date().toISOString().replaceAll(':', '-')
        )
    ),
  };
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function collectMeasurements(options) {
  const parts = [];
  let identity = null;
  if (options.measurementsPath) {
    const payload = await loadJson(options.measurementsPath);
    const measurements = payload.measurements ?? payload;
    parts.push(measurements);
    identity = payload.identity ?? payload.nativeBuild ?? identity;
  }
  if (options.readinessPath) {
    const readiness = measurementsFromLaunchReadiness(
      await loadJson(options.readinessPath)
    );
    identity = readiness.nativeBuild ?? identity;
    parts.push(readiness);
  }
  if (options.baselinePath) {
    const baseline = measurementsFromProductionBaseline(
      await loadJson(options.baselinePath)
    );
    identity = baseline.nativeBuild ?? identity;
    parts.push(baseline);
  }
  return { measurements: mergeMeasurements(...parts), identity };
}

export async function runPerformanceCert(options) {
  if (options.mode === 'contract-check') {
    const fixture = {
      warmLaunchMs: 400,
      cachedNavigationMs: 80,
      coldLaunchToUsableMs: 1200,
      typingLatencyMs: 12,
      commandPaletteMs: 40,
      idleCpuPercent: 0.5,
      unintendedLayoutShifts: 0,
      lostDrafts: 0,
    };
    const under = buildCertReport({
      mode: 'contract-check',
      measurements: fixture,
      platform: 'linux',
    });
    const over = buildCertReport({
      mode: 'contract-check',
      measurements: { ...fixture, coldLaunchToUsableMs: 2000 },
      platform: 'linux',
    });
    const incomplete = buildCertReport({
      mode: 'contract-check',
      measurements: {},
      platform: 'linux',
    });
    if (under.evaluation.status !== 'certified')
      throw new Error(
        'Contract check fixture must certify under-budget values'
      );
    if (over.evaluation.status !== 'regression')
      throw new Error('Contract check must reject over-budget values');
    if (
      incomplete.evaluation.status !== 'incomplete' ||
      incomplete.gate.liveCert !== 'blocked'
    )
      throw new Error('Contract check must block LIVE_CERT when incomplete');
    return {
      schema: 'jovie-desktop-performance-cert-report/v1',
      issue: 'JOV-7463',
      mode: 'contract-check',
      generatedAt: new Date().toISOString(),
      host: {
        platform: process.platform,
        architecture: process.arch,
        release: os.release(),
      },
      identity: null,
      contract: {
        schema: PERFORMANCE_CONTRACT.schema,
        source: PERFORMANCE_CONTRACT.source,
        budgets: PERFORMANCE_CONTRACT.budgets,
      },
      measurements: {},
      evaluation: incomplete.evaluation,
      gate: {
        liveCert: 'blocked',
        reason:
          'LIVE_CERT blocked: contract-check is CI-safe only; installed-Mac session required for live certification',
        evaluationStatus: incomplete.evaluation.status,
        selfTest: {
          underBudget: under.evaluation.status,
          overBudget: over.evaluation.status,
          incomplete: incomplete.evaluation.status,
        },
      },
    };
  }

  if (options.mode === 'live' && process.platform !== 'darwin') {
    const report = buildCertReport({
      mode: 'live',
      measurements: {},
      platform: process.platform,
    });
    report.gate = {
      liveCert: 'blocked',
      reason:
        'LIVE_CERT blocked: installed-Mac session required (no macOS runner in this environment)',
      evaluationStatus: 'incomplete',
    };
    return report;
  }

  if (
    options.mode === 'live' &&
    !options.readinessPath &&
    !options.baselinePath &&
    !options.measurementsPath
  ) {
    throw new Error(
      'live mode requires --readiness, --baseline, and/or --measurements'
    );
  }

  const { measurements, identity } = await collectMeasurements(options);
  return buildCertReport({
    mode: options.mode,
    measurements,
    identity,
  });
}

async function main() {
  const options = parseCertOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      `Usage: pnpm desktop:performance:cert [--mode contract-check|evaluate|live] [--measurements <json>] [--readiness <launch-readiness.json>] [--baseline <production-baseline metadata.json>] [--output <dir>]

Modes:
  contract-check  CI-safe self-test of the charter budgets (default). LIVE_CERT stays blocked.
  evaluate        Score supplied measurement JSON / readiness / baseline files; exit 1 on regression.
  live            Installed-Mac certification. Requires macOS + measurement inputs. LIVE_CERT blocked off-Mac.

Charter budgets (JOV-7463): warm ≤500ms, cached nav ≤100ms, cold usable ≤1.5s, typing ≤16ms, palette ≤50ms, idle CPU ≤1%, 0 layout shifts, 0 lost drafts.
`
    );
    return;
  }
  const report = await runPerformanceCert(options);
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(
    path.join(options.outputDir, 'cert-report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  await writeFile(
    path.join(options.outputDir, 'summary.md'),
    renderCertSummary(report)
  );
  process.stdout.write(
    `[desktop-performance-cert] ${report.evaluation.status} LIVE_CERT=${report.gate.liveCert}: ${options.outputDir}\n`
  );
  process.exitCode = exitCodeForReport(report);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    process.stderr.write(`[desktop-performance-cert] ${error.message}\n`);
    process.exitCode = 1;
  });
}
