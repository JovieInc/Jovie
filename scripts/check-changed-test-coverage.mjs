#!/usr/bin/env node
import { resolve } from 'node:path';
import {
  formatChangedLineCoverage,
  runChangedLineCoverageCheck,
} from './lib/changed-test-coverage.mjs';

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
}

try {
  const result = runChangedLineCoverageCheck({
    base: readArgument('--base'),
    head: readArgument('--head'),
    coveragePath: process.argv.includes('--coverage')
      ? resolve(readArgument('--coverage'))
      : undefined,
  });
  console.log(formatChangedLineCoverage(result));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
