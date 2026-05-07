#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type RepoKey = 'jovie' | 'ops';
type TestLane =
  | 'e2e'
  | 'flake'
  | 'generation'
  | 'integration'
  | 'mutation'
  | 'unit';

interface RepoProfile {
  displayName: string;
  mode: string;
  language: string;
  frameworks: string[];
  packageManager: string;
  commands: Record<string, string>;
  nightlyBudget: {
    maxTargets: number;
    mutationMinutes: number;
    maxGeneratedTests: number;
  };
  riskWeights: {
    criticality: number;
    recentFailure: number;
    mutationSurvivor: number;
    flake: number;
    duration: number;
    quarantine: number;
  };
  protectedPathPrefixes: string[];
  generationPolicy: {
    allowAutoPersist: boolean;
    requireMutationOrCoverageSignal: boolean;
    stabilityReruns: number;
    preferModes: string[];
  };
  quarantine: QuarantineRecord[];
  riskItems: RiskItem[];
}

interface NightlyManifest {
  repos: Record<RepoKey, RepoProfile>;
}

interface RiskItem {
  id: string;
  module: string;
  owner?: string;
  criticality: number;
  kind: string;
  reasons: string[];
  paths: string[];
  relatedTests?: string[];
  lanes: TestLane[];
  historicFailRate?: number;
  avgDurationMs?: number;
  mutationSurvivors?: number;
  flakeScore?: number;
  generatedTestBudget?: number;
  cannotBeProvedLower?: boolean;
}

interface QuarantineRecord {
  id: string;
  lane: string;
  owner?: string;
  addedAt?: string | null;
  exitCriteria?: string;
}

interface FailureRecord {
  repo: RepoKey;
  testId: string;
  lane: string;
  file?: string;
  module?: string;
  fingerprint: string;
  message?: string;
  flaky?: boolean;
  durationMs?: number;
  createdAt: string;
}

interface MutationRecord {
  repo: RepoKey;
  targetId?: string;
  module?: string;
  total: number;
  killed: number;
  survived: number;
  timedOut?: number;
  noCoverage?: number;
  score: number;
  createdAt: string;
}

interface SelectedTarget extends RiskItem {
  selectedAt: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  recommendedLanes: TestLane[];
}

interface SuiteSummary {
  lane: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
}

interface NormalizedRunReport {
  generatedAt: string;
  repo: RepoKey;
  inputs: string[];
  warnings: string[];
  suites: SuiteSummary[];
  failures: FailureRecord[];
  mutation?: MutationRecord;
}

interface CandidateCommand {
  name: string;
  argv: string[];
  cwd?: string;
  timeoutSeconds?: number;
}

interface CandidateTest {
  id: string;
  repo: RepoKey;
  targetFile: string;
  sourceUnderTest: string;
  testType: 'e2e' | 'integration' | 'model' | 'property' | 'unit';
  rationale: string;
  assertions: string[];
  expectedSignal: {
    kind: 'coverage' | 'flake' | 'mutation' | 'regression';
    description: string;
  };
  commands: CandidateCommand[];
  stabilityReruns?: number;
}

interface CandidateValidationResult {
  id: string;
  keep: boolean;
  executed: boolean;
  errors: string[];
  warnings: string[];
}

interface CandidateValidationReport {
  generatedAt: string;
  repo: RepoKey;
  candidateInput: string;
  total: number;
  kept: number;
  results: CandidateValidationResult[];
}

interface PlaywrightReport {
  suites?: PlaywrightSuite[];
  stats?: {
    duration?: number;
  };
}

