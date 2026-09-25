#!/usr/bin/env node
// Entry point for .github/workflows/pr-review.yml (shadow mode).
// Reads the PR through the GitHub API, fetches the exact base/head commits as
// data, runs the review and writes pr-review-receipt.json. Never posts.
//
// Env: PR_NUMBER, HEAD_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN (read-only),
//      PR_REVIEW_AI_GATEWAY_API_KEY, RISK_JSON (optional path), OUT (path).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { assembleReceipt } from '../lib/pr-review-contracts.mjs';
import { collectContext, runGit } from './context.mjs';
import {
  assertRoutes,
  createGatewayTransport,
  loadModelPrices,
  resolveRoutes,
} from './models.mjs';
import { runReview } from './run.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;

export function readRiskRuleIds(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const risk = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(risk.matchedRules)
      ? risk.matchedRules.map(rule => rule?.id).filter(Boolean)
      : [];
  } catch {
    return null;
  }
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`GitHub API ${response.status} for ${path}`);
  return response.json();
}

async function main() {
  const pr = Number(process.env.PR_NUMBER);
  const expectedHead = process.env.HEAD_SHA ?? '';
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  const out = process.env.OUT ?? 'pr-review-receipt.json';
  if (!Number.isInteger(pr) || pr < 1 || !SHA_RE.test(expectedHead) || !repo) {
    throw new Error('PR_NUMBER, HEAD_SHA and GITHUB_REPOSITORY are required');
  }

  const pull = await github(`/repos/${repo}/pulls/${pr}`, token);
  const compare = await github(
    `/repos/${repo}/compare/${pull.base.sha}...${expectedHead}`,
    token
  );
  const baseSha = compare.merge_base_commit?.sha ?? '';
  const readLiveHead = async () =>
    (await github(`/repos/${repo}/pulls/${pr}`, token)).head.sha;

  const write = receipt => {
    writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `pr-review: ${receipt.status} findings=${receipt.findings.length} usd=${receipt.spend.usd}\n`
    );
  };

  const apiKey = process.env.PR_REVIEW_AI_GATEWAY_API_KEY ?? '';
  if (pull.state !== 'open' || !apiKey.trim()) {
    write(
      assembleReceipt({
        pr,
        baseSha,
        headSha: expectedHead,
        liveHeadSha: pull.head.sha,
        failure: pull.state !== 'open' ? 'pr-not-open' : 'no-key',
      })
    );
    return;
  }

  // Fetch exact commits as data. The token is passed per command, not stored.
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  await runGit([
    '-c',
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`,
    'fetch',
    '--no-tags',
    '--depth=1',
    'origin',
    baseSha,
    expectedHead,
  ]);

  const prices = loadModelPrices();
  const routes = resolveRoutes(process.env);
  assertRoutes(prices, routes);
  const riskRuleIds = readRiskRuleIds(process.env.RISK_JSON);
  const context = await collectContext({ baseSha, headSha: expectedHead });
  if (riskRuleIds === null) context.truncated.push('risk-classification');
  const receipt = await runReview({
    pr,
    baseSha,
    headSha: expectedHead,
    riskRuleIds: riskRuleIds ?? [],
    context,
    transport: createGatewayTransport({ apiKey }),
    prices,
    routes,
    readLiveHead,
  });
  write(receipt);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    // Never echo raw provider errors or tokens.
    process.stderr.write(`pr-review: failed (${error?.name ?? 'Error'})\n`);
    process.exitCode = 1;
  });
}
