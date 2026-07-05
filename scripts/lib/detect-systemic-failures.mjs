#!/usr/bin/env node
import { detectSystemicFailures } from './pr-check-failures.mjs';

function parseArgs(argv) {
  const options = {
    repo: process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie',
    pr: null,
    threshold: 3,
    limit: 200,
    format: 'github-output',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo':
        options.repo = argv[++index];
        break;
      case '--pr':
        options.pr = Number.parseInt(argv[++index], 10);
        break;
      case '--threshold':
        options.threshold = Number.parseInt(argv[++index], 10);
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--json':
        options.format = 'json';
        break;
      case '--help':
      case '-h':
        console.log(
          'Usage: node scripts/lib/detect-systemic-failures.mjs --pr <number> [--repo OWNER/REPO] [--threshold N] [--limit N] [--json]'
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.pr) || options.pr < 1) {
    throw new Error('--pr is required and must be a positive integer');
  }
  if (!Number.isInteger(options.threshold) || options.threshold < 2) {
    throw new Error('--threshold must be an integer >= 2');
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await detectSystemicFailures(options.repo, options.pr, {
    threshold: options.threshold,
    limit: options.limit,
  });

  const systemicSummary = result.checks
    .map(({ check, count }) => `${check} (failing on ${count} PRs)`)
    .join('; ');

  if (options.format === 'json') {
    console.log(
      JSON.stringify({
        is_systemic: result.isSystemic,
        systemic_checks: systemicSummary,
        checks: result.checks,
        fail_count_by_check: result.failCountByCheck,
      })
    );
    return;
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  const write = line => {
    if (outputPath) {
      console.log(line);
    } else {
      console.log(line.replace(/^([^=]+)=/, '$1: '));
    }
  };

  write(`is_systemic=${result.isSystemic}`);
  write(`systemic_checks=${systemicSummary}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
