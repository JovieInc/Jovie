#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import {
  analyzePrCommentData,
  DEFAULT_PR_LIMIT,
  DEFAULT_SINCE_DAYS,
  fetchRecentPrCommentData,
  renderMarkdownReport,
} from './lib/pr-comment-analysis.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const data = args.fixture
  ? JSON.parse(readFileSync(args.fixture, 'utf8'))
  : fetchRecentPrCommentData({
      repo: args.repo,
      sinceDays: args.sinceDays,
      limit: args.limit,
    });

const analysis = analyzePrCommentData(data);
const markdown = renderMarkdownReport(analysis);

if (args.jsonOut && !args.dryRun) {
  writeFileSync(args.jsonOut, `${JSON.stringify(analysis, null, 2)}\n`);
}

if (args.markdownOut && !args.dryRun) {
  writeFileSync(args.markdownOut, markdown);
}

if (args.dryRun) {
  console.log('[dry-run] No files written and no PR/Linear actions attempted.');
}

if (!args.jsonOut || args.dryRun) {
  console.log(markdown);
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    fixture: '',
    help: false,
    jsonOut: '',
    limit: DEFAULT_PR_LIMIT,
    markdownOut: '',
    repo: '',
    sinceDays: DEFAULT_SINCE_DAYS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];

    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--fixture') parsed.fixture = next();
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json-out') parsed.jsonOut = next();
    else if (arg === '--limit') parsed.limit = Number(next());
    else if (arg === '--markdown-out') parsed.markdownOut = next();
    else if (arg === '--repo') parsed.repo = next();
    else if (arg === '--since-days') parsed.sinceDays = Number(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.limit) || parsed.limit <= 0) {
    throw new Error('--limit must be a positive number');
  }
  if (!Number.isFinite(parsed.sinceDays) || parsed.sinceDays <= 0) {
    throw new Error('--since-days must be a positive number');
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/pr-comment-retro.mjs [options]

Options:
  --repo <owner/name>        GitHub repo. Defaults to gh repo view.
  --since-days <days>       Lookback window. Default: ${DEFAULT_SINCE_DAYS}.
  --limit <count>           Maximum recent PRs to scan. Default: ${DEFAULT_PR_LIMIT}.
  --fixture <path>          Read a captured PR-comment fixture instead of GitHub.
  --json-out <path>         Write structured analysis JSON.
  --markdown-out <path>     Write markdown report.
  --dry-run                 Do not write files or attempt follow-up actions.
  --help                    Show this help.
`);
}
