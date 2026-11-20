import { describe, expect, it } from 'vitest';
import { COLD_SEQUENCE, nextColdStep } from './sequence';

const NOW = new Date('2026-10-29T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('nextColdStep', () => {
  it('starts with the first touch', () => {
    expect(nextColdStep({ sent: [], stops: [] }, NOW)).toEqual({
      kind: 'due',
      step: COLD_SEQUENCE[0],
    });
  });

  it('waits for the follow-up delay, then makes it due', () => {
    const waiting = nextColdStep(
      { sent: [{ index: 0, at: days(2) }], stops: [] },
      NOW
    );
    expect(waiting.kind).toBe('waiting');
    const due = nextColdStep(
      { sent: [{ index: 0, at: days(5) }], stops: [] },
      NOW
    );
    expect(due).toMatchObject({ kind: 'due', step: { index: 1 } });
  });

  it.each([
    'replied',
    'claimed',
    'unsubscribed',
    'bounced',
    'complained',
    'suppressed',
  ] as const)('stops for good on %s', event => {
    const result = nextColdStep(
      { sent: [{ index: 0, at: days(30) }], stops: [{ event, at: days(1) }] },
      NOW
    );
    expect(result).toEqual({ kind: 'stopped', reason: event });
  });

  it('never sends more than the sequence length', () => {
    const sent = COLD_SEQUENCE.map((step, i) => ({
      index: step.index,
      at: days(30 - i * 10),
    }));
    expect(nextColdStep({ sent, stops: [] }, NOW)).toEqual({
      kind: 'complete',
    });
  });

  it('does not skip a step whose predecessor never left', () => {
    expect(
      nextColdStep({ sent: [{ index: 1, at: days(30) }], stops: [] }, NOW)
    ).toMatchObject({
      kind: 'due',
      step: { index: 0 },
    });
  });
});