interface PlaywrightSuite {
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

interface PlaywrightSpec {
  title?: string;
  file?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  title?: string;
  status?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightResult {
  duration?: number;
  error?: {
    message?: string;
    stack?: string;
  };
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

function findRepoRoot(startDir = currentDir): string {
  let dir = startDir;
  for (;;) {
    if (
      existsSync(path.join(dir, 'package.json')) &&
      existsSync(path.join(dir, 'AGENTS.md'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Unable to locate repo root from ${startDir}`);
    }
    dir = parent;
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--' || !arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && next !== '--' && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function normalizeRepoKey(value: string | undefined): RepoKey {
  if (!value || value === 'jovie') {
    return 'jovie';
  }
  if (value === 'ops') {
    return 'ops';
  }
  throw new Error(
    `Unsupported repo key "${value}". Expected "jovie" or "ops".`
  );
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, value);
}

function writeJsonl(filePath: string, values: readonly unknown[]): void {
  const body = values.map(value => JSON.stringify(value)).join('\n');
  writeText(filePath, body.length > 0 ? `${body}\n` : '');
}

function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function getManifest(repoRoot: string): NightlyManifest {
  return readJson<NightlyManifest>(
    path.join(repoRoot, '.agents/skills/nightly-test-agent/manifests.json')
  );
}

function outputDir(repoRoot: string, args: Record<string, string>): string {
  return args.out
    ? path.resolve(repoRoot, args.out)
    : path.join(repoRoot, 'apps/web/test-results/nightly-agent');
}

function resolveFromRoot(repoRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function pathMatches(filePath: string, patterns: readonly string[]): boolean {
  const normalized = normalizePath(filePath);
  return patterns.some(pattern => {
    const cleanPattern = normalizePath(pattern);
    if (cleanPattern.endsWith('/')) {
      return normalized.startsWith(cleanPattern);
    }
    return normalized === cleanPattern;
  });
}

function findFiles(
  rootDir: string,
  predicate: (filePath: string) => boolean
): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }
  const pending = [rootDir];
  const found: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        pending.push(path.join(current, entry));
      }
    } else if (predicate(current)) {
      found.push(current);
    }
  }
  return found.sort();
}

function loadFailureRecords(fileOrDir: string, repo: RepoKey): FailureRecord[] {
  if (!existsSync(fileOrDir)) {
    return [];
  }
  const stat = statSync(fileOrDir);
  const files = stat.isDirectory()
    ? findFiles(
        fileOrDir,
        filePath =>
          filePath.endsWith('.jsonl') &&
          path.basename(filePath).includes('failure-memory')
      )
    : [fileOrDir];
  return files
    .flatMap(filePath => readJsonl<FailureRecord>(filePath))
    .filter(record => record.repo === repo);
}

function loadFailureMemory(
  repoRoot: string,
  args: Record<string, string>,
  repo: RepoKey
): FailureRecord[] {
  const paths = [
    args['failure-memory']
      ? resolveFromRoot(repoRoot, args['failure-memory'])
      : null,
    path.join(
      repoRoot,
      '.agents/skills/nightly-test-agent/failure-memory.jsonl'
    ),
    path.join(
      repoRoot,
      'apps/web/test-results/nightly-agent/failure-memory.jsonl'
    ),
    path.join(
      repoRoot,
      'apps/web/test-results/nightly-agent/failure-memory-delta.jsonl'
    ),
  ].filter((value): value is string => Boolean(value));
  return paths.flatMap(filePath => loadFailureRecords(filePath, repo));
}

function fingerprint(parts: readonly string[]): string {
  return createHash('sha256')
    .update(parts.join('\n'))
    .digest('hex')
    .slice(0, 16);
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match = regex.exec(value);
  while (match) {
    attributes[match[1]] = decodeXml(match[2]);
    match = regex.exec(value);
  }
  return attributes;
}

function relatedFailureCount(
  item: RiskItem,
  failures: readonly FailureRecord[]
): number {
  return failures.filter(record => {
    const file = record.file ?? record.testId;
    return (
      record.module === item.id ||
      record.module === item.module ||
      pathMatches(file, item.paths) ||
      pathMatches(file, item.relatedTests ?? [])
    );
  }).length;
}

function quarantineHit(
  item: RiskItem,
  quarantine: readonly QuarantineRecord[]
): number {
  return quarantine.some(record =>
    pathMatches(record.id, [...item.paths, ...(item.relatedTests ?? [])])
  )
    ? 1
    : 0;
}

function scoreRiskItem(params: {
  item: RiskItem;
  profile: RepoProfile;
  failures: readonly FailureRecord[];
}): SelectedTarget {
  const { item, profile, failures } = params;
  const recentFailures = relatedFailureCount(item, failures);
  const inQuarantine = quarantineHit(item, profile.quarantine);
  const protectedPath = item.paths.some(itemPath =>
    pathMatches(itemPath, profile.protectedPathPrefixes)
  )
    ? 1
    : 0;
  const duration = item.avgDurationMs
    ? Math.min(1, item.avgDurationMs / 120_000)
    : 0;
  const weights = profile.riskWeights;
  const scoreBreakdown = {
    criticality: item.criticality * weights.criticality,
    recentFailure:
      Math.min(1, recentFailures / 3 + (item.historicFailRate ?? 0)) *
      weights.recentFailure,
    mutationSurvivor:
      Math.min(1, (item.mutationSurvivors ?? 0) / 8) * weights.mutationSurvivor,
    flake: (item.flakeScore ?? 0) * weights.flake,
    duration: duration * weights.duration,
    quarantine: inQuarantine * weights.quarantine,
    protectedPath: protectedPath * 8,
  };
  const score = Object.values(scoreBreakdown).reduce(
    (total, value) => total + value,
    0
  );
  return {
    ...item,
    selectedAt: new Date().toISOString(),
    score: Math.round(score * 100) / 100,
    scoreBreakdown,
    recommendedLanes: [...new Set(item.lanes)],
  };
}

function commandContext(repoRoot: string, args: Record<string, string>): void {
  const repo = normalizeRepoKey(args.repo);
  const profile = getManifest(repoRoot).repos[repo];
  writeJson(path.join(outputDir(repoRoot, args), 'context.json'), {
    generatedAt: new Date().toISOString(),
    repo,
    profile,
    riskItems: profile.riskItems,
    memory: {
      quarantine: profile.quarantine,
    },
    policy: {
      secrets:
        'No secrets, raw env values, cookies, auth tokens, or database URLs may be sent to models.',
      autoPersistGeneratedTests: profile.generationPolicy.allowAutoPersist,
      stabilityReruns: profile.generationPolicy.stabilityReruns,
    },
  });
  console.log('Wrote nightly test-agent context.');
}

function commandSelect(repoRoot: string, args: Record<string, string>): void {
  const repo = normalizeRepoKey(args.repo);
  const profile = getManifest(repoRoot).repos[repo];
  const failures = loadFailureMemory(repoRoot, args, repo);
  const limit = args.limit
    ? Number.parseInt(args.limit, 10)
    : profile.nightlyBudget.maxTargets;
  const selectedTargets = profile.riskItems
    .map(item => scoreRiskItem({ item, profile, failures }))
    .sort((first, second) => second.score - first.score)
    .slice(
      0,
      Number.isFinite(limit) ? limit : profile.nightlyBudget.maxTargets
    );
  const dir = outputDir(repoRoot, args);
  writeJson(path.join(dir, 'selected-targets.json'), {
    generatedAt: new Date().toISOString(),
    repo,
    failureMemoryRecords: failures.length,
    selectedTargets,
  });
  writeText(
    path.join(dir, 'selected-targets.md'),
    [
      '# Nightly Test Agent Targets',
      '',
      `Repo: ${profile.displayName}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      '| Rank | Target | Score | Lanes | Reason |',
      '|---:|---|---:|---|---|',
      ...selectedTargets.map((target, index) => {
        const reason = target.reasons[0]?.replaceAll('|', '\\|') ?? '';
        return `| ${index + 1} | ${target.module} | ${target.score.toFixed(2)} | ${target.recommendedLanes.join(', ')} | ${reason} |`;
      }),
      '',
    ].join('\n')
  );
  console.log(`Selected ${selectedTargets.length} nightly target(s).`);
}

function parseJUnit(params: {
  filePath: string;
  repo: RepoKey;
  lane: string;
}): { suite: SuiteSummary; failures: FailureRecord[] } {
  const xml = readFileSync(params.filePath, 'utf8');
  const failures: FailureRecord[] = [];
  const suite: SuiteSummary = {
    lane: params.lane,
    total: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    durationMs: 0,
  };
  const regex =
    /<testcase\b([^>]*)\/>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g;
  let match = regex.exec(xml);
  while (match) {
    const attrs = parseAttributes(match[1] ?? match[2] ?? '');
    const body = match[3] ?? '';
    const name = [attrs.classname, attrs.name].filter(Boolean).join(' ');
    const file = attrs.file;
    const durationMs = Math.round(
      (Number.parseFloat(attrs.time ?? '0') || 0) * 1000
    );
    const failed = body.includes('<failure') || body.includes('<error');
    const skipped = body.includes('<skipped');
    suite.total += 1;
    suite.durationMs += durationMs;
    if (skipped) {
      suite.skipped += 1;
    } else if (failed) {
      suite.failed += 1;
      const messageMatch = /<(?:failure|error)\b[^>]*message="([^"]*)"/.exec(
        body
      );
      const message = messageMatch ? decodeXml(messageMatch[1]) : undefined;
      failures.push({
        repo: params.repo,
        testId: name || file || 'unknown-vitest-test',
        lane: params.lane,
        file,
        fingerprint: fingerprint([name, file ?? '', message ?? '']),
        message,
        durationMs,
        createdAt: new Date().toISOString(),
      });
    } else {
      suite.passed += 1;
    }
    match = regex.exec(xml);
  }
  return { suite, failures };
}

function collectPlaywrightTests(suites: readonly PlaywrightSuite[] = []) {
  const tests: Array<{
    spec: PlaywrightSpec;
    test: PlaywrightTest;
    file?: string;
  }> = [];
  function walk(suiteList: readonly PlaywrightSuite[]): void {
    for (const suite of suiteList) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          tests.push({ spec, test, file: spec.file ?? suite.file });
        }
      }
      walk(suite.suites ?? []);
    }
  }
  walk(suites);
  return tests;
}

