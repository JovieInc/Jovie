import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import {
  HomeLoopConstraintBanner,
  HomeLoopPulse,
  HomeLoopTileCard,
} from './HomeLoopPulse';

describe('HomeLoopConstraintBanner', () => {
  it('names the constraint and links its details from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HomeLoopConstraintBanner
        constraint={{
          tone: 'bad',
          text: '2 items are blocked',
          detailsHref: '/app/ov/product',
        }}
        emptyLabel='All clear'
        unknownLabel='Unknown'
      />
    );

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('data-tone', 'bad');
    expect(banner).toHaveTextContent('2 items are blocked');
    await user.tab();
    const details = screen.getByRole('link', { name: 'Details' });
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute('href', '/app/ov/product');
    await expectNoA11yViolations(container);
  });

  it('reads unknown, never the all-clear, when the read is unknown', async () => {
    const { container } = render(
      <HomeLoopConstraintBanner
        constraint={null}
        emptyLabel='All clear'
        unknownLabel='Shipping status is unknown'
      />
    );

    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'unknown');
    expect(screen.getByText('Shipping status is unknown')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows the all-clear without a constraint or unknown line', () => {
    render(
      <HomeLoopConstraintBanner constraint={null} emptyLabel='All clear' />
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'clear');
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('shows a skeleton and no copy while loading', async () => {
    const { container } = render(
      <HomeLoopConstraintBanner
        constraint={null}
        emptyLabel='All clear'
        unknownLabel='Unknown'
        loading
      />
    );

    expect(screen.getByTestId('home-loop-constraint')).toHaveAttribute(
      'data-tone',
      'loading'
    );
    expect(
      screen.getByRole('status', { name: 'Loading content' })
    ).toBeInTheDocument();
    expect(screen.queryByText('All clear')).toBeNull();
    expect(screen.queryByText('Unknown')).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe('HomeLoopPulse', () => {
  it('renders one tile per metric with tone in words and a linked drill-down', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HomeLoopPulse tiles={HOME_LOOP_FIXTURE_PULSE} />
    );

    const prod = screen.getByTestId('home-loop-tile-prod');
    expect(prod.tagName).toBe('A');
    expect(prod).toHaveAttribute('href', '/app/ov/shipping');
    expect(prod).toHaveTextContent('Target current · Was 060037d');
    expect(screen.getAllByRole('img', { name: 'Problem' })).toHaveLength(1);
    await user.tab();
    expect(prod).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps empty frames when no tile arrived, and skeletons while loading', async () => {
    const { container, rerender } = render(
      <HomeLoopPulse tiles={[]} placeholderCount={4} />
    );
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(4);
    expect(screen.getByTestId('home-loop-pulse')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    await expectNoA11yViolations(container);

    rerender(<HomeLoopPulse tiles={[]} loading />);
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    expect(screen.getByTestId('home-loop-pulse')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('marks unmeasured tiles and reserves room for source captions', async () => {
    const { container } = render(
      <HomeLoopPulse
        tiles={HOME_LOOP_FIXTURE_UNMEASURED_PULSE.slice(0, 2)}
        reserveSourceCaption
      />
    );

    expect(screen.getByTestId('home-loop-pulse')).toHaveClass('h-32');
    expect(screen.getByTestId('home-loop-tile-prod')).toHaveAttribute(
      'data-measured',
      'false'
    );
    expect(screen.getAllByText('Not measured')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});

describe('HomeLoopTileCard', () => {
  it('renders a plain tile with its source caption when it has no link', async () => {
    const { container } = render(
      <HomeLoopTileCard
        tile={{
          key: 'ejections',
          label: 'Queue ejections',
          value: '52%',
          was: null,
          tone: 'bad',
          measured: true,
          target: 'Target ≤ 10%',
          sourceCaption: 'Snapshot 2026-11-07 14:24 UTC',
        }}
      />
    );

    const tile = screen.getByTestId('home-loop-tile-ejections');
    expect(tile.tagName).toBe('DIV');
    expect(tile).toHaveTextContent('Snapshot 2026-11-07 14:24 UTC');
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
