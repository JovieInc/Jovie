import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CANONICAL_PEN } from './pen-bridge.mjs';

export function fixPrompt(frame, issue, brief) {
  return [
    `You are the Pen fixer in Jovie's PROPOSAL review loop. Fix exactly one issue in one frame of the live Pen canvas "${CANONICAL_PEN}" using the pencil MCP execute tool.`,
    `Frame: ${frame.id} "${frame.name}". Mission of the screen: ${brief.mission}. Audience: ${brief.audience}.`,
    `Top issue (${issue.source}/${issue.check}): ${issue.message}${issue.fix ? `\nSuggested fix: ${issue.fix}` : ''}${issue.element ? `\nElement: ${issue.element}` : ''}`,
    issue.nodes?.length
      ? `Nodes: ${issue.nodes.join(', ')}\nDetail: ${JSON.stringify(issue.detail ?? []).slice(0, 2500)}`
      : '',
    'Rules: edit only nodes inside this frame (never a reusable component master, never another frame, never variables). Use the existing $tokens for colour, type size and radius; spacing on the 4px grid; whole-pixel geometry; one content axis; one filled primary action per screen; sentence-case, plain copy with no em dashes. Keep the design language; do not redesign the screen.',
    'Read the frame first (Get with depth or a visitor), make the smallest change that fixes the issue everywhere it applies, then confirm it with a Get visitor (ctx.bounds, ctx.problems). Do not use TakeScreenshot: the app raster output is unreliable and the loop re-renders out of process. Never add a second filled button, never remove the only actions of a state (that makes a dead end), never hide or edit the shared app shell (sidebar, header), and never add numbers that are not already on the frame. Do not save, do not open or switch documents. Reply with one line saying what you changed.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Model per issue (2026-11-02): mechanical findings (grid, contrast, tokens,
 * copy lint) go to the cheap fixer; judge and Clef-gate issues are taste calls
 * where a wrong fix is expensive (a Sonnet fixer added a second primary and
 * dropped the only actions from a held-state card), so they go to Opus.
 */
export function fixerModel(issue, env = process.env) {
  const taste = issue?.source === 'judge' || issue?.source === 'clef-gate';
  return taste
    ? env.PEN_REVIEW_TASTE_FIXER_MODEL || 'opus'
    : env.PEN_REVIEW_FIXER_MODEL || 'sonnet';
}

/** @param {string} prompt @param {{timeoutMs?: number, model?: string}} [opts] */
export function runFixerAgent(
  prompt,
  { timeoutMs = 12 * 60_000, model = fixerModel(null) } = {}
) {
  const cwd = mkdtempSync(join(tmpdir(), 'pen-fixer-'));
  const res = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      model,
      '--allowedTools',
      'mcp__pencil__execute,mcp__pencil__get_app_state,mcp__pencil__read_skill',
    ],
    { cwd, encoding: 'utf8', timeout: timeoutMs }
  );
  return {
    status: res.status,
    out: String(res.stdout ?? '')
      .trim()
      .slice(-600),
    err: String(res.stderr ?? '')
      .trim()
      .slice(-300),
  };
}
