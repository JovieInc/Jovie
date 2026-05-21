import { describe, expect, it } from 'vitest';
import {
  FOUNDER_DEMO_CAPABILITY_BACKLOG,
  FOUNDER_DEMO_DURATION_SECONDS,
  FOUNDER_DEMO_FORBIDDEN_PUBLIC_COPY,
  FOUNDER_DEMO_PRODUCTS,
  FOUNDER_DEMO_REQUIRED_SCENES,
  FOUNDER_DEMO_SCENES,
  FOUNDER_DEMO_SIGNAL_CARDS,
  getFounderDemoSceneAt,
} from '@/lib/demo-founder-video';

describe('founder demo video timeline', () => {
  it('stays inside the 85-95 second target window', () => {
    expect(FOUNDER_DEMO_DURATION_SECONDS).toBeGreaterThanOrEqual(85);
    expect(FOUNDER_DEMO_DURATION_SECONDS).toBeLessThanOrEqual(95);
  });

  it('contains every required cinematic scene in timeline order', () => {
    expect(FOUNDER_DEMO_SCENES.map(scene => scene.id)).toEqual(
      FOUNDER_DEMO_REQUIRED_SCENES
    );

    for (let index = 1; index < FOUNDER_DEMO_SCENES.length; index += 1) {
      const previous = FOUNDER_DEMO_SCENES[index - 1]!;
      const current = FOUNDER_DEMO_SCENES[index]!;
      expect(current.startsAt).toBe(previous.endsAt);
      expect(current.endsAt).toBeGreaterThan(current.startsAt);
    }
  });

  it('maps elapsed time to the expected scenes', () => {
    expect(getFounderDemoSceneAt(0).id).toBe('jovie-alert');
    expect(getFounderDemoSceneAt(13).id).toBe('signal-panel');
    expect(getFounderDemoSceneAt(35).id).toBe('campaign-recommendation');
    expect(getFounderDemoSceneAt(50).id).toBe('approval-execution');
    expect(getFounderDemoSceneAt(70).id).toBe('fan-facing-layer');
    expect(getFounderDemoSceneAt(90).id).toBe('monitoring-loop');
  });

  it('keeps public demo copy free of accelerator and prototype wording', () => {
    const publicCopy = [
      ...FOUNDER_DEMO_SCENES.map(scene => scene.label),
      ...FOUNDER_DEMO_SIGNAL_CARDS.flatMap(card => [
        card.title,
        card.value,
        card.meta,
      ]),
      ...FOUNDER_DEMO_PRODUCTS.flatMap(product => [
        product.name,
        product.bestFor,
        product.price,
        product.target,
      ]),
    ].join('\n');

    for (const forbidden of FOUNDER_DEMO_FORBIDDEN_PUBLIC_COPY) {
      expect(publicCopy.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('tracks the production capability issues required after the cinematic demo', () => {
    expect(FOUNDER_DEMO_CAPABILITY_BACKLOG).toHaveLength(9);
  });
});
