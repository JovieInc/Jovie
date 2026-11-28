import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { measuredCount } from '@/lib/ovie/shipping-state/contract';
import { createEmptyShippingStateView } from '@/lib/ovie/shipping-state-client';
import {
  cockpitShipping,
  cockpitShippingWithDeployHealth,
} from '@/tests/fixtures/hud-cockpit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudShippingStrip } from './HudShippingStrip';

const chip = (name: string) => screen.getByTestId(`hud-shipping-chip-${name}`);

describe('HudShippingStrip', () => {
  it('renders measured chips and the shipping link, axe-clean', async () => {
    const { container } = render(<HudShippingStrip view={cockpitShipping} />);

    expect(chip('queue')).toHaveTextContent('2');
    expect(chip('queue')).toHaveClass('text-error');
    expect(chip('in-flight')).toHaveTextContent('1');
    expect(chip('ci')).toHaveTextContent('Green');
    expect(chip('ci')).toHaveClass('text-success');
    expect(chip('merged-7-days')).toHaveTextContent('12 (+20%)');
    expect(chip('behind-main')).toHaveTextContent('3');
    expect(screen.queryByTestId('hud-shipping-chip-prod-lag')).toBeNull();
    expect(screen.queryByTestId('hud-shipping-chip-lyb-behind')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open shipping' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_SHIPPING
    );
    await expectNoA11yViolations(container);
  });

  it('reaches the shipping link as the only tab stop', async () => {
    const user = userEvent.setup();
    render(<HudShippingStrip view={cockpitShipping} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Open shipping' })).toHaveFocus();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('omits unmeasured chips instead of showing em dashes, axe-clean', async () => {
    const { container } = render(
      <HudShippingStrip view={createEmptyShippingStateView()} />
    );

    for (const name of [
      'queue',
      'in-flight',
      'ci',
      'merged-7-days',
      'behind-main',
      'prod-lag',
      'lyb-behind',
    ]) {
      expect(screen.queryByTestId(`hud-shipping-chip-${name}`)).toBeNull();
    }
    await expectNoA11yViolations(container);
  });

  it('marks failing CI, over-target lag and red LogYourBody deploys', async () => {
    const view = {
      ...cockpitShippingWithDeployHealth({
        observedAt: '2026-10-25T06:40:00.000Z',
        healthy: false,
        repos: [
          {
            repo: 'JovieInc/LogYourBody',
            status: 'failing' as const,
            failedStreak: 15,
            behindMain: 54,
            oldestUnshippedAgeSeconds: 140083,
            lastSuccessAt: null,
          },
        ],
        lag: [
          {
            repo: 'JovieInc/Jovie',
            p50Min: 38,
            p95Min: 211.6,
            samples: 41,
            targetP50Min: 20,
            targetP95Min: 60,
          },
        ],
      }),
      ciGreen: { value: false, measurement: 'measured' as const },
    };
    const { container } = render(<HudShippingStrip view={view} />);

    expect(chip('ci')).toHaveTextContent('Failing');
    expect(chip('ci')).toHaveClass('text-error');
    expect(chip('prod-lag')).toHaveTextContent('p95 212m / 60m');
    expect(chip('prod-lag')).toHaveClass('text-error');
    expect(chip('lyb-behind')).toHaveTextContent('Failing, 54 behind');
    expect(chip('lyb-behind')).toHaveClass('text-error');
    await expectNoA11yViolations(container);
  });

  it('shows the raw merge count when there is no prior week to compare', () => {
    render(
      <HudShippingStrip
        view={{
          ...cockpitShipping,
          delivery: {
            ...cockpitShipping.delivery,
            mergeQueueDepth: measuredCount(0),
            merges: {
              ...cockpitShipping.delivery.merges,
              last7Days: measuredCount(1234),
              prior7Days: measuredCount(0),
            },
          },
        }}
      />
    );

    expect(chip('merged-7-days')).toHaveTextContent('1,234');
    expect(chip('queue')).toHaveClass('text-primary-token');
  });
});
