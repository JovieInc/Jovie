#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  evaluateLearningPromotion,
  parseLearningReceiptMarker,
} from './lib/rolling-ci-learning.mjs';

export function evaluateLearningGateInput(input) {
  const comments = Array.isArray(input?.learningComments)
    ? input.learningComments
    : [];
  const markerReceipts = comments
    .map(parseLearningReceiptMarker)
    .filter(Boolean);
  const explicitReceipts = Array.isArray(input?.receipts) ? input.receipts : [];
  return evaluateLearningPromotion({
    repairedFailures: input?.repairedFailures,
    receipts: [...markerReceipts, ...explicitReceipts],
    liveHead: input?.liveHead,
  });
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const result = evaluateLearningGateInput(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.complete) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