function parsePlaywright(params: {
  filePath: string;
  repo: RepoKey;
  lane: string;
}): { suite: SuiteSummary; failures: FailureRecord[] } {
  const report = JSON.parse(
    readFileSync(params.filePath, 'utf8')
  ) as PlaywrightReport;
  const tests = collectPlaywrightTests(report.suites);
  const failures: FailureRecord[] = [];
  const suite: SuiteSummary = {
    lane: params.lane,
    total: tests.length,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    durationMs: Math.round(report.stats?.duration ?? 0),
  };
  for (const { spec, test, file } of tests) {
    const status = test.status ?? 'unknown';
    const durationMs = Math.round(
      (test.results ?? []).reduce(
        (total, result) => total + (result.duration ?? 0),
        0
      )
    );
    const title = [file, spec.title, test.title].filter(Boolean).join(' ');
    if (status === 'skipped') {
      suite.skipped += 1;
    } else if (status === 'flaky') {
      suite.flaky += 1;
      suite.passed += 1;
    } else if (status === 'unexpected') {
      suite.failed += 1;
      const errored = (test.results ?? []).find(result => result.error);
      const message = errored?.error?.message ?? errored?.error?.stack;
      failures.push({
        repo: params.repo,
        testId: title || 'unknown-playwright-test',
        lane: params.lane,
        file,
        fingerprint: fingerprint([title, message ?? '']),
        message,
        durationMs,
        createdAt: new Date().toISOString(),
      });
    } else {
      suite.passed += 1;
    }
  }
  return { suite, failures };
}

