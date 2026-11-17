/**
 * Tests for the isolate-off unwind step runner (runUnwindSteps, exported by
 * tests/setup-optimized.ts): a throwing step must never skip the later
 * steps, and the FIRST error must be the one rethrown after all steps ran.
 */
import { expect, it } from 'vitest';
import { runUnwindSteps } from '../../setup-optimized';

it('runs every unwind step even when an earlier step throws', () => {
  const ran: string[] = [];
  const boom = new Error('unwind step failed');
  expect(() =>
    runUnwindSteps([
      () => {
        ran.push('first');
      },
      () => {
        throw boom;
      },
      () => {
        ran.push('third');
      },
    ])
  ).toThrow(boom);
  expect(ran).toEqual(['first', 'third']);
});

it('rethrows the first error after all steps ran', () => {
  const ran: string[] = [];
  const first = new Error('first');
  const second = new Error('second');
  let caught: unknown;
  try {
    runUnwindSteps([
      () => {
        throw first;
      },
      () => {
        ran.push('later');
        throw second;
      },
    ]);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(first);
  expect(ran).toEqual(['later']);
});

it('passes a clean unwind through untouched', () => {
  const ran: string[] = [];
  expect(() =>
    runUnwindSteps([
      () => {
        ran.push('a');
      },
      () => {
        ran.push('b');
      },
    ])
  ).not.toThrow();
  expect(ran).toEqual(['a', 'b']);
});
