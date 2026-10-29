#!/usr/bin/env tsx
/**
 * Regenerates apps/web/lib/agent-distribution/generated from the live agent MCP
 * registry. `--check` exits 1 on drift. Generates files only; submits nothing.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_DRAFT_TOOLS } from '@/lib/agent-acquisition/api';
import {
  buildDistribution,
  REGENERATE_COMMAND,
} from '@/lib/agent-distribution/generate';
import { LISTING } from '@/lib/agent-distribution/listing';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const GENERATED_DIR = join(WEB, 'lib/agent-distribution/generated');
const ASSET_SOURCE = join(WEB, 'plugins/jovie-artists/assets');
const ASSET_NAMES = ['icon.svg', 'icon-dark.svg', 'logo.svg', 'logo-dark.svg'];

async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

export async function renderDistribution() {
  const assets: Record<string, string> = {};
  for (const name of ASSET_NAMES)
    assets[name] = await readFile(join(ASSET_SOURCE, name), 'utf8');
  return buildDistribution(AGENT_DRAFT_TOOLS, LISTING, assets);
}

async function main() {
  const check = process.argv.includes('--check');
  const strict = process.argv.includes('--strict');
  const { files, issues } = await renderDistribution();
  for (const error of issues.errors) console.error(`ERROR ${error}`);
  for (const blocker of issues.blockers) console.warn(`BLOCKER ${blocker}`);
  if (issues.errors.length) process.exit(1);
  if (strict && issues.blockers.length) process.exit(1);
  // PNG icons are committed binaries; every other file is generated text.
  const textPaths = new Set(Object.keys(files));
  const existing = (await walk(GENERATED_DIR))
    .map(p => relative(GENERATED_DIR, p))
    .filter(p => !p.endsWith('.png'));
  if (check) {
    const drift: string[] = [];
    for (const [path, content] of Object.entries(files)) {
      const current = existsSync(join(GENERATED_DIR, path))
        ? await readFile(join(GENERATED_DIR, path), 'utf8')
        : null;
      if (current !== content) drift.push(path);
    }
    drift.push(...existing.filter(p => !textPaths.has(p)));
    if (drift.length) {
      console.error(`Drift in ${drift.join(', ')}. Run: ${REGENERATE_COMMAND}`);
      process.exit(1);
    }
    return;
  }
  for (const stale of existing.filter(p => !textPaths.has(p)))
    await rm(join(GENERATED_DIR, stale));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(GENERATED_DIR, path)), { recursive: true });
    await writeFile(join(GENERATED_DIR, path), content);
  }
  console.log(`Wrote ${textPaths.size} files to ${GENERATED_DIR}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main();
