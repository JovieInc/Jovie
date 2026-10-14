import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_PINNED_JOB_CONTEXTS } from '../merge-queue-guard.mjs';
import {
  ADVISORY_CHECK_NAMES,
  REQUIRED_CHECK_NAMES,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function readRepo(relativePath) {
  return readFileSync(`${repoRoot}/${relativePath}`, 'utf8');
}

describe('agent QC wire honesty (JOV-5235)', () => {
  const architecture = readRepo('docs/AGENT_OS_ARCHITECTURE.md');

  it('retires the Scope Judge producer and stops advertising a passed gate', () => {
    expect(architecture).toMatch(
      /github\.scope-judge.*retired|retired.*github\.scope-judge/i
    );
  });

  it('retires Slop Gate for the deterministic copy-gate ci-fast lane', () => {
    // @jovie/copy owns copy rules (canon/VOICE.md); the weekly Python smell
    // report is gone and its check names must never be pinned or required.
    expect(existsSync(join(repoRoot, '.github/workflows/slop-gate.yml'))).toBe(
      false
    );
    expect(readRepo('scripts/ci-fast-lanes.mjs')).toContain("id: 'copy-gate'");
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate (advisory)'
    );
    expect(REQUIRED_CHECK_NAMES.map(check => check.context)).not.toContain(
      'Slop Gate'
    );
    expect(ADVISORY_CHECK_NAMES).toContain('Slop Gate (advisory)');
    expect(FORBIDDEN_PINNED_JOB_CONTEXTS).toEqual(
      expect.arrayContaining(['Slop Gate (advisory)', 'Slop Gate'])
    );
  });
});
