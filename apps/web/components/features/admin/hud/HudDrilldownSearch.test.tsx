import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudDrilldownSearch } from './HudDrilldownSearch';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

const degraded = cockpitMetrics({
  operations: { status: 'degraded', dbLatencyMs: 240 },
});

describe('HudDrilldownSearch', () => {
  it('keeps typed text and focus across a parent rerender and Escape', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container, rerender } = render(
      <HudDrilldownSearch metrics={cockpitMetrics()} />
    );
    const input = screen.getByTestId('hud-drilldown-search');
    await user.type(input, 'ari');
    rerender(<HudDrilldownSearch metrics={cockpitMetrics()} />);
    await user.keyboard('{Escape}');

    const same = screen.getByTestId('hud-drilldown-search');
    expect(same).toBe(input);
    expect(same).toHaveValue('ari');
    expect(same).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('submits customer search to the People record with hidden view param', async () => {
    const { container } = render(
      <HudDrilldownSearch metrics={cockpitMetrics()} />
    );
    const form = screen.getByTestId('hud-drilldown-form');
    expect(form).toHaveAttribute('action', APP_ROUTES.ADMIN_PEOPLE);
    const hidden = form.querySelector('input[name="view"]');
    expect(hidden).toHaveAttribute('type', 'hidden');
    expect(hidden).toHaveAttribute('value', 'contacts');
    await expectNoA11yViolations(container);
  });

  it('clears the query when switching scope and lists live exceptions', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    const { container } = render(<HudDrilldownSearch metrics={degraded} />);
    await user.type(screen.getByTestId('hud-drilldown-search'), 'customer');
    await user.click(screen.getByTestId('hud-drilldown-scope-exceptions'));

    expect(screen.getByTestId('hud-drilldown-search')).toHaveValue('');
    expect(
      screen.getByTestId('hud-drilldown-exception-operations-degraded')
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.type(screen.getByTestId('hud-drilldown-search'), 'zzz');
    expect(screen.getByText('No exceptions match your search.')).toBeVisible();
  });

  it('says systems are nominal when nothing is wrong', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} });
    render(<HudDrilldownSearch metrics={cockpitMetrics()} />);
    await user.click(screen.getByTestId('hud-drilldown-scope-exceptions'));
    expect(screen.getByText('Systems nominal.')).toBeVisible();
  });
});
