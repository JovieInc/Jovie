import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { AGENT_DRAFT_TOOLS } from '@/lib/agent-acquisition/api';
import {
  buildDistribution,
  type DistributionOutput,
  type DistributionTool,
  REGENERATE_COMMAND,
} from './generate';
import { loadIconSource } from './icons';
import { LISTING } from './listing';
import { readReadinessInputs } from './readiness-io';

const ASSET_NAMES = ['icon.svg', 'icon-dark.svg', 'logo.svg', 'logo-dark.svg'];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return [];
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

export async function renderDistribution(
  assetDir: string,
  tools: readonly DistributionTool[] = AGENT_DRAFT_TOOLS as unknown as readonly DistributionTool[],
  repoRoot: string = resolve(assetDir, '../../../../..')
): Promise<DistributionOutput> {
  const webDir = resolve(assetDir, '../../..');
  const assets: Record<string, string> = {};
  for (const name of ASSET_NAMES)
    assets[name] = await readFile(join(assetDir, name), 'utf8');
  const iconSource = await loadIconSource(repoRoot);
  return buildDistribution(
    tools,
    LISTING,
    assets,
    await readReadinessInputs(webDir),
    iconSource?.info ?? null
  );
}

/** Paths whose committed content differs from `files`, plus committed files the generator no longer emits. */
export async function findDrift(
  dir: string,
  files: Record<string, string>
): Promise<string[]> {
  const drift: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    const file = join(dir, path);
    const current = await readFile(file, 'utf8').catch(() => null);
    if (current !== content) drift.push(path);
  }
  const existing = (await walk(dir)).map(p => relative(dir, p));
  drift.push(...existing.filter(p => !(p in files)));
  return drift;
}

export async function writeDistribution(
  dir: string,
  files: Record<string, string>
): Promise<void> {
  const existing = (await walk(dir)).map(p => relative(dir, p));
  for (const stale of existing.filter(p => !(p in files)))
    await rm(join(dir, stale));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
}

export interface GenerateOptions {
  readonly check: boolean;
  readonly strict: boolean;
  readonly dir: string;
  readonly output: DistributionOutput;
  readonly log: (line: string) => void;
}

/** Returns the process exit code. */
export async function runGenerate(options: GenerateOptions): Promise<number> {
  const { files, issues } = options.output;
  for (const error of issues.errors) options.log(`ERROR ${error}`);
  for (const blocker of issues.blockers) options.log(`BLOCKER ${blocker}`);
  if (issues.errors.length) return 1;
  if (options.strict && issues.blockers.length) return 1;
  if (options.check) {
    const drift = await findDrift(options.dir, files);
    if (drift.length) {
      options.log(`Drift in ${drift.join(', ')}. Run: ${REGENERATE_COMMAND}`);
      return 1;
    }
    return 0;
  }
  await writeDistribution(options.dir, files);
  options.log(`Wrote ${Object.keys(files).length} files to ${options.dir}`);
  return 0;
}
