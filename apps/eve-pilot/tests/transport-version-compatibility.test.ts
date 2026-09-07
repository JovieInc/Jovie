import { describe, expect, it } from 'vitest';
import { summerShadowEventSchema } from '../agent/lib/summer-shadow-ingress';
import { snapshot } from './commercial-fixture';

describe('supported v1 producer generations', () => {
  const event = {
    schema: 'jovie.ovie-summer-shadow.event/v1',
    eventId: 'event_0001',
    conversationId: 'conversation_0001',
    turn: 1,
    dailySlot: 1,
    occurredAt: '2026-09-04T18:00:00Z',
    message: 'Synthetic isolated observation',
  };
  it('accepts the original producer without later optional fields', () => {
    expect(summerShadowEventSchema.parse(event).evidence).toEqual([]);
  });
  it('accepts current and older commercial v1 producers without a coordinated rollout', () => {
    const current = snapshot();
    const legacy = {
      ...current,
      candidates: current.candidates.map(candidate => {
        const {
          usefulJobsPerWeekGain: _jobs,
          reliabilityBasisPointsGain: _reliability,
          reusedProductCount: _reuse,
          ...original
        } = candidate;
        return original;
      }),
    };
    for (const commercialSnapshot of [legacy, current])
      expect(
        summerShadowEventSchema.parse({ ...event, commercialSnapshot })
          .commercialSnapshot
      ).toEqual(current);
  });
  it('rejects unsupported wire versions and privilege additions', () => {
    expect(
      summerShadowEventSchema.safeParse({
        ...event,
        schema: 'jovie.ovie-summer-shadow.event/v2',
      }).success
    ).toBe(false);
    expect(
      summerShadowEventSchema.safeParse({
        ...event,
        dispatchAuthority: 'write',
      }).success
    ).toBe(false);
  });
});
