import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/linear-sync-on-merge.yml'
  ),
  'utf8'
);

function extractStepScript() {
  const match = WORKFLOW.match(
    /- name: Extract Linear issue marker[\s\S]*?\n {8}run: \|\n([\s\S]*?)\n\n {6}- name:/
  );
  if (!match) throw new Error('extract step not found');
  return match[1].replace(/^ {10}/gm, '');
}

function runExtract({ body, headRef = 'claude/some-branch' }) {
  const dir = mkdtempSync(join(tmpdir(), 'linear-sync-extract-'));
  const output = join(dir, 'output');
  try {
    const result = spawnSync('bash', ['-e', '-c', extractStepScript()], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        PR_BODY: body,
        HEAD_REF: headRef,
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: output,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    let text = '';
    try {
      text = readFileSync(output, 'utf8');
    } catch {
      text = '';
    }
    return Object.fromEntries(
      text
        .split('\n')
        .filter(Boolean)
        .map(line => line.split(/=(.*)/s).slice(0, 2))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('linear-sync-on-merge marker extraction', () => {
  it('keeps hyphenated identifiers and UUIDs intact', () => {
    const outputs = runExtract({
      body: [
        'Summary',
        '<!-- linear-issue-id:0f8b2c1e-7a4d-4e2b-9c3a-5d6e7f809a1b -->',
        '<!-- linear-issue-identifier:JOV-6604 -->',
      ].join('\n'),
    });
    expect(outputs).toMatchObject({
      has_linear_marker: 'true',
      issue_id: '0f8b2c1e-7a4d-4e2b-9c3a-5d6e7f809a1b',
      issue_identifier: 'JOV-6604',
    });
  });

  it('does not capture a comment terminator written without a space', () => {
    const outputs = runExtract({
      body: '<!-- linear-issue-identifier:JOV-12-->',
    });
    expect(outputs.issue_identifier).toBe('JOV-12');
  });

  it('falls back to the branch identifier when the body has no marker', () => {
    const outputs = runExtract({
      body: 'no marker here',
      headRef: 'itstimwhite/jov-1433-fix-thing',
    });
    expect(outputs).toMatchObject({
      has_linear_marker: 'true',
      issue_identifier: 'JOV-1433',
    });
  });

  it('skips when neither the body nor the branch names an issue', () => {
    expect(runExtract({ body: 'nothing' })).toEqual({
      has_linear_marker: 'false',
    });
  });
});
