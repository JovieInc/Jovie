#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_OUTPUT_FILES = new Set([
  'batches-latest.json',
  'sentry-issues-latest.json',
  'sonar-issues-latest.json',
]);

function assertRegularDirectory(path, label) {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${path}`);
  }
}

export function writeIssueOutputAtomic(
  fileName,
  contents,
  { root = process.cwd() } = {}
) {
  if (!ALLOWED_OUTPUT_FILES.has(fileName) || basename(fileName) !== fileName) {
    throw new Error(`unsupported issue output file: ${fileName}`);
  }

  const canonicalRoot = realpathSync(root);
  const webRoot = join(canonicalRoot, 'apps/web');
  assertRegularDirectory(webRoot, 'issue output parent');
  if (realpathSync(webRoot) !== webRoot) {
    throw new Error(`issue output parent escapes its owned path: ${webRoot}`);
  }

  const outputDir = join(webRoot, '.issues');
  try {
    assertRegularDirectory(outputDir, 'issue output directory');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    mkdirSync(outputDir, { recursive: false });
    assertRegularDirectory(outputDir, 'issue output directory');
  }
  if (realpathSync(outputDir) !== outputDir) {
    throw new Error(
      `issue output directory escapes its owned path: ${outputDir}`
    );
  }

  const outputPath = join(outputDir, fileName);
  const tempPath = join(
    outputDir,
    `.${fileName}.${process.pid}-${randomUUID()}.tmp`
  );
  if (dirname(tempPath) !== outputDir) {
    throw new Error('issue output temp file escapes its owned directory');
  }

  try {
    writeFileSync(tempPath, contents, { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, outputPath);
  } finally {
    rmSync(tempPath, { force: true });
  }

  return outputPath;
}

function main() {
  const [fileName] = process.argv.slice(2);
  if (!fileName) {
    throw new Error('usage: atomic-issue-output.mjs <stable-output-file>');
  }
  const outputPath = writeIssueOutputAtomic(
    fileName,
    readFileSync(process.stdin.fd, 'utf8')
  );
  console.log(outputPath);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) main();
