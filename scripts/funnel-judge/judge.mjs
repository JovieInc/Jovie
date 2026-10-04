// Persona judges for the funnel conversion scorer (JOV-7753). Judges run on
// the subscription `claude` CLI only; no raw model API keys.

import { spawn } from 'node:child_process';
import {
  buildJudgePrompt,
  buildJudgeSchema,
  parseJudgeOutput,
} from './rubric.mjs';

export const JUDGES = {
  primary: { id: 'opus-5.5', model: 'claude-opus-5-5', focus: 'full' },
  emotional: { id: 'fable-5.1', model: 'claude-fable-5-1', focus: 'emotional' },
};

/** CLI args: Read-only tools, no user/project settings or MCP, so repo hooks never run. */
export function buildClaudeArgs({ model, prompt, schema, imageDir }) {
  return [
    '-p',
    prompt,
    '--model',
    model,
    '--allowedTools',
    'Read',
    '--add-dir',
    imageDir,
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

/**
 * @param {{ persona: any, judge: { id: string, model: string, focus: 'full' | 'emotional' }, steps: Array<any>, imageDir: string, timeoutMs?: number }} args
 */
export async function judgePersona({
  persona,
  judge,
  steps,
  imageDir,
  timeoutMs = 600_000,
}) {
  const stepIds = steps.map(step => step.id);
  const args = buildClaudeArgs({
    model: judge.model,
    prompt: buildJudgePrompt(persona, steps, judge.focus),
    schema: buildJudgeSchema(stepIds),
    imageDir,
  });
  const stdout = await runClaude(args, imageDir, timeoutMs);
  const envelope = JSON.parse(stdout);
  if (envelope.is_error)
    throw new Error(`judge error: ${envelope.result ?? 'unknown'}`);
  const verdict = parseJudgeOutput(envelope.structured_output, stepIds);
  return {
    personaId: persona.id,
    judge: judge.id,
    model: judge.model,
    costUsd: envelope.total_cost_usd ?? null,
    ...verdict,
  };
}
