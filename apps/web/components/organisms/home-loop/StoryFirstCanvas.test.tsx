import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  StoryFirstBottleneck,
  StoryFirstGlancePulse,
  StoryFirstStageBucket,
} from '@/lib/ovie/home/story-first';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StoryFirstCanvas } from './StoryFirstCanvas';

const bottleneck: StoryFirstBottleneck = {
  tone: 'clear',
  eyebrow: 'Bottleneck',
  title: 'Nothing is blocking revenue',
  body: 'The cone is clear.',
  moving: null,
  needs: null,
  since: null,
  detailsHref: null,
};

const glance: readonly StoryFirstGlancePulse[] = [
  {
    key: 'shipping',
    label: 'Shipping · 7d',
    value: '14',
    delta: '+3',
    tone: 'good',
    measured: true,
    points: [11, 14],
    trend: 'up',
    href: '/app/ov/shipping',
  },
  {
    key: 'revenue',
    label: 'Revenue',
    value: '$12.4k',
    delta: 'alive',
    tone: 'good',
    measured: true,
    points: [12, 12.4],
    trend: 'up',
    href: '/app/ov/ops',
  },
  {
    key: 'users',
    label: 'Users',
    value: '248',
    delta: '+18',
    tone: 'good',
    measured: true,
    points: [230, 248],
    trend: 'up',
    href: '/app/ov/growth',
  },
];

const stages: readonly StoryFirstStageBucket[] = [
  {
    stage: 'investigating',
    label: 'Investigating',
    count: 2,
    highlight: null,
  },
  {
    stage: 'building',
    label: 'Building',
    count: 5,
    highlight: {
      identifier: 'JOV-8017',
      title: 'Sidebar geometry',
      href: null,
    },
  },
  { stage: 'tested', label: 'Review', count: 3, highlight: null },
  { stage: 'merging', label: 'Merging', count: 1, highlight: null },
];

describe('StoryFirstCanvas', () => {
  it('renders the flat Story First composition', () => {
    render(
      <StoryFirstCanvas
        bottleneck={bottleneck}
        glance={glance}
        stages={stages}
        inFlightHref='/app/ov/shipping'
      />
    );
    expect(screen.getByTestId('story-first-canvas')).toHaveAttribute(
      'data-melting',
      'false'
    );
    expect(screen.getByTestId('story-first-bottleneck')).toHaveTextContent(
      'Nothing is blocking revenue'
    );
    expect(screen.getByTestId('story-first-glance-shipping')).toHaveTextContent(
      '14'
    );
    expect(screen.getByTestId('story-first-stage-building')).toHaveAttribute(
      'data-highlighted',
      'true'
    );
    expect(
      screen.getByRole('link', { name: 'Open Shipping →' })
    ).toHaveAttribute('href', '/app/ov/shipping');
  });

  it('shows a stages error with retry instead of zero counts', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <StoryFirstCanvas
        bottleneck={bottleneck}
        glance={glance}
        stages={stages.map(stage => ({ ...stage, count: 0, highlight: null }))}
        stagesStatus='error'
        onRetryStages={onRetry}
      />
    );
    expect(screen.getByTestId('story-first-stages')).toHaveAttribute(
      'data-status',
      'error'
    );
    expect(screen.queryByTestId('story-first-stage-building')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('melts the board without removing the canvas shell', () => {
    render(
      <StoryFirstCanvas
        bottleneck={bottleneck}
        glance={glance}
        stages={stages}
        melting
        answer={
          <div data-testid='fixture-answer'>Why is checkout blocked?</div>
        }
      />
    );
    expect(screen.getByTestId('story-first-canvas')).toHaveAttribute(
      'data-melting',
      'true'
    );
    expect(screen.getByTestId('story-first-board')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('story-first-board')).toHaveAttribute('inert');
    expect(screen.getByTestId('fixture-answer')).toBeVisible();
  });

  it('is axe-clean in clear and melting states', async () => {
    const clear = render(
      <StoryFirstCanvas
        bottleneck={bottleneck}
        glance={glance}
        stages={stages}
        inFlightHref='/app/ov/shipping'
      />
    );
    await expectNoA11yViolations(clear.container);
    clear.unmount();

    const melt = render(
      <StoryFirstCanvas
        bottleneck={bottleneck}
        glance={glance}
        stages={stages}
        melting
      />
    );
    await expectNoA11yViolations(melt.container);
  });
});
