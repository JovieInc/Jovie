#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const logPath = resolve(process.argv[2] ?? '');
const outputPath = process.argv[3] ? resolve(process.argv[3]) : undefined;

if (!process.argv[2]) {
  throw new Error(
    'Usage: verify-build-cache.mjs <second-build.log> [summary.json]'
  );
}

const log = readFileSync(logPath, 'utf8');
const dependencyHeader = log.match(
  /^(#\d+) \[prerequisites [^\]]+\] RUN pnpm config set store-dir \/opt\/jovie-pnpm-store.*$/m
);

if (!dependencyHeader) {
  throw new Error(
    'Second build log does not identify the lockfile-addressed dependency layer'
  );
}

const step = dependencyHeader[1];
if (!new RegExp(`^${step} CACHED$`, 'm').test(log)) {
  throw new Error(
    `Dependency layer ${step} was not restored from cache; refusing warm-image proof`
  );
}

if (!/^#\d+ importing cache manifest from gha:/m.test(log)) {
  throw new Error(
    'Second build did not import the persisted BuildKit cache manifest'
  );
}

const executedDependencyOutput = log
  .split('\n')
  .filter(line => line.startsWith(`${step} `))
  .filter(
    line =>
      line !== dependencyHeader[0] &&
      line !== `${step} CACHED` &&
      !/^#\d+ DONE /.test(line)
  );
if (executedDependencyOutput.length > 0) {
  throw new Error(
    `Dependency layer ${step} emitted execution/download output despite its cache claim:\n${executedDependencyOutput.join('\n')}`
  );
}

const summary = {
  schemaVersion: 1,
  cacheBackend: 'github-actions-buildkit-v2',
  dependencyStep: step,
  dependencyLayerCached: true,
  dependencyDownloadOutput: false,
};

const serialized = `${JSON.stringify(summary, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, serialized);
process.stdout.write(serialized);
