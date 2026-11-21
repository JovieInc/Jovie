import { expect } from 'vitest';

/** Slice one named step from a workflow YAML document. */
export function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) break;

    if (index > start && line.startsWith('      - name: ')) break;
    if (index > start && /^[a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
}

/** Slice one top-level job from a workflow YAML document. */
export function getJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);

  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) break;

    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
}

/** Collect every `run:` block (scalar or multiline) from a workflow. */
export function getShellRunBlocks(workflow: string): string[] {
  const lines = workflow.split('\n');
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    const match = /^(\s*)run:\s*(.*)$/.exec(line);
    if (!match) continue;
    const indentGroup = match[1];
    const runBody = match[2];
    if (indentGroup === undefined || runBody === undefined) continue;
    const indentation = indentGroup.length;
    const block = [runBody];
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      if (next === undefined) break;
      if (next.trim() && next.search(/\S/) <= indentation) break;
      block.push(next);
      index += 1;
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

/** Body of a multiline `run: |` step, de-indented. */
export function getStepRunScript(step: string): string {
  const lines = step.split('\n');
  const run = lines.findIndex(line => /^\s+run:\s*\|\s*$/.test(line));

  expect(run, 'Missing multiline run script').toBeGreaterThanOrEqual(0);

  const body = lines.slice(run + 1);
  const indentation = Math.min(
    ...body.filter(line => line.trim()).map(line => line.search(/\S/))
  );
  return body
    .map(line => (line.trim() ? line.slice(indentation) : ''))
    .join('\n');
}
