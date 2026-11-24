import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  StoryFirstBottleneck,
  StoryFirstGlancePulse,
  StoryFirstStageBucket,
} from '@/lib/ovie/home/story-first';
import {
  GLANCE_VALUE_H,
  HERO_MIN_H,
  HERO_TITLE_H,
  STAGES_MIN_H,
  StoryFirstCanvas,
  type StoryFirstCanvasProps,
} from './StoryFirstCanvas';

/**
 * jsdom has no layout, so "same height" is proved at the contract level: the
 * placeholder and the loaded state of each late region carry the same reserved
 * height classes. The browser-level proof is tests/e2e/ov-home-layout-shift.spec.ts.
 */
const loadedHero: StoryFirstBottleneck = {
  tone: 'clear',
  eyebrow: 'Bottleneck',
  title: 'Nothing is blocking revenue',
  body: 'The cone is clear.',
  moving: null,
  needs: null,
  since: null,
  detailsHref: null,
};
const loadingHero: StoryFirstBottleneck = {
  ...loadedHero,
  tone: 'loading',
  title: '',
  body: '',
};
const pulse: StoryFirstGlancePulse = {
  key: 'shipping',
  label: 'Shipping · 7d',
  value: '14',
  delta: '+3',
  tone: 'good',
  measured: true,
  points: [1, 2, 3],
  trend: 'up',
  href: '/app/ov/shipping',
} as StoryFirstGlancePulse;
const stages: readonly StoryFirstStageBucket[] = [
  { stage: 'building', label: 'Building', count: 5, highlight: null },
];

function renderCanvas(overrides: Partial<StoryFirstCanvasProps>) {
  return render(
    <StoryFirstCanvas
      bottleneck={loadedHero}
      glance={[pulse]}
      stages={stages}
      {...overrides}
    />
  );
}

function classesOf(testId: string): string {
  return screen.getByTestId(testId).className;
}

describe('StoryFirstCanvas reserves final space', () => {
  it('hero reserves the same min height loading and loaded', () => {
    const loaded = renderCanvas({});
    const loadedClass = classesOf('story-first-bottleneck');
    loaded.unmount();
    renderCanvas({ bottleneck: loadingHero });
    expect(classesOf('story-first-bottleneck')).toBe(loadedClass);
    expect(loadedClass).toContain(HERO_MIN_H);
  });

  it('hero skeleton title row matches the loaded title height', () => {
    renderCanvas({});
    expect(screen.getByRole('heading', { level: 1 }).className).toContain(
      HERO_TITLE_H
    );
    document.body.innerHTML = '';
    const { container } = renderCanvas({ bottleneck: loadingHero });
    expect(container.querySelector(`.${HERO_TITLE_H.split(' ')[0]}`)).not.toBe(
      null
    );
  });

  it('glance value row is the same height loading and loaded', () => {
    const { container, unmount } = renderCanvas({});
    const loaded = container.querySelector(`.${GLANCE_VALUE_H}`);
    expect(loaded).not.toBeNull();
    expect(loaded?.className).toContain('items-baseline');
    unmount();
    const loading = renderCanvas({ glanceLoading: true });
    expect(
      loading.container.querySelector(`.${GLANCE_VALUE_H}`)
    ).not.toBeNull();
    // Number never changes width when it ticks.
    expect(screen.queryByText('14')).toBeNull();
  });

  it('stages reserve the same min height loading, ready and error', () => {
    for (const status of ['loading', 'ready', 'error'] as const) {
      const { container, unmount } = renderCanvas({
        stagesStatus: status,
        onRetryStages: () => undefined,
      });
      expect(
        container.querySelectorAll(
          `[data-testid="story-first-stages"] .${STAGES_MIN_H}`
        )
      ).toHaveLength(1);
      unmount();
    }
  });

  it('counters are tabular so a new count never changes width', () => {
    renderCanvas({});
    expect(screen.getByText('5').className).toContain('tabular-nums');
    expect(screen.getByText('14').className).toContain('tabular-nums');
  });

  it('keeps showing loaded stages when props refresh with new data', () => {
    const { rerender } = renderCanvas({});
    rerender(
      <StoryFirstCanvas
        bottleneck={loadedHero}
        glance={[{ ...pulse, value: '15' }]}
        stages={[{ ...stages[0], count: 6 }]}
      />
    );
    expect(screen.getByTestId('story-first-stage-building')).toHaveTextContent(
      '6'
    );
    expect(screen.queryByTestId('story-first-stages')).toHaveAttribute(
      'data-status',
      'ready'
    );
  });
});