function countMutationStatuses(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') {
      return;
    }
    if ('status' in node) {
      const status = (node as { status?: unknown }).status;
      if (typeof status === 'string') {
        counts[status] = (counts[status] ?? 0) + 1;
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    for (const item of Object.values(node)) {
      walk(item);
    }
  }
  walk(value);
  return counts;
}

function parseMutation(params: {
  filePath: string;
  repo: RepoKey;
}): MutationRecord {
  const report = JSON.parse(readFileSync(params.filePath, 'utf8')) as unknown;
  const counts = countMutationStatuses(report);
  const killed = counts.Killed ?? counts.killed ?? 0;
  const survived = counts.Survived ?? counts.survived ?? 0;
  const timedOut =
    counts.Timeout ?? counts.timeout ?? counts.TimedOut ?? counts.timedOut ?? 0;
  const noCoverage = counts.NoCoverage ?? counts.noCoverage ?? 0;
  const detected = killed + timedOut;
  const total = detected + survived + noCoverage;
  const score = total > 0 ? Math.round((detected / total) * 10_000) / 100 : 0;
  return {
    repo: params.repo,
    module: 'mutation-hotspots',
    total,
    killed,
    survived,
    timedOut,
    noCoverage,
    score,
    createdAt: new Date().toISOString(),
  };
}

