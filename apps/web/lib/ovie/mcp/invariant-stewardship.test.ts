import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  projectStewardshipEvidence,
  regenerateStewardshipAudit,
} from '../invariant-stewardship.js';

const fixture = vi.hoisted(() => ({
  audit: {} as Record<string, unknown>,
  readFile: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ readFile: fixture.readFile }));
vi.mock('../generated/invariant-stewardship.current-week.json', () => ({
  default: fixture.audit,
}));

import {
  getInvariantStewardship,
  readCanonicalStewardshipSource,
} from './invariant-stewardship';

const canonicalSource = [
  {
    schema: 'jovie-invariant-registry/v1',
    version: 'fixture',
    authority: { owner: 'Summer', approvedBy: 'Founder' },
  },
  {
    id: 'JOV-INV-001',
    title: 'Fixture authority',
    statement: 'One canonical source.',
    authority: { owner: 'Summer', approvedBy: 'Founder' },
    scope: { products: ['Jovie'], surfaces: ['policy-source'] },
    policy: { key: 'fixture.path', value: 'canon/invariants.jsonl' },
    effective: { date: '2026-01-01', version: 1 },
    precedence: 1000,
    enforcementConsumers: [{ name: 'fixture', path: 'fixture.mjs' }],
    evidence: {
      tests: [{ name: 'fixture', path: 'fixture.test.mjs' }],
      deliberateRed: [{ name: 'fixture red', path: 'fixture.test.mjs' }],
    },
    lifecycle: { state: 'adopted', supersedes: [], supersededBy: null },
  },
]
  .map(row => JSON.stringify(row))
  .join('\n');

describe('stewardship production read adapter', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T01:00:00Z'));
    vi.resetAllMocks();
    for (const key of Object.keys(fixture.audit)) delete fixture.audit[key];
    Object.assign(
      fixture.audit,
      regenerateStewardshipAudit(canonicalSource, {
        generatedAt: '2026-01-01T00:00:00.000Z',
        causalEvent: {
          kind: 'source-change',
          id: 'fixture-source-change',
          sourceRevision: 'fixture-v1',
        },
      })
    );
  });

  it('uses the same source-bound projection and rechecks changed source on each read', async () => {
    fixture.readFile.mockReturnValue(canonicalSource);
    expect(await getInvariantStewardship()).toEqual(
      projectStewardshipEvidence(fixture.audit, canonicalSource)
    );
    expect((await getInvariantStewardship()).evidence.state).toBe('verified');
    fixture.readFile.mockReturnValue(`${canonicalSource}\n`);
    const changed = await getInvariantStewardship();
    expect(changed.evidence.state).toBe('stale');
    expect(changed.summerQueue).toEqual([]);
    expect(changed.evidence.executionStatus).toBe('not-certified');
  });

  it('reads the staged canonical bytes when repository source is absent in the build', async () => {
    fixture.readFile
      .mockImplementationOnce(() => {
        throw new Error('absent repo');
      })
      .mockImplementationOnce(() => {
        throw new Error('absent parent');
      })
      .mockReturnValue(canonicalSource);
    expect(await readCanonicalStewardshipSource()).toBe(canonicalSource);
    expect(fixture.readFile.mock.calls[2]?.[0]).toContain(
      'runtime-data/canon/invariants.jsonl'
    );
  });

  it('reports unknown source without admitting raw declared snapshot findings', async () => {
    fixture.readFile.mockImplementation(() => {
      throw new Error('absent source');
    });
    const result = await getInvariantStewardship();
    expect(result.evidence.state).toBe('unknown');
    expect(result.summerQueue).toEqual([]);
    expect(result.summary.actionableExceptions).toBe(0);
  });
});
