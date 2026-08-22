#!/usr/bin/env node
import { parseRollingCiState } from './lib/rolling-ci-dispatch.mjs';
import {
  parseLearningReceipt,
  rollingCiLoopComplete,
} from './lib/rolling-ci-handoff.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const state = parseRollingCiState(input.dispatchComment);
const hadFailure = Boolean(state && Object.keys(state.failures ?? {}).length);
const learning = parseLearningReceipt(input.learningComment);
const complete =
  !hadFailure ||
  rollingCiLoopComplete({ receipt: learning, liveHead: input.head });

process.stdout.write(
  `${JSON.stringify({ complete, hadFailure, reason: complete ? null : 'exact-head learning receipt required' })}\n`
);
if (!complete) process.exitCode = 1;
