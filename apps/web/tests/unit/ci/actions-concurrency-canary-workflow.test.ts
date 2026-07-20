import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const canaryPath = resolve(
  repoRoot,
  '.github/workflows/actions-concurrency-canary.yml'
);
const e2eMatrixPath = resolve(
  repoRoot,
  '.github/workflows/e2e-full-matrix.yml'
);

// Read as raw UTF-8. Do not parse YAML for `on:` — JS YAML libs coerce the
// key `on` to boolean true, which breaks trigger contract checks.
const canary = readFileSync(canaryPath, 'utf8');
const e2eMatrix = readFileSync(e2eMatrixPath, 'utf8');

function triggerBlock(source: string): string {
  const match = source.match(/on:\n(?<block>[\s\S]*?)\npermissions:/);
  expect(
    match?.groups?.block,
    'Missing on/permissions trigger block'
  ).toBeTruthy();
  return match?.groups?.block ?? '';
}

function extractMatrixSlots(source: string): number[] {
  const matrixMatch = source.match(/matrix:\n\s+slot:\n\s+\[([\s\S]*?)\]/);
  expect(matrixMatch?.[1], 'Missing matrix.slot list').toBeTruthy();
  const raw = matrixMatch?.[1] ?? '';
  const slots = [...raw.matchAll(/\b(\d+)\b/g)].map(match => Number(match[1]));
  return slots;
}

describe('actions concurrency canary workflow', () => {
  it('uses workflow_dispatch plus the temporary branch-only push trigger', () => {
    const triggers = triggerBlock(canary);

    expect(triggers).toContain('workflow_dispatch:');
    expect(triggers).toContain('push:');
    expect(triggers).toContain('branches:');
    expect(triggers).toContain('- ci/jov-4330-concurrency-120');
    expect(triggers).not.toContain('pull_request:');
    expect(triggers).not.toContain('schedule:');
    expect(triggers).not.toContain('- main');
  });

  it('scopes concurrency by run id without cancelling in-progress runs', () => {
    expect(canary).toContain(
      'group: actions-concurrency-canary-${{ github.run_id }}'
    );
    expect(canary).toContain('cancel-in-progress: false');
  });

  it('runs a 65-way ubuntu-latest matrix with max-parallel 65', () => {
    const slots = extractMatrixSlots(canary);
    const unique = new Set(slots);

    expect(slots).toHaveLength(65);
    expect(unique.size).toBe(65);
    expect(slots).toEqual(Array.from({ length: 65 }, (_, index) => index));
    expect(canary).toContain('runs-on: ubuntu-latest');
    expect(canary).toContain('max-parallel: 65');
    expect(canary).not.toContain('self-hosted');
  });

  it('emits index and timestamps with a bounded overlap sleep', () => {
    expect(canary).toContain('slot=${{ matrix.slot }}');
    expect(canary).toContain('start=');
    expect(canary).toContain('end=');
    expect(canary).toMatch(/sleep\s+(6[0-9]|7[0-9]|8[0-9]|90)\b/);
    // No checkout — pure concurrency probe.
    expect(canary).not.toContain('actions/checkout@');
  });

  it('keeps permissions read-only', () => {
    expect(canary).toContain('contents: read');
    expect(canary).not.toContain('contents: write');
  });
});

describe('e2e full matrix concurrency', () => {
  it('allows both GitHub-hosted browser jobs to run in parallel', () => {
    expect(e2eMatrix).toContain('runs-on: ubuntu-latest');
    expect(e2eMatrix).toContain('max-parallel: 2');
    expect(e2eMatrix).toContain(
      'Both GitHub-hosted browser jobs run concurrently'
    );
    expect(e2eMatrix).not.toMatch(/max-parallel:\s*1\b/);
    expect(e2eMatrix).not.toContain(
      'without occupying two self-hosted runners at once'
    );
  });
});
