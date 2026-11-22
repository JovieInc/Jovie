import { describe, expect, it } from 'vitest';
import { HOME_LOOP_NOT_MEASURED } from '@/lib/home-loop/contract';
import {
  hasKnownMetricText,
  isUnmeasuredDisplayValue,
  OVIE_METRICS_SYNCING_NOTICE,
  shippingTruthHeaderLabel,
} from './metrics-presentation';

describe('metrics-presentation', () => {
  it('treats founder placeholder values as unmeasured', () => {
    for (const value of [
      'Unknown',
      'Not measured',
      'Not Measured',
      '—',
      HOME_LOOP_NOT_MEASURED,
    ]) {
      expect(isUnmeasuredDisplayValue(value)).toBe(true);
    }
    expect(isUnmeasuredDisplayValue('Alive')).toBe(false);
  });

  it('filters null and empty metric text', () => {
    expect(hasKnownMetricText(null)).toBe(false);
    expect(hasKnownMetricText('12')).toBe(true);
  });

  it('never returns Unknown for the shipping header', () => {
    expect(shippingTruthHeaderLabel(null, true)).toBe('Syncing');
    expect(
      shippingTruthHeaderLabel(
        { truth: 'unknown', connection: 'connected' },
        false
      )
    ).toBe('Syncing');
    expect(
      shippingTruthHeaderLabel(
        { truth: 'fresh', connection: 'connected' },
        false
      )
    ).toBe('Fresh');
    expect(OVIE_METRICS_SYNCING_NOTICE).not.toMatch(/unknown/i);
  });
});
