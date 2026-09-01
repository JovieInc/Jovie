#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  fetchOpenPrSummariesRest,
  hydrateOpenPrGraphqlMetadata,
} from './lib/github-open-prs-rest.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = { repo: 'JovieInc/Jovie', limit: 200, batchSize: 25 };
  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--repo':
        options.repo = argv[++index];
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--batch-size':
        options.batchSize = Number.parseInt(argv[++index], 10);
        break;
      default:
        throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!/^[^/]+\/[^/]+$/u.test(options.repo)) {
    throw new Error('--repo must be OWNER/NAME');
  }
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 500
  ) {
    throw new Error('--limit must be between 1 and 500');
  }
  if (
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 50
  ) {
    throw new Error('--batch-size must be between 1 and 50');
  }
  return options;
}

async function ghJson(args, { retries = 5 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        env: process.env,
      });
      return JSON.parse(stdout);
    } catch (error) {
      const detail = `${error?.stderr ?? ''}${error?.message ?? ''}`;
      const quotaExhausted =
        /API rate limit already exceeded for installation ID/iu.test(detail);
      const transient =
        !quotaExhausted &&
        /HTTP (429|502|503|504)|rate limit|timed out|timeout|couldn't respond|stream error|unexpected end of JSON|unexpected EOF|connection reset/iu.test(
          detail
        );
      if (!transient || attempt === retries) throw error;
      const delayMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
      console.error(
        `[gh-retry] ${args.slice(0, 3).join(' ')} transient failure; retry ${attempt}/${retries} in ${delayMs}ms`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summaries = await fetchOpenPrSummariesRest({
    repo: options.repo,
    limit: options.limit,
    request: endpoint => ghJson(['api', '--method', 'GET', endpoint]),
  });
  const [owner, name] = options.repo.split('/');
  const prs = await hydrateOpenPrGraphqlMetadata({
    repo: options.repo,
    prs: summaries,
    batchSize: options.batchSize,
    request: ({ query }) =>
      ghJson([
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
      ]),
  });
  process.stdout.write(`${JSON.stringify(prs)}\n`);
}

main().catch(error => {
  console.error(error?.stderr || error?.message || error);
  process.exitCode = 1;
});
