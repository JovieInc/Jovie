#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const NODE_TEST_FILES = JSON.parse(
  readFileSync(path.join(APP_ROOT, 'tests/node-test-files.manifest'), 'utf8')
).files as string[];

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function duplicates(values: readonly string[]): string[] {
  return sortedUnique(
    values.filter((value, index) => values.indexOf(value) !== index)
  );
}

export function parseListedFiles(output: string): string[] {
  return sortedUnique(
    output
      .split('\n')
      .map(line => line.trim())
      .filter(line => TEST_FILE_PATTERN.test(line))
      .map(line =>
        path.isAbsolute(line) ? path.relative(APP_ROOT, line) : line
      )
      .map(line => line.replaceAll(path.sep, '/'))
  );
}

export interface PartitionResult {
  readonly fastCount: number;
  readonly nodeCount: number;
  readonly domCount: number;
}

export function validatePartition(
  fastFiles: readonly string[],
  nodeFiles: readonly string[],
  domFiles: readonly string[],
  manifestFiles: readonly string[] = NODE_TEST_FILES
): PartitionResult {
  const fast = sortedUnique(fastFiles);
  const node = sortedUnique(nodeFiles);
  const dom = sortedUnique(domFiles);
  const manifest = sortedUnique(manifestFiles);
  const nodeSet = new Set(node);
  const domSet = new Set(dom);
  const union = sortedUnique([...node, ...dom]);
  const overlap = node.filter(file => domSet.has(file));
  const missing = fast.filter(file => !nodeSet.has(file) && !domSet.has(file));
  const extra = union.filter(file => !fast.includes(file));

  const errors = [
    node.length === 0 ? 'Node lane selected zero files.' : '',
    dom.length === 0 ? 'DOM lane selected zero files.' : '',
    duplicates(manifestFiles).length
      ? `Duplicate manifest entries: ${duplicates(manifestFiles).join(', ')}`
      : '',
    JSON.stringify(node) !== JSON.stringify(manifest)
      ? 'Node lane selection differs from the explicit manifest.'
      : '',
    overlap.length ? `Lane overlap: ${overlap.join(', ')}` : '',
    missing.length ? `Unassigned fast-suite files: ${missing.join(', ')}` : '',
    extra.length
      ? `Split-only files outside fast suite: ${extra.join(', ')}`
      : '',
    JSON.stringify(union) !== JSON.stringify(fast)
      ? 'Node and DOM union does not exactly match the fast suite.'
      : '',
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(errors.join('\n'));
  }

  return {
    fastCount: fast.length,
    nodeCount: node.length,
    domCount: dom.length,
  };
}

function listFiles(config: string): string[] {
  const output = execFileSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'list',
      `--config=${config}`,
      '--filesOnly',
      '--staticParse',
    ],
    { cwd: APP_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const files = parseListedFiles(output);
  if (files.length === 0) {
    throw new Error(`${config} selected zero test files.`);
  }
  return files;
}

export function runPartitionValidation(): PartitionResult {
  const result = validatePartition(
    listFiles('vitest.config.fast.mts'),
    listFiles('vitest.config.node.mts'),
    listFiles('vitest.config.dom.mts')
  );
  if (result.nodeCount < 150) {
    throw new Error(
      `Node lane requires at least 150 files; found ${result.nodeCount}.`
    );
  }
  return result;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const result = runPartitionValidation();
  console.log(
    `Vitest partition valid: ${result.fastCount} total = ${result.nodeCount} Node + ${result.domCount} DOM.`
  );
}
