#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  fetchOpenPrSummariesRest,
  hydrateOpenPrGraphqlMetadata,
} from './lib/github-open-prs-rest.mjs';

const execFileAsync = promisify(execFile);

export function parseArgs(argv) {
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

export async function ghJson(
  args,
  {
    retries = 5,
    stage = 'github-read',
    execute = execFileAsync,
    wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
  } = {}
) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { stdout } = await execute('gh', args, {
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
      if (!transient || attempt === retries) {
        throw Object.assign(
          new Error(detail.trim() || `GitHub request failed during ${stage}`),
          { cause: error, inventoryStage: stage }
        );
      }
      const delayMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
      console.error(
        `[gh-retry] stage=${stage} ${args.slice(0, 3).join(' ')} transient failure; retry ${attempt}/${retries} in ${delayMs}ms`
      );
      await wait(delayMs);
    }
  }
  throw new Error('unreachable');
}

export async function runOpenPrSnapshot(
  argv,
  {
    githubRequest = ghJson,
    write = value => process.stdout.write(`${value}\n`),
  } = {}
) {
  const options = parseArgs(argv);
  const summaries = await fetchOpenPrSummariesRest({
    repo: options.repo,
    limit: options.limit,
    request: endpoint =>
      githubRequest(['api', '--method', 'GET', endpoint], {
        stage: 'rest-enumeration',
      }),
  });
  const [owner, name] = options.repo.split('/');
  const prs = await hydrateOpenPrGraphqlMetadata({
    repo: options.repo,
    prs: summaries,
    batchSize: options.batchSize,
    request: ({ query }) =>
      githubRequest(
        [
          'api',
          'graphql',
          '-f',
          `query=${query}`,
          '-F',
          `owner=${owner}`,
          '-F',
          `name=${name}`,
        ],
        { stage: 'graphql-hydration' }
      ),
  });
  write(JSON.stringify(prs));
  return prs;
}

export function formatInventoryFailure(error) {
  const stage = error?.inventoryStage ?? 'snapshot-orchestration';
  const detail = error?.stderr || error?.message || String(error);
  return `::error title=open PR inventory failed::stage=${stage} ${String(detail).trim()}`;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runOpenPrSnapshot(process.argv.slice(2)).catch(error => {
    console.error(formatInventoryFailure(error));
    process.exitCode = 1;
  });
}
