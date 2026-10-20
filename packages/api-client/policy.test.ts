import { describe, expect, it } from 'vitest';

import policyCases from './conformance/policy.json' with { type: 'json' };
import type { PriorityName } from './contract.ts';
import type { FailureKind } from './headers.ts';
import {
  backoffMs,
  credentialState,
  decide,
  emptyLedger,
  observe,
  recordOutcome,
} from './policy.ts';

// Step shapes are shared with scripts/tests/test_apiclient_conformance.py.
interface Step {
  op: 'observe' | 'decide' | 'repeat' | 'outcome' | 'expect';
  at?: number;
  times?: number;
  priority?: PriorityName;
  costs?: Record<string, number>;
  write?: boolean;
  minWriteIntervalMs?: number;
  resource?: string;
  probe?: boolean;
  failure?: { kind: FailureKind; retryAtMs: number | null };
  observations?: {
    resource: string;
    limit: number | null;
    remaining: number;
    resetAt: number | null;
  }[];
  bucket?: string;
  remaining?: number;
  breaker?: string;
  expect?: Record<string, unknown>;
}

describe('conformance: backoff', () => {
  for (const c of policyCases.backoff) {
    it(`attempt ${c.attempt} random ${c.random}`, () => {
      expect(
        backoffMs(
          c.attempt,
          { kind: 'transient', retryAtMs: c.retryAtMs },
          c.now,
          () => c.random
        )
      ).toBe(c.expect);
    });
  }
});

describe('conformance: admission scenarios', () => {
  for (const scenario of policyCases.scenarios) {
    it(scenario.name, () => {
      const ledger = emptyLedger('test');
      for (const step of scenario.steps as Step[]) {
        const state = credentialState(ledger, 'cred', step.at ?? 0);
        const request = {
          priority: step.priority ?? 'default',
          costs: step.costs ?? {},
          write: step.write ?? false,
          minWriteIntervalMs: step.minWriteIntervalMs,
        };
        if (step.op === 'observe')
          observe(state, step.observations ?? [], step.at ?? 0);
        if (step.op === 'decide' || step.op === 'repeat') {
          for (let i = 0; i < (step.times ?? 1); i += 1) {
            expect(decide(state, request, step.at ?? 0)).toMatchObject(
              step.expect ?? {}
            );
          }
        }
        if (step.op === 'outcome') {
          const change = recordOutcome(
            state,
            {
              priority: request.priority,
              resource: step.resource ?? 'core',
              failure: step.failure!,
              probe: step.probe ?? false,
            },
            step.at ?? 0
          );
          const wanted = step.expect?.transition;
          if (wanted === null) expect(change).toBeNull();
          else expect(change).toMatchObject(wanted as object);
        }
        if (step.op === 'expect') {
          if (step.bucket)
            expect(state.buckets[step.bucket]?.remaining).toBe(step.remaining);
          if (step.breaker) expect(state.breaker.state).toBe(step.breaker);
        }
      }
    });
  }
});
