#!/usr/bin/env node
/**
 * Local Company Guards size ratchet.
 *
 * Mirrors JovieInc/ci guards/size.mjs at the pin in
 * .github/workflows/company-guards.yml (`ci-ref`). The hosted job copies
 * scripts/company-guards/size-baseline.json and fails when a tracked source
 * file is over 500 lines and either unbaselined or larger than its ceiling.
 * Publication and affected pushes run this first so that growth fails here
 * instead of as another Company Guards round.
 *
 * There is no --update. The baseline only shrinks through a reviewed edit.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LIMIT = 500;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|swift|ex|exs|sh|rb|go|rs)$/;
const SKIP =
  /(^|\/)(node_modules|vendor|dist|build|\.next|Pods)\/|\.gen\.|\.generated\.|\.min\.|\.d\.ts$|lock/;

/** Same trailing-newline count the pinned checker uses (matches `wc -l`). */
export function lineCount(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/**
 * @param {readonly string[]} files repo-relative paths
 * @param {(file: string) => string | null} read
 * @returns {Record<string, number>} files over LIMIT
 */
export function measure(files, read) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const file of files) {
    if (!CODE.test(file) || SKIP.test(file)) continue;
    const text = read(file);
    if (text == null) continue;
    const lines = lineCount(text);
    if (lines > LIMIT) out[file] = lines;
  }
  return out;
}

/**
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @returns {string[]}
 */
export function compare(current, baseline) {
  const fails = [];
  for (const [file, lines] of Object.entries(current)) {
    if (!(file in baseline)) {
      fails.push(`${file}: ${lines} lines, over ${LIMIT} and not baselined`);
    } else if (lines > baseline[file]) {
      fails.push(`${file}: grew ${baseline[file]} -> ${lines}`);
    }
  }
  return fails;
}

/** @param {string} [cwd] */
export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/** @param {string} root */
export function baselineFile(root) {
  return join(root, 'scripts/company-guards/size-baseline.json');
}

/**
 * @param {{ cwd?: string }} [options]
 * @returns {{ fails: string[], count: number }}
 */
export function run({ cwd = process.cwd() } = {}) {
  const root = repoRoot(cwd);
  const files = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const current = measure(files, file => {
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch {
      return null;
    }
  });
  const path = baselineFile(root);
  const baseline = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {};
  return {
    fails: compare(current, baseline),
    count: Object.keys(current).length,
  };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

function main() {
  if (process.argv.includes('--update')) {
    console.error(
      'size-500: --update is refused; edit the baseline only to shrink it'
    );
    process.exit(2);
  }
  const result = run();
  for (const fail of result.fails) console.error(`size-500: ${fail}`);
  console.log(`size-500: ${result.count} oversize file(s) baselined/seen`);
  if (result.fails.length) process.exit(1);
}

if (invokedDirectly()) main();
