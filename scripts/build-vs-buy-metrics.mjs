#!/usr/bin/env node
// Writes docs/metrics/build-vs-buy-latest.json (dependency count, maintained
// lines per domain, standing reinventions, waivers). Run by the daily Shipping
// SLO job; Summer reads the summary from the lanes status feed `slo` block.
// Usage: node scripts/build-vs-buy-metrics.mjs [--write] [--stdout]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './lib/build-vs-buy.mjs';
import { computeMetrics } from './lib/build-vs-buy-metrics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LATEST_PATH = resolve(
  root,
  'docs/metrics/build-vs-buy-latest.json'
);

export function collect(cwd = root) {
  const listed = spawnSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error('git ls-files failed');
  const paths = listed.stdout.split('\0').filter(Boolean);
  const read = path => {
    try {
      return readFileSync(resolve(cwd, path), 'utf8');
    } catch {
      return null;
    }
  };
  const manifests = paths
    .filter(path => /(?:^|\/)package\.json$/.test(path))
    .map(path => ({ path, text: read(path) }))
    .filter(entry => entry.text)
    .map(entry => ({ path: entry.path, json: JSON.parse(entry.text) }));
  const config = loadConfig();
  const files = paths
    .filter(path => config.codeExtensions.includes(path.split('.').pop()))
    .map(path => ({ path, text: read(path) }))
    .filter(entry => entry.text !== null);
  return computeMetrics({ manifests, files, config });
}

export function main(argv = process.argv.slice(2)) {
  const metrics = collect();
  const json = `${JSON.stringify(metrics, null, 2)}\n`;
  if (argv.includes('--write')) writeFileSync(LATEST_PATH, json);
  if (argv.includes('--stdout') || !argv.includes('--write'))
    process.stdout.write(json);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
