import { describe, expect, it } from 'vitest';
import { getNextStepMessage } from '@/components/jovie/utils';
import {
  parseSummerFailure,
  SUMMER_FAILURE_HOPS,
  summerFailureText,
  summerHopLabel,
  summerRetryMode,
} from './summer-failure';

describe('Summer failure hops', () => {
  it('only offers a same-turn replay when the failure was never recorded', () => {
    expect(summerRetryMode('summer_result_pending', 'unavailable')).toBe(
      'same-turn'
    );
    expect(summerRetryMode('summer_busy', 'unknown')).toBe('same-turn');
    expect(summerRetryMode('summer_turn_failed', 'failure')).toBe('new-turn');
    expect(summerRetryMode('summer_turn_failed', 'failed_tool')).toBe(
      'new-turn'
    );
    expect(summerRetryMode('summer_budget_exhausted', 'unavailable')).toBe(
      'none'
    );
  });

  it.each(SUMMER_FAILURE_HOPS)(
    'names %s in plain copy without dead-end instructions',
    hop => {
      const text = summerFailureText(hop);
      expect(text).toMatch(/Summer/);
      expect(text).not.toMatch(/resend|reconcil|status:/i);
      expect(text).not.toContain('—');
      expect(getNextStepMessage('server', hop)).toBe(
        `Failed at: ${summerHopLabel(hop)}`
      );
    }
  );

  it('parses only well-formed failure metadata', () => {
    expect(
      parseSummerFailure({ hop: 'summer_busy', retry: 'same-turn' })
    ).toEqual({ hop: 'summer_busy', retry: 'same-turn' });
    expect(parseSummerFailure({ hop: 'other', retry: 'same-turn' })).toBeNull();
    expect(parseSummerFailure({ hop: 'summer_busy', retry: 'x' })).toBeNull();
    expect(parseSummerFailure(null)).toBeNull();
  });
});