function commandNormalize(
  repoRoot: string,
  args: Record<string, string>
): void {
  const repo = normalizeRepoKey(args.repo);
  const warnings: string[] = [];
  const suites: SuiteSummary[] = [];
  const failures: FailureRecord[] = [];
  const inputs: string[] = [];
  function addInput(label: string, rawPath: string | undefined): string | null {
    if (!rawPath) {
      return null;
    }
    const filePath = resolveFromRoot(repoRoot, rawPath);
    inputs.push(`${label}:${filePath}`);
    if (!existsSync(filePath)) {
      warnings.push(`Missing ${label} report at ${filePath}`);
      return null;
    }
    return filePath;
  }
  const junitPath = addInput('junit', args.junit);
  if (junitPath) {
    const parsed = parseJUnit({ filePath: junitPath, repo, lane: 'unit' });
    suites.push(parsed.suite);
    failures.push(...parsed.failures);
  }
  const playwrightPath = addInput('playwright', args.playwright);
  if (playwrightPath) {
    const parsed = parsePlaywright({
      filePath: playwrightPath,
      repo,
      lane: 'nightly-e2e',
    });
    suites.push(parsed.suite);
    failures.push(...parsed.failures);
  }
  const mutationPath = addInput('mutation', args.mutation);
  const mutation = mutationPath
    ? parseMutation({ filePath: mutationPath, repo })
    : undefined;
  if (mutation) {
    suites.push({
      lane: 'mutation-hotspots',
      total: mutation.total,
      passed: mutation.killed,
      failed: mutation.survived + (mutation.timedOut ?? 0),
      flaky: 0,
      skipped: mutation.noCoverage ?? 0,
      durationMs: 0,
    });
  }
  const report: NormalizedRunReport = {
    generatedAt: new Date().toISOString(),
    repo,
    inputs,
    warnings,
    suites,
    failures,
    ...(mutation ? { mutation } : {}),
  };
  const dir = outputDir(repoRoot, args);
  writeJson(path.join(dir, args.name ?? 'normalized-results.json'), report);
  writeJsonl(path.join(dir, 'failure-memory-delta.jsonl'), failures);
  if (mutation) {
    writeJsonl(path.join(dir, 'mutation-memory-delta.jsonl'), [mutation]);
  }
  for (const warning of warnings) {
    console.warn(warning);
  }
  console.log('Wrote normalized report.');
}

const allowedArgvPrefixes: readonly string[][] = [
  ['pnpm', '--filter=@jovie/web', 'exec', 'tsc'],
  ['pnpm', '--filter=@jovie/web', 'exec', 'vitest', 'run'],
  ['pnpm', '--filter=@jovie/web', 'exec', 'playwright', 'test'],
  ['pnpm', '--filter=@jovie/web', 'exec', 'stryker', 'run'],
  ['pnpm', '--filter=@jovie/web', 'run', 'test'],
  ['pnpm', '--filter=@jovie/web', 'run', 'test:mutation:hotspots'],
];

function loadCandidates(fileOrDir: string): CandidateTest[] {
  if (!existsSync(fileOrDir)) {
    return [];
  }
  const stat = statSync(fileOrDir);
  const sourceFiles = stat.isDirectory()
    ? findFiles(fileOrDir, filePath => filePath.endsWith('.json'))
    : [fileOrDir];
  return sourceFiles.flatMap(filePath => {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return Array.isArray(parsed)
      ? (parsed as CandidateTest[])
      : [parsed as CandidateTest];
  });
}

function isAllowedCommand(command: CandidateCommand): boolean {
  return allowedArgvPrefixes.some(prefix =>
    prefix.every((part, index) => command.argv[index] === part)
  );
}

function executeCommand(
  repoRoot: string,
  command: CandidateCommand
): string | null {
  const cwd = command.cwd ? path.resolve(repoRoot, command.cwd) : repoRoot;
  const relativeCwd = path.relative(repoRoot, cwd);
  if (relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd)) {
    return `Command "${command.name}" uses cwd outside the repository root.`;
  }
  const result = spawnSync(command.argv[0], command.argv.slice(1), {
    cwd,
    stdio: 'inherit',
    shell: false,
    timeout: (command.timeoutSeconds ?? 300) * 1000,
  });
  if (result.status === 0) {
    return null;
  }
  return `Command "${command.name}" exited with ${result.status ?? 'unknown status'}.`;
}

