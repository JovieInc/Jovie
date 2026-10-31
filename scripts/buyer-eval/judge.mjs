// Strong tier: independent `claude -p` samples (subscription lane, no raw
// API keys, same transport family as scripts/funnel-judge). Each sample runs
// from the walk's frame directory with Read as its only tool, no settings,
// no MCP and no session persistence, so it sees the frames and nothing else.

import { spawn } from 'node:child_process';
import { buildClaudeArgs } from '../funnel-judge/judge.mjs';
import {
  buildBuyerPrompt,
  buildBuyerSchema,
  parseBuyerSample,
} from './rubric.mjs';

export const STRONG_MODEL = 'claude-opus-5-5';
export const DEFAULT_SAMPLES = 3;

/**
 * Words that exist only in company memory/docs, never in a walk or prompt.
 * Seeing one in a judge's output means context leaked in (review #7).
 */
export const CONTAMINATION_MARKERS = Object.freeze([
  '$300',
  '300/mo',
  'ovie',
  'summer',
  'gbrain',
  'premium pricing',
  'icp',
]);

export function contaminated(raw, prompt) {
  const out = JSON.stringify(raw ?? '').toLowerCase();
  const inPrompt = prompt.toLowerCase();
  const has = (text, word) =>
    new RegExp(
      `(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^a-z0-9])`,
      'u'
    ).test(text);
  return CONTAMINATION_MARKERS.filter(
    word => has(out, word) && !has(inPrompt, word)
  );
}

function runClaude(args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`judge timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      else resolve(stdout);
    });
  });
}

/**
 * Run N independent samples. A failed or contaminated sample is recorded and
 * excluded; aggregateSamples abstains when too few coherent samples remain.
 */
export async function judgeBuyer({
  persona,
  outcome,
  walk,
  samples = DEFAULT_SAMPLES,
  model = STRONG_MODEL,
  timeoutMs = 900_000,
  run = runClaude,
}) {
  // Tier A archetypes (and Tier B on a walk that is not their own) watch a
  // stand-in account; v1 counted the stand-in's small numbers as an objection.
  const prompt = buildBuyerPrompt({
    persona,
    outcome,
    steps: walk.steps,
    standIn: walk.subjectId !== persona.id,
  });
  const schema = buildBuyerSchema(walk.steps.map(step => step.stepId));
  const args = buildClaudeArgs({
    model,
    prompt,
    schema,
    imageDir: walk.frameDir,
  });
  const settled = await Promise.allSettled(
    Array.from({ length: samples }, () => run(args, walk.frameDir, timeoutMs))
  );
  const parsed = [];
  const failures = [];
  let costUsd = 0;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failures.push(
        String(result.reason?.message ?? result.reason).slice(0, 200)
      );
      continue;
    }
    try {
      const envelope = JSON.parse(result.value);
      costUsd += Number(envelope.total_cost_usd) || 0;
      if (envelope.is_error)
        throw new Error(String(envelope.result ?? 'judge error'));
      const leaks = contaminated(envelope.structured_output, prompt);
      if (leaks.length) throw new Error(`contaminated: ${leaks.join(',')}`);
      parsed.push(parseBuyerSample(envelope.structured_output, walk.steps));
    } catch (error) {
      failures.push(String(error?.message ?? error).slice(0, 200));
    }
  }
  return { model, samples: parsed, failures, costUsd };
}
