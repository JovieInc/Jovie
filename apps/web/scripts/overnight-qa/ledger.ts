import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OvernightIssue,
  OvernightPaths,
  OvernightRunState,
  SweepResult,
} from './types';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..', '..');

export function getOvernightPaths(): OvernightPaths {
  const controllerRoot = resolve(REPO_ROOT, '.context', 'overnight-qa');

  return {
    controllerRoot,
    runsRoot: resolve(controllerRoot, 'runs'),
    statePath: resolve(controllerRoot, 'state.json'),
    queuePath: resolve(controllerRoot, 'issue-queue.json'),
    stopPath: resolve(controllerRoot, 'STOP'),
  };
}

export function buildRunId(now = new Date()): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '-');
}

export function buildDefaultRunState(runId: string): OvernightRunState {
  return {
    runId,
    status: 'running',
    currentIssue: null,
    currentBranch: null,
    mergedFixCount: 0,
    lastPrUrl: null,
    lastDeploySha: null,
    stopReason: null,
    activeRunDir: null,
    queuedIssueKeys: [],
    issueHistory: {},
    consecutiveCiFailures: 0,
    consecutiveUnfixableIssues: 0,
  };
}

export async function ensureOvernightPaths(paths = getOvernightPaths()) {
  await mkdir(paths.controllerRoot, { recursive: true });
  await mkdir(paths.runsRoot, { recursive: true });
  return paths;
}

export function getRunDirectory(runId: string, paths = getOvernightPaths()) {
  return resolve(paths.runsRoot, runId);
}

export async function ensureRunDirectory(
  runId: string,
  paths = getOvernightPaths()
) {
  const runDir = getRunDirectory(runId, paths);
  await mkdir(resolve(runDir, 'logs'), { recursive: true });
  await mkdir(resolve(runDir, 'reports'), { recursive: true });
  await mkdir(resolve(runDir, 'prompts'), { recursive: true });
  return runDir;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function readState(
  paths = getOvernightPaths()
): Promise<OvernightRunState | null> {
  return await readJsonFile<OvernightRunState>(paths.statePath);
}

export async function writeState(
  state: OvernightRunState,
  paths = getOvernightPaths()
) {
  await writeJsonFile(paths.statePath, state);
}

export async function readIssueQueue(
  paths = getOvernightPaths()
): Promise<readonly OvernightIssue[]> {
  return (await readJsonFile<readonly OvernightIssue[]>(paths.queuePath)) ?? [];
}

export async function writeIssueQueue(
  issues: readonly OvernightIssue[],
  paths = getOvernightPaths()
) {
  await writeJsonFile(paths.queuePath, issues);
}

export async function writeSweepSummary(runDir: string, result: SweepResult) {
  await writeJsonFile(resolve(runDir, 'reports', 'sweep-summary.json'), result);
}

export async function appendRunEvent(
  runDir: string,
  eventType: string,
  payload: unknown
) {
  const eventPath = resolve(runDir, 'events.jsonl');
  const line = JSON.stringify({
    eventType,
    ts: new Date().toISOString(),
    payload,
  });
  await mkdir(dirname(eventPath), { recursive: true });
  await writeFile(eventPath, `${line}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
}

export function shouldStop(paths = getOvernightPaths()) {
  return existsSync(paths.stopPath);
}

export async function writePromptArtifact(
  runDir: string,
  fileName: string,
  contents: string
) {
  const promptPath = resolve(runDir, 'prompts', fileName);
  await mkdir(dirname(promptPath), { recursive: true });
  await writeFile(promptPath, contents, 'utf8');
  return promptPath;
}

export function repoRoot() {
  return REPO_ROOT;
}
