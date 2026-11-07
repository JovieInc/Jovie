import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../.github/workflows/company-guards.yml'
  ),
  'utf8'
);

describe('company-guards workflow contract', () => {
  it('reports in the merge queue so it can be a required check', () => {
    expect(WORKFLOW).toMatch(/merge_group:\n\s+types: \[checks_requested\]/);
    expect(WORKFLOW).toMatch(/^\s*pull_request:\s*$/m);
  });

  it('never skips the job in merge_group', () => {
    expect(WORKFLOW).not.toMatch(/^\s*paths(?:-ignore)?:/m);
    expect(WORKFLOW).not.toMatch(/^\s+if:/m);
  });

  it('holds no privileged secrets and only reads contents', () => {
    expect(WORKFLOW).not.toMatch(/secrets\.[A-Z0-9_]+|secrets:\s*inherit/);
    expect(WORKFLOW).not.toMatch(/: write/);
  });
});
