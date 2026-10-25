import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CinematicMetric, CinematicMetricSkeleton } from './cinematic-metric';

describe('CinematicMetric', () => {
  it.each(['glance', 'summary', 'dense'] as const)(
    'keeps %s anatomy across pending, missing and measured states',
    density => {
      const { container, rerender } = render(
        <CinematicMetric
          label='In flight'
          value={null}
          density={density}
          loading
        />
      );
      const frame = container.querySelector('dl');
      const frameClass = frame?.className;
      const slots = Array.from(frame?.children ?? []).map(
        slot => slot.className
      );
      expect(frame).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Loading In flight');
      for (const value of [null, 0, '12,345']) {
        rerender(
          <CinematicMetric
            label='In flight'
            value={value}
            density={density}
            detail='Observed just now'
          />
        );
        expect(container.querySelector('dl')).toBe(frame);
        expect(frame?.className).toBe(frameClass);
        expect(
          Array.from(frame?.children ?? []).map(slot => slot.className)
        ).toEqual(slots);
        expect(frame).toHaveAttribute('aria-busy', 'false');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(
          screen.getByText(value === null ? 'Not measured' : String(value))
        ).toBeVisible();
      }
    }
  );

  it('uses the same anatomy for the dedicated skeleton', () => {
    const { container } = render(
      <CinematicMetricSkeleton
        label='Shipping'
        density='glance'
        className='px-3'
      />
    );
    expect(container.querySelector('dl')).toHaveAttribute(
      'data-density',
      'glance'
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading Shipping');
    expect(container.querySelectorAll('dd')).toHaveLength(2);
  });

  it('defaults to summary density and keeps an empty context slot', () => {
    const { container } = render(<CinematicMetric label='Landed' value={0} />);
    expect(container.querySelector('dl')).toHaveAttribute(
      'data-density',
      'summary'
    );
    expect(container.querySelectorAll('dd')).toHaveLength(2);
    expect(screen.getByText('0')).toBeVisible();
  });

  it('hides previous values and context while loading', () => {
    render(
      <CinematicMetric
        label='Landed'
        value={99}
        detail='Old observation'
        loading
      />
    );
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByText('Old observation')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading Landed');
  });

  it('reveals complete long content on keyboard focus', async () => {
    const user = userEvent.setup();
    const label = 'Production changes awaiting verification';
    render(
      <CinematicMetric
        label={label}
        value='1,234,567'
        detail='Source freshness unknown'
        className='w-40'
      />
    );
    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      `${label}: 1,234,567 · Source freshness unknown`
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
