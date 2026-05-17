#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type InteractionScenarioDefinition,
  type InteractionTier,
  selectInteractionHotPaths,
} from './performance-interaction-manifest';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
  type InteractionRunMetadata,
  renderInteractionLatencyMarkdown,
} from './performance-interaction-report';

export interface InteractionAuditCliOptions {
  readonly firstSliceOnly: boolean;
  readonly json: boolean;
  readonly list: boolean;
  readonly outDir: string;
  readonly sampleFile?: string;
  readonly scenarioIds: readonly string[];
  readonly tiers: readonly InteractionTier[];
}

export interface InteractionAuditEnvironment {
  readonly authPersona?: string;
  readonly baseUrl?: string;
  readonly browser?: string;
  readonly buildMode?: InteractionRunMetadata['buildMode'];
  readonly cpuProfile?: string;
  readonly datasetSize?: string;
  readonly networkProfile?: string;
  readonly viewport?: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const defaultOutDir = resolve(webRoot, 'test-results', 'interaction-latency');

function printHelp() {
  console.log(
    [
      'Usage: pnpm --filter @jovie/web run perf:interactions -- --list',
      '       pnpm --filter @jovie/web run perf:interactions -- --sample-file samples.json',
      '',
      'Options:',
      '  --first-slice       Only include the initial P0/P1 audit scenarios',
      '  --json              Print JSON report to stdout',
      '  --list              Print selected scenario manifest entries',
      '  --out-dir <path>    Output directory for report.json and report.md',
      '  --sample-file <path> Read collected interaction samples from JSON',
      '  --scenario-id <id>  Include a scenario id, repeatable',
      '  --tier <P0|P1|P2>   Include a tier, repeatable',
    ].join('\n')
  );
}

function requireValue(args: readonly string[], index: number, option: string) {
  const value = args[index + 1];
  if (!value) {
    throw new TypeError(`Missing value for ${option}`);
  }
  return value;
}

function resolveCliPath(value: string) {
  const normalized = value.replaceAll('\\', '/');

  if (normalized === 'apps/web' || normalized.startsWith('apps/web/')) {
    return resolve(repoRoot, value);
  }

  return resolve(value);
}

export function parseInteractionAuditCliArgs(
  args: readonly string[],
  defaultOutputDir = defaultOutDir
): InteractionAuditCliOptions {
  const scenarioIds: string[] = [];
  const tiers: InteractionTier[] = [];
  let firstSliceOnly = false;
  let json = false;
  let list = false;
  let outDir = defaultOutputDir;
  let sampleFile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--first-slice') {
      firstSliceOnly = true;
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--list') {
      list = true;
      continue;
    }

    if (arg === '--out-dir') {
      outDir = resolveCliPath(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--sample-file') {
      sampleFile = resolveCliPath(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--scenario-id') {
      scenarioIds.push(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--tier') {
      const value = requireValue(args, index, arg);
      if (!['P0', 'P1', 'P2'].includes(value)) {
        throw new TypeError(`Unknown tier: ${value}`);
      }
      tiers.push(value as InteractionTier);
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new TypeError(`Unknown option: ${arg}`);
  }

  return {
    firstSliceOnly,
    json,
    list,
    outDir,
    sampleFile,
    scenarioIds,
    tiers,
  };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function normalizeSamples(
  raw: unknown
): readonly InteractionLatencySample[] {
  if (Array.isArray(raw)) {
    return raw as readonly InteractionLatencySample[];
  }

  if (raw && typeof raw === 'object' && 'samples' in raw) {
    const samples = (raw as { readonly samples?: unknown }).samples;
    if (Array.isArray(samples)) {
      return samples as readonly InteractionLatencySample[];
    }
  }

  throw new TypeError(
    'Sample file must be an array or an object with a samples array'
  );
}

function readSamples(sampleFile: string | undefined) {
  if (!sampleFile) {
    return [];
  }

  if (!existsSync(sampleFile)) {
    throw new Error(`Sample file does not exist: ${sampleFile}`);
  }

  return normalizeSamples(readJsonFile<unknown>(sampleFile));
}

function normalizeBuildMode(
  value: string | undefined
): InteractionRunMetadata['buildMode'] | undefined {
  if (
    value === 'development' ||
    value === 'preview' ||
    value === 'production' ||
    value === 'test'
  ) {
    return value;
  }

  return undefined;
}

export function resolveInteractionAuditEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env
): InteractionAuditEnvironment {
  return {
    authPersona: source.INTERACTION_AUDIT_AUTH_PERSONA,
    baseUrl: source.BASE_URL,
    browser: source.INTERACTION_AUDIT_BROWSER ?? 'chromium',
    buildMode: normalizeBuildMode(source.NODE_ENV),
    cpuProfile: source.INTERACTION_AUDIT_CPU_PROFILE,
    datasetSize: source.INTERACTION_AUDIT_DATASET_SIZE,
    networkProfile: source.INTERACTION_AUDIT_NETWORK_PROFILE,
    viewport: source.INTERACTION_AUDIT_VIEWPORT,
  };
}

export function selectInteractionAuditScenarios(
  options: Pick<
    InteractionAuditCliOptions,
    'firstSliceOnly' | 'scenarioIds' | 'tiers'
  >
): readonly InteractionScenarioDefinition[] {
  return selectInteractionHotPaths({
    firstSliceOnly: options.firstSliceOnly,
    scenarioIds: options.scenarioIds,
    tiers: options.tiers,
  });
}

function buildMetadata(
  options: InteractionAuditCliOptions,
  auditEnv = resolveInteractionAuditEnvironment()
) {
  const metadata = {
    authPersona: auditEnv.authPersona,
    baseUrl: auditEnv.baseUrl,
    browser: auditEnv.browser ?? 'chromium',
    buildMode: auditEnv.buildMode,
    cpuProfile: auditEnv.cpuProfile,
    datasetSize: auditEnv.datasetSize,
    networkProfile: auditEnv.networkProfile,
    sampleCount: undefined,
    viewport: auditEnv.viewport,
  } satisfies InteractionRunMetadata;

  return {
    ...metadata,
    sampleCount: options.sampleFile ? undefined : 0,
  };
}

export function runInteractionAuditReport(options: InteractionAuditCliOptions) {
  const scenarios = selectInteractionAuditScenarios(options);
  const samples = readSamples(options.sampleFile);

  return buildInteractionLatencyReport({
    metadata: {
      ...buildMetadata(options),
      sampleCount: samples.length,
    },
    samples,
    scenarios,
  });
}

export function writeInteractionAuditArtifacts(
  options: InteractionAuditCliOptions
) {
  const report = runInteractionAuditReport(options);
  const markdown = renderInteractionLatencyMarkdown(report);

  ensureDir(options.outDir);
  writeFileSync(
    resolve(options.outDir, 'report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  writeFileSync(resolve(options.outDir, 'report.md'), markdown);

  return report;
}

async function main() {
  const options = parseInteractionAuditCliArgs(process.argv.slice(2));

  if (options.list) {
    const scenarios = selectInteractionAuditScenarios(options);
    const output = scenarios.map(scenario => ({
      budget: scenario.budget,
      id: scenario.id,
      managerLoopProximity: scenario.managerLoopProximity,
      route: scenario.route,
      tier: scenario.tier,
      title: scenario.title,
    }));
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const report = writeInteractionAuditArtifacts(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderInteractionLatencyMarkdown(report));
  console.error(`Wrote interaction latency artifacts to ${options.outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
