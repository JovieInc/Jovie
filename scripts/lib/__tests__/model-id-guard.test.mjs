import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  countIn,
  RATCHET_PATH,
  scannable,
  tighten,
  violations,
} from '../../model-id-guard.mjs';

const read = path =>
  JSON.parse(
    readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
  );

describe('model-id-guard', () => {
  it('counts concrete ids, with or without a provider prefix, and ignores variants of other names', () => {
    expect(
      countIn("a 'openai/gpt-6.1-sol' b gpt-6-astra c gpt-5.6-luna-high")
    ).toBe(3);
    expect(countIn('gpt-reserve codex-sol gpt-4o')).toBe(0);
  });

  it('does not scan the registries, tests, docs or generated canon', () => {
    expect(scannable('ops/registry/capacity.json')).toBe(false);
    expect(
      scannable('scripts/backlog-orchestrator/config/model-registry.json')
    ).toBe(false);
    expect(scannable('scripts/lanes/model_families.py')).toBe(false);
    expect(scannable('scripts/lib/__tests__/x.test.mjs')).toBe(false);
    expect(scannable('canon/CAPACITY.md')).toBe(false);
    expect(scannable('docs/a.md')).toBe(false);
    expect(scannable('scripts/lanes/lane_runner.py')).toBe(true);
    expect(scannable('apps/web/data/marketing/modelRoles.ts')).toBe(true);
  });

  it('fails a new site and an added id in a grandfathered file, passes a smaller count', () => {
    const ratchet = { 'a.ts': 2 };
    expect(violations({ 'b.py': 1 }, ratchet)).toEqual([
      { file: 'b.py', found: 1, allowed: 0 },
    ]);
    expect(violations({ 'a.ts': 3 }, ratchet)).toHaveLength(1);
    expect(violations({ 'a.ts': 1 }, ratchet)).toEqual([]);
  });

  it('only ever tightens the ratchet', () => {
    expect(
      tighten({ 'a.ts': 1, 'new.ts': 9 }, { 'a.ts': 2, 'gone.ts': 1 })
    ).toEqual({ 'a.ts': 1 });
  });

  it('keeps the checked-in ratchet well formed', () => {
    const ratchet = read(RATCHET_PATH);
    expect(ratchet.schema).toBe('jovie.model-id-guard-ratchet/v1');
    for (const n of Object.values(ratchet.entries))
      expect(n).toBeGreaterThan(0);
  });
});
