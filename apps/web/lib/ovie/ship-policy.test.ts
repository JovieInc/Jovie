import { describe, expect, it } from 'vitest';
import { shipPolicy } from './ship-policy';

describe('ship policy', () => {
  it('ships sure, low-risk work now and waits longer as risk rises or confidence drops', () => {
    const at = (risk: 'low' | 'medium' | 'high', confidence: 'high' | 'low') =>
      shipPolicy({ kind: 'decision', risk, confidence });
    expect(at('low', 'high')).toMatchObject({
      gate: 'ship_now',
      waitHours: 0,
      defaultDecision: 'approve',
    });
    expect(at('low', 'low')).toMatchObject({
      gate: 'wait_then_ship',
      waitHours: 48,
      defaultDecision: 'approve',
    });
    expect(at('medium', 'high').waitHours).toBe(24);
    expect(at('medium', 'low').waitHours).toBe(72);
    expect(at('high', 'high')).toMatchObject({
      gate: 'wait_then_ship',
      waitHours: 72,
    });
    expect(at('high', 'low')).toMatchObject({
      gate: 'wait_for_tim',
      defaultDecision: 'none',
    });
  });

  it('never ships outbound or spend on silence, however sure', () => {
    for (const kind of ['outbound', 'spend'] as const)
      expect(
        shipPolicy({ kind, risk: 'low', confidence: 'high' })
      ).toMatchObject({ gate: 'tim_only', defaultDecision: 'reject' });
  });
});
