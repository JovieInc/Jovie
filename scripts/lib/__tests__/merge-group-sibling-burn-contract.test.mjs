import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CI_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);
const SOURCE_VALIDATION = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/source-validation.yml'),
  'utf8'
);

function jobBlocks(workflow) {
  const blocks = new Map();
  const lines = workflow.split('\n');
  let key = null;
  let start = 0;
  const flush = end => {
    if (key) blocks.set(key, lines.slice(start, end).join('\n'));
  };
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^  ([a-zA-Z0-9_-]+):\s*$/);
    if (!match) continue;
    flush(index);
    key = match[1];
    start = index;
  }
  flush(lines.length);
  return blocks;
}

function jobNeeds(jobBlock) {
  const lines = jobBlock.split('\n');
  const start = lines.findIndex(line => /^    needs:/.test(line));
  expect(start, 'PR Ready is missing needs').toBeGreaterThanOrEqual(0);
  const inline = lines[start].match(/^    needs:\s*\[(.*)\]\s*$/);
  if (inline) {
    return inline[1]
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }
  const needs = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const item = lines[index].match(/^      - ([A-Za-z0-9_-]+)\s*$/);
    if (!item) break;
    needs.push(item[1]);
  }
  return needs;
}

function jobsNamed(blocks, pattern) {
  const keys = [];
  for (const [key, block] of blocks) {
    const name = block.match(/^    name:\s*(.+)\s*$/m);
    if (!name) continue;
    const value = name[1].replace(/^['"]|['"]$/g, '');
    if (pattern.test(value)) keys.push(key);
  }
  return keys;
}

describe('merge-group sibling burn', () => {
  it('In-flight sibling cancellation is still open because whole-run cancel is banned.', () => {
    const sourceJobs = jobBlocks(SOURCE_VALIDATION);
    const affected = jobsNamed(sourceJobs, /^Affected Unit Tests\b/);
    const sourceReady = jobsNamed(sourceJobs, /^PR Ready$/);
    expect(affected).toHaveLength(1);
    expect(sourceReady).toEqual(['ready']);
    expect(jobNeeds(sourceJobs.get(sourceReady[0]))).toEqual(
      expect.arrayContaining(affected)
    );

    const units = jobBlocks(CI_WORKFLOW).get('ci-unit-tests');
    expect(units).toContain(
      "fail-fast: ${{ github.event_name == 'merge_group' }}"
    );
    expect(units).not.toContain('fail-fast: false');

    const mergeReady = jobBlocks(CI_WORKFLOW).get('ci-merge-group-ready');
    expect(mergeReady).toContain(
      "if: ${{ always() && github.event_name == 'merge_group' }}"
    );
    const loopAt = mergeReady.indexOf('for selected_gate in');
    expect(loopAt).toBeGreaterThanOrEqual(0);
    const loop = mergeReady.slice(
      loopAt,
      mergeReady.indexOf('\n          done', loopAt)
    );
    for (const lane of [
      '"Web Unit Tests:$RUN_WEB:$UNIT_RESULT"',
      '"Web Build + Layout:$RUN_WEB:$BUILD_LAYOUT_RESULT"',
      '"Web Storybook Surface Matrix:$RUN_WEB:$STORYBOOK_SURFACES_RESULT"',
    ]) {
      expect(loop).toContain(lane);
    }
    const failIf =
      'if [[ "$selected" == "true" && "$result" != "success" ]]; then';
    const failAt = loop.indexOf(failIf);
    expect(failAt).toBeGreaterThanOrEqual(0);
    const failBody = loop.slice(
      failAt,
      loop.indexOf('\n            fi', failAt)
    );
    expect(failBody).toContain('exit 1');
    expect(failBody).not.toContain('exit 0');
  });
});
