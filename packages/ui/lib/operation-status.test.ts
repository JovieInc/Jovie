import { describe, expect, it } from 'vitest';
import { resolveOperationStatus } from './operation-status';

const succeeded = {
  operationKey: 'task:attempt-2',
  state: 'succeeded',
  persisted: true,
} as const;

describe('operation receipts', () => {
  it('requires persisted success for the current attempt', () => {
    const observation = {
      operationKey: succeeded.operationKey,
      state: 'succeeded',
      active: false,
    };
    expect(resolveOperationStatus(observation)).toBe('unknown');
    expect(resolveOperationStatus({ ...observation, active: true })).toBe(
      'pending'
    );
    expect(
      resolveOperationStatus({
        ...observation,
        receipt: { ...succeeded, persisted: false },
      })
    ).toBe('unknown');
    expect(
      resolveOperationStatus({
        ...observation,
        receipt: { ...succeeded, operationKey: 'task:attempt-1' },
      })
    ).toBe('unknown');
    expect(
      resolveOperationStatus({
        ...observation,
        receipt: { ...succeeded, state: 'failed' },
      })
    ).toBe('unknown');
    expect(resolveOperationStatus({ ...observation, receipt: succeeded })).toBe(
      'succeeded'
    );
    expect(
      resolveOperationStatus({
        ...observation,
        operationKey: '',
        receipt: { ...succeeded, operationKey: '' },
      })
    ).toBe('unknown');
  });

  it('stops working on interruption and never promotes a previous receipt', () => {
    expect(
      resolveOperationStatus({
        operationKey: succeeded.operationKey,
        state: 'working',
        active: true,
        receipt: succeeded,
      })
    ).toBe('working');
    expect(
      resolveOperationStatus({
        operationKey: succeeded.operationKey,
        state: 'working',
        active: false,
        receipt: succeeded,
      })
    ).toBe('unknown');
  });

  it.each(['idle', 'pending', 'failed', 'cancelled'] as const)(
    'preserves explicit %s even with a prior successful receipt',
    state => {
      expect(
        resolveOperationStatus({
          operationKey: succeeded.operationKey,
          state,
          active: true,
          receipt: succeeded,
        })
      ).toBe(state);
    }
  );

  it('fails closed for a future or unknown state', () => {
    expect(
      resolveOperationStatus({
        operationKey: succeeded.operationKey,
        state: 'stream-ended',
        active: false,
        receipt: succeeded,
      })
    ).toBe('unknown');
  });
});