function commandValidateCandidate(
  repoRoot: string,
  args: Record<string, string>
): void {
  const repo = normalizeRepoKey(args.repo);
  const profile = getManifest(repoRoot).repos[repo];
  const candidateInput = args.candidate
    ? resolveFromRoot(repoRoot, args.candidate)
    : path.join(repoRoot, '.agents/skills/nightly-test-agent/candidates');
  const execute = args.execute === 'true';
  const candidates = loadCandidates(candidateInput).filter(
    candidate => candidate.repo === repo
  );
  const results = candidates.map(candidate => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let executed = false;
    if (!candidate.id) errors.push('Missing id.');
    if (!candidate.targetFile) errors.push('Missing targetFile.');
    if (!candidate.sourceUnderTest) errors.push('Missing sourceUnderTest.');
    if (!candidate.rationale) errors.push('Missing rationale.');
    if (!candidate.expectedSignal?.kind)
      errors.push('Missing expectedSignal.kind.');
    if (!candidate.assertions || candidate.assertions.length === 0) {
      errors.push('Candidate must name at least one assertion.');
    }
    if (!candidate.commands || candidate.commands.length === 0) {
      errors.push('Candidate must name at least one validation command.');
    }
    for (const command of candidate.commands ?? []) {
      if (!isAllowedCommand(command)) {
        errors.push(`Command "${command.name}" is outside allowed prefixes.`);
      }
    }
    if (
      candidate.testType === 'e2e' &&
      candidate.expectedSignal.kind !== 'regression'
    ) {
      warnings.push(
        'E2E candidate should usually prove regression behavior, not generic coverage.'
      );
    }
    if (execute && errors.length === 0) {
      const reruns = Math.max(
        1,
        candidate.stabilityReruns ?? profile.generationPolicy.stabilityReruns
      );
      for (const command of candidate.commands) {
        const totalRuns = command.name.toLowerCase().includes('test')
          ? reruns
          : 1;
        for (let run = 0; run < totalRuns; run += 1) {
          executed = true;
          const error = executeCommand(repoRoot, command);
          if (error) {
            errors.push(error);
            break;
          }
        }
      }
    }
    return {
      id: candidate.id,
      keep: errors.length === 0,
      executed,
      errors,
      warnings,
    };
  });
  writeJson(path.join(outputDir(repoRoot, args), 'candidate-validation.json'), {
    generatedAt: new Date().toISOString(),
    repo,
    candidateInput,
    total: candidates.length,
    kept: results.filter(result => result.keep).length,
    results,
  });
  console.log(`Validated ${candidates.length} candidate(s).`);
  if (results.some(result => !result.keep)) {
    process.exitCode = 1;
  }
}

function loadJsonReports(inputDir: string): NormalizedRunReport[] {
  return findFiles(
    inputDir,
    filePath => path.basename(filePath) === 'normalized-results.json'
  ).map(filePath => readJson<NormalizedRunReport>(filePath));
}

function loadCandidateValidationReports(
  inputDir: string
): CandidateValidationReport[] {
  return findFiles(
    inputDir,
    filePath => path.basename(filePath) === 'candidate-validation.json'
  ).map(filePath => readJson<CandidateValidationReport>(filePath));
}

function loadSelectedTargets(inputDir: string): SelectedTarget[] {
  return findFiles(
    inputDir,
    filePath => path.basename(filePath) === 'selected-targets.json'
  ).flatMap(
    filePath =>
      readJson<{ selectedTargets?: SelectedTarget[] }>(filePath)
        .selectedTargets ?? []
  );
}

