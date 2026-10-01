import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HudDrilldownSearch } from '@/components/features/admin/hud/HudDrilldownSearch';
import { APP_ROUTES } from '@/constants/routes';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';

describe('HudDrilldownSearch', () => {
  it('defaults to customer search targeting the authoritative People record', () => {
    render(<HudDrilldownSearch metrics={cockpitMetrics()} />);

    const form = screen.getByTestId('hud-drilldown-form');
    expect(form).toHaveAttribute('action', APP_ROUTES.ADMIN_PEOPLE);
    expect(form.querySelector('input[name="view"]')).toHaveAttribute(
      'value',
      'contacts'
    );
    expect(screen.getByTestId('hud-drilldown-search')).toHaveAttribute(
      'name',
      'q'
    );
  });

  it('switches the release scope to the releases record view', () => {
    render(<HudDrilldownSearch metrics={cockpitMetrics()} />);

    fireEvent.click(screen.getByTestId('hud-drilldown-scope-releases'));

    const form = screen.getByTestId('hud-drilldown-form');
    expect(form).toHaveAttribute('action', APP_ROUTES.ADMIN_PEOPLE);
    expect(form.querySelector('input[name="view"]')).toHaveAttribute(
      'value',
      'releases'
    );
  });

  it('targets the activity timeline for event searches', () => {
    render(<HudDrilldownSearch metrics={cockpitMetrics()} />);

    fireEvent.click(screen.getByTestId('hud-drilldown-scope-events'));

    expect(screen.getByTestId('hud-drilldown-form')).toHaveAttribute(
      'action',
      APP_ROUTES.ADMIN_ACTIVITY
    );
  });

  it('lists and filters live exceptions in the exceptions scope', () => {
    const metrics = cockpitMetrics({
      operations: { status: 'degraded', dbLatencyMs: 240 },
    });
    render(<HudDrilldownSearch metrics={metrics} />);

    fireEvent.click(screen.getByTestId('hud-drilldown-scope-exceptions'));
    expect(
      screen.getByTestId('hud-drilldown-exception-operations-degraded')
    ).toHaveTextContent('Database is degraded');

    fireEvent.change(screen.getByTestId('hud-drilldown-search'), {
      target: { value: 'nomatch' },
    });
    expect(
      screen.queryByTestId('hud-drilldown-exception-operations-degraded')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('hud-drilldowns')).toHaveTextContent(
      'No exceptions match'
    );
  });

  it('shows the nominal state when no exceptions exist', () => {
    render(<HudDrilldownSearch metrics={cockpitMetrics()} />);

    fireEvent.click(screen.getByTestId('hud-drilldown-scope-exceptions'));
    expect(screen.getByTestId('hud-drilldowns')).toHaveTextContent(
      'No exceptions match'
    );
  });
});
