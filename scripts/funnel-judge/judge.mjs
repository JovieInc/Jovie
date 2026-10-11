// Persona judges for the funnel conversion scorer (JOV-7753). Judges run on
// the subscription `claude` CLI only; no raw model API keys.

import { spawn } from 'node:child_process';
import {
  buildScreenPrompt,
  buildScreenSchema,
  parseScreenOutput,
  SCREEN_RUBRIC_VERSION,
} from './coherence-screen.mjs';
import {
  buildCoherencePrompt,
  buildCoherenceSchema,
  buildJudgePrompt,
  buildJudgeSchema,
  parseCoherenceOutput,
  parseJudgeOutput,
} from './rubric.mjs';

export const JUDGES = {
  primary: { id: 'opus-5.5', model: 'claude-opus-5-5', focus: 'full' },
  emotional: { id: 'fable-5.1', model: 'claude-fable-5-1', focus: 'emotional' },
  coherence: { id: 'opus-5.5-coherence', model: 'claude-opus-5-5' },
};

/** CLI args (imageDir may list several directories): Read-only tools, no user/project settings or MCP, so repo hooks never run. */
export function buildClaudeArgs({ model, prompt, schema, imageDir }) {
  return [
    '-p',
    prompt,
    '--model',
    model,
    '--allowedTools',
    'Read',
    '--add-dir',
    ...(Array.isArray(imageDir) ? imageDir : [imageDir]),
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
  ];
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
      reject(new Error(`claude judge timed out after ${timeoutMs}ms`));
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
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 400)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function runJudge(args, cwd, timeoutMs) {
  const envelope = JSON.parse(await runClaude(args, cwd, timeoutMs));
  if (envelope.is_error)
    throw new Error(`judge error: ${envelope.result ?? 'unknown'}`);
  return envelope;
}

/**
 * @param {{ persona: any, judge: { id: string, model: string, focus: 'full' | 'emotional' }, steps: Array<any>, objections?: Array<{ objection: string }>, imageDir: string, timeoutMs?: number }} args
 */
export async function judgePersona({
  persona,
  judge,
  steps,
  objections = [],
  imageDir,
  timeoutMs = 600_000,
}) {
  const stepIds = steps.map(step => step.id);
  const args = buildClaudeArgs({
    model: judge.model,
    prompt: buildJudgePrompt(persona, steps, judge.focus, objections),
    schema: buildJudgeSchema(stepIds, objections.length),
    imageDir,
  });
  const envelope = await runJudge(args, imageDir, timeoutMs);
  const verdict = parseJudgeOutput(
    envelope.structured_output,
    stepIds,
    objections.length
  );
  return {
    personaId: persona.id,
    judge: judge.id,
    model: judge.model,
    costUsd: envelope.total_cost_usd ?? null,
    ...verdict,
  };
}

/**
 * Coherence judge. One entry point, two modes:
 * - 'sequence' (default): one run over the ordered funnel steps that scores
 *   every step-to-step hand-off ({ transitions, story }).
 * - 'screen': one run that scores each screen on intent, continuity,
 *   subtraction, seams and inevitability, with located findings
 *   ({ screens }). Gate with evaluateScreenCoherence.
 *
 * @param {{ mode?: 'sequence' | 'screen', steps?: Array<any>, screens?: Array<import('./coherence-screen.mjs').ScreenInput>, imageDir: string | string[], timeoutMs?: number }} args
 */
export async function judgeCoherence({
  mode = 'sequence',
  steps = [],
  screens = [],
  imageDir,
  timeoutMs = 600_000,
}) {
  const judge = JUDGES.coherence;
  if (mode === 'screen') {
    const screenIds = screens.map(screen => screen.id);
    const envelope = await runJudge(
      buildClaudeArgs({
        model: judge.model,
        prompt: buildScreenPrompt(screens),
        schema: buildScreenSchema(screenIds),
        imageDir,
      }),
      Array.isArray(imageDir) ? imageDir[0] : imageDir,
      timeoutMs
    );
    return {
      mode,
      rubric: SCREEN_RUBRIC_VERSION,
      judge: judge.id,
      model: judge.model,
      costUsd: envelope.total_cost_usd ?? null,
      ...parseScreenOutput(envelope.structured_output, screenIds),
    };
  }

  const stepIds = steps.map(step => step.id);
  const envelope = await runJudge(
    buildClaudeArgs({
      model: judge.model,
      prompt: buildCoherencePrompt(steps),
      schema: buildCoherenceSchema(stepIds),
      imageDir,
    }),
    Array.isArray(imageDir) ? imageDir[0] : imageDir,
    timeoutMs
  );
  return {
    mode,
    judge: judge.id,
    model: judge.model,
    costUsd: envelope.total_cost_usd ?? null,
    ...parseCoherenceOutput(envelope.structured_output, stepIds),
  };
}