function commandEmitDelta(
  repoRoot: string,
  args: Record<string, string>
): void {
  const repo = normalizeRepoKey(args.repo);
  const dir = outputDir(repoRoot, args);
  const inputDir = args['input-dir']
    ? resolveFromRoot(repoRoot, args['input-dir'])
    : dir;
  const reports = loadJsonReports(inputDir);
  const candidateReports = loadCandidateValidationReports(inputDir);
  const selectedTargets = loadSelectedTargets(inputDir);
  const candidateSuites: SuiteSummary[] = candidateReports.map(report => ({
    lane: 'candidate-validation',
    total: report.total,
    passed: report.kept,
    failed: report.total - report.kept,
    flaky: 0,
    skipped: 0,
    durationMs: 0,
  }));
  const suites = [
    ...reports.flatMap(report => report.suites),
    ...candidateSuites,
  ];
  const failures = reports.flatMap(report => report.failures);
  const mutation = reports.find(report => report.mutation)?.mutation;
  writeJson(path.join(dir, 'skill-delta.json'), {
    generatedAt: new Date().toISOString(),
    repo,
    selectedTargets: selectedTargets.map(target => ({
      id: target.id,
      module: target.module,
      score: target.score,
      lanes: target.recommendedLanes,
    })),
    failures: failures.map(failure => ({
      testId: failure.testId,
      lane: failure.lane,
      file: failure.file,
      fingerprint: failure.fingerprint,
    })),
    mutation,
    candidateValidation: candidateReports.map(report => ({
      total: report.total,
      kept: report.kept,
      failed: report.total - report.kept,
      executed: report.results.filter(result => result.executed).length,
    })),
  });
  const suiteRows = suites.map(
    suite =>
      `| ${suite.lane} | ${suite.total} | ${suite.passed} | ${suite.failed} | ${suite.flaky} | ${suite.skipped} |`
  );
  const targetRows = selectedTargets.map(
    target =>
      `| ${target.module} | ${target.score.toFixed(2)} | ${target.recommendedLanes.join(', ')} |`
  );
  const failureRows = failures.slice(0, 20).map(failure => {
    const message = (failure.message ?? '').replaceAll('\n', ' ').slice(0, 140);
    return `| ${failure.lane} | ${failure.testId.replaceAll('|', '\\|')} | ${failure.file ?? ''} | ${message.replaceAll('|', '\\|')} |`;
  });
  const candidateRows = candidateReports.flatMap(report =>
    report.results.slice(0, 20).map(result => {
      const firstError = result.errors[0]?.replaceAll('|', '\\|') ?? '';
      return `| ${result.id.replaceAll('|', '\\|')} | ${result.keep ? 'kept' : 'rejected'} | ${result.executed ? 'yes' : 'no'} | ${firstError} |`;
    })
  );
  writeText(
    path.join(dir, 'nightly-report.md'),
    [
      '# Nightly Testing Agent Report',
      '',
      `Repo: ${repo}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Suites',
      '',
      '| Lane | Total | Passed | Failed | Flaky | Skipped |',
      '|---|---:|---:|---:|---:|---:|',
      ...(suiteRows.length > 0 ? suiteRows : ['| none | 0 | 0 | 0 | 0 | 0 |']),
      '',
      '## Selected Targets',
      '',
      '| Target | Score | Lanes |',
      '|---|---:|---|',
      ...(targetRows.length > 0 ? targetRows : ['| none | 0 | none |']),
      '',
      '## Candidate Validation',
      '',
      '| Candidate | Result | Executed | First Error |',
      '|---|---|---|---|',
      ...(candidateRows.length > 0
        ? candidateRows
        : ['| none | none | no | none |']),
      '',
      '## Failures',
      '',
      '| Lane | Test | File | Message |',
      '|---|---|---|---|',
      ...(failureRows.length > 0
        ? failureRows
        : ['| none | none | none | none |']),
      '',
    ].join('\n')
  );
  console.log('Wrote nightly report.');
}

function main(): void {
  const repoRoot = findRepoRoot();
  const argv = process.argv.slice(2).filter(arg => arg !== '--');
  const command = argv[0]?.startsWith('--')
    ? 'context'
    : (argv[0] ?? 'context');
  const args = parseArgs(argv.slice(command === argv[0] ? 1 : 0));
  if (command === 'context') commandContext(repoRoot, args);
  else if (command === 'select') commandSelect(repoRoot, args);
  else if (command === 'normalize') commandNormalize(repoRoot, args);
  else if (command === 'validate-candidate')
    commandValidateCandidate(repoRoot, args);
  else if (command === 'emit-delta') commandEmitDelta(repoRoot, args);
  else throw new Error(`Unknown nightly test-agent command: ${command}`);
}

main();
