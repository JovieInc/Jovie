import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_BUSY_DONE,
  HOME_LOOP_FIXTURE_DONE,
  HOME_LOOP_FIXTURE_PULSE,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
  HOME_LOOP_FIXTURE_UNMEASURED_PULSE,
} from './fixtures';
import { HomeLoopLatency } from './HomeLoopLatency';
import { HomeLoopConstraintBanner, HomeLoopPulse } from './HomeLoopPulse';
import { HomeLoopSection } from './HomeLoopSection';
import { HomeLoopDoneChips, HomeLoopStageRows } from './HomeLoopStageRows';

describe('HomeLoopConstraintBanner', () => {
  it('names the constraint in text, a quiet line when clear, and a skeleton while loading', () => {
    const { rerender } = render(
      <HomeLoopConstraintBanner
        constraint={{ tone: 'bad', text: '2 items are blocked' }}
        emptyLabel='All clear'
      />
    );
    const banner = screen.getByTestId('home-loop-constraint');
    expect(banner).toHaveTextContent('2 items are blocked');
    expect(banner).toHaveAttribute('data-tone', 'bad');

    rerender(
      <HomeLoopConstraintBanner constraint={null} emptyLabel='All clear' />
    );
    expect(banner).toHaveTextContent('All clear');

    rerender(
      <HomeLoopConstraintBanner
        constraint={null}
        emptyLabel='All clear'
        loading
      />
    );
    expect(banner).toHaveAttribute('data-tone', 'loading');
  });
});

describe('HomeLoopPulse', () => {
  it('shows each tile with its previous value and a named tone', () => {
    render(<HomeLoopPulse tiles={HOME_LOOP_FIXTURE_PULSE} />);
    expect(
      screen.getAllByTestId(/^home-loop-tile-(?!placeholder)/)
    ).toHaveLength(7);
    const prod = screen.getByTestId('home-loop-tile-prod');
    expect(prod).toHaveTextContent('c9b767a');
    expect(prod).toHaveTextContent('Was 060037d');
    expect(
      within(prod).getByRole('img', { name: 'Healthy' })
    ).toBeInTheDocument();
  });

  it('keeps tile frames reserved while loading or unavailable', () => {
    const { rerender } = render(<HomeLoopPulse tiles={[]} loading />);
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
    rerender(<HomeLoopPulse tiles={[]} />);
    expect(screen.getAllByTestId('home-loop-tile-placeholder')).toHaveLength(7);
  });

  it('never shows a was value or tone for unmeasured tiles', () => {
    render(<HomeLoopPulse tiles={HOME_LOOP_FIXTURE_UNMEASURED_PULSE} />);
    const prod = screen.getByTestId('home-loop-tile-prod');
    expect(prod).toHaveTextContent('Not measured');
    expect(prod).not.toHaveTextContent('Was');
    expect(prod).toHaveAttribute('data-measured', 'false');
  });
});

describe('HomeLoopStageRows', () => {
  it('names stage progress and attention for assistive tech, not color alone', () => {
    render(
      <HomeLoopStageRows
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
      />
    );
    const [blocked] = screen.getAllByTestId('home-loop-stage-row');
    expect(
      within(blocked as HTMLElement).getByRole('list', {
        name: 'Stage 1 of 6: Investigating, Blocked',
      })
    ).toBeInTheDocument();
    expect(blocked).toHaveTextContent('Blocked');
  });

  it('caps visible rows and counts the rest', () => {
    render(
      <HomeLoopStageRows
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
        maxRows={2}
      />
    );
    expect(screen.getAllByTestId('home-loop-stage-row')).toHaveLength(2);
    expect(screen.getByText('4 more in flight')).toBeVisible();
  });

  it('lists done chips with an aggregate and verification named for screen readers', () => {
    render(
      <HomeLoopDoneChips items={HOME_LOOP_FIXTURE_DONE} summary='3 merges' />
    );
    const done = screen.getByTestId('home-loop-done');
    expect(done).toHaveTextContent('3 merges');
    expect(within(done).getAllByText('Verified in production')).toHaveLength(2);
  });
});

describe('Home loop fit', () => {
  it('hides pulse tiles that do not fit one row, keeping priority order', () => {
    const restore = mockFitLayout('home-loop-pulse', 250);
    try {
      render(<HomeLoopPulse tiles={HOME_LOOP_FIXTURE_PULSE} />);
      const tiles = screen.getAllByTestId(/^home-loop-tile-/);
      expect(
        tiles.filter(tile => tile.getAttribute('aria-hidden') !== 'true')
      ).toEqual(tiles.slice(0, 2));
    } finally {
      restore();
    }
  });

  it('collapses done chips that do not fit into +N more', () => {
    const restore = mockFitLayout('home-loop-done', 250);
    try {
      render(<HomeLoopDoneChips items={HOME_LOOP_FIXTURE_BUSY_DONE} fit />);
      expect(screen.getByTestId('home-loop-done-more')).toHaveTextContent(
        `+${HOME_LOOP_FIXTURE_BUSY_DONE.length - 2} more`
      );
    } finally {
      restore();
    }
  });
});

describe('HomeLoopSection', () => {
  function section(
    status: 'loading' | 'error' | 'ready',
    isEmpty: boolean,
    onRetry = vi.fn()
  ) {
    return (
      <HomeLoopSection
        title='In Flight'
        count={3}
        status={status}
        isEmpty={isEmpty}
        emptyLabel='Nothing here'
        errorLabel='Could not load'
        onRetry={onRetry}
        skeleton={<p>Skeleton</p>}
        testId='section'
      >
        <p>Body</p>
      </HomeLoopSection>
    );
  }

  it('renders loading, error with retry, empty, and populated in one frame', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <HomeLoopSection
        title='In Flight'
        status='loading'
        isEmpty={false}
        emptyLabel='Nothing here'
        errorLabel='Could not load'
        skeleton={<p>Skeleton</p>}
        testId='section'
      >
        <p>Body</p>
      </HomeLoopSection>
    );
    expect(screen.getByTestId('section')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Skeleton')).toBeVisible();

    rerender(section('error', false, onRetry));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(section('ready', true));
    expect(screen.getByTestId('section')).toHaveAttribute(
      'data-state',
      'empty'
    );
    expect(screen.getByText('Nothing here')).toBeVisible();

    rerender(section('ready', false));
    expect(screen.getByText('Body')).toBeVisible();
    expect(screen.getByTestId('section-count')).toHaveTextContent('3');
  });

  it('replaces a clear empty line when a source warning is present', () => {
    render(
      <HomeLoopSection
        title='Blocked On You'
        status='ready'
        isEmpty
        emptyLabel='Nothing here'
        errorLabel='Could not load'
        notice='Some sources are unavailable.'
        skeleton={<p>Skeleton</p>}
        testId='section'
      >
        <p>Body</p>
      </HomeLoopSection>
    );
    expect(screen.getByTestId('section-notice')).toHaveTextContent(
      'Some sources are unavailable.'
    );
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
});

describe('HomeLoopLatency', () => {
  it('lists slowest stages with regressions named in text', () => {
    render(
      <HomeLoopLatency
        rows={[
          {
            id: 'a',
            label: 'Remediation · Classified',
            p50: '54m',
            p95: '2.3d',
            samples: 126,
            regressed: true,
          },
          {
            id: 'b',
            label: 'Shipping · PR Open',
            p50: '8m',
            p95: '4.2h',
            samples: 570,
            regressed: false,
          },
        ]}
        otherRegressions={['Release · Staging → Verified']}
        coverage='14 of 31 stages measured'
      />
    );
    const rows = screen.getAllByTestId('home-loop-latency-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Regressed');
    expect(rows[0]).toHaveTextContent('2.3d');
    expect(rows[1]).not.toHaveTextContent('Regressed');
    expect(
      screen.getByRole('table', { name: 'Slowest stages by 7-day p95' })
    ).toHaveAttribute('data-table-row-mode', 'dense');
    expect(
      screen.getAllByRole('columnheader').map(header => header.textContent)
    ).toEqual(['Stage', 'P50', 'P95', 'Runs']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-loop-latency')).toHaveTextContent(
      'Also regressed: Release · Staging → Verified · 14 of 31 stages measured'
    );
  });

  it('preserves unknown durations and zero runs on refresh without changing table density', () => {
    const row = {
      id: 'shipping:ready',
      label: 'Shipping · Ready',
      p50: 'Not measured',
      p95: 'Not measured',
      samples: 0,
      regressed: false,
    };
    const { rerender } = render(<HomeLoopLatency rows={[row]} />);
    const table = screen.getByRole('table', {
      name: 'Slowest stages by 7-day p95',
    });
    const stage = screen.getByTestId('home-loop-latency-row');
    expect(within(stage).getAllByText('Not measured')).toHaveLength(2);
    expect(within(stage).getByText('0')).toBeVisible();
    expect(stage).not.toHaveAttribute('tabindex');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');

    rerender(
      <HomeLoopLatency
        rows={[
          { ...row, p50: '3m', p95: '6.5h', samples: 571, regressed: true },
        ]}
      />
    );
    expect(screen.getByRole('table')).toBe(table);
    expect(stage).toHaveTextContent('Regressed');
    expect(stage).toHaveTextContent('6.5h');
    expect(stage).not.toHaveTextContent('Not measured');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
  });

  it('keeps the named table and headers when empty, with optional footer details', () => {
    const { rerender } = render(<HomeLoopLatency rows={[]} />);
    const table = screen.getByRole('table', {
      name: 'Slowest stages by 7-day p95',
    });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(
      screen.queryByTestId('home-loop-latency-row')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('home-loop-latency').querySelector('p')
    ).toBeNull();

    rerender(<HomeLoopLatency rows={[]} coverage='0 of 31 stages measured' />);
    expect(screen.getByText('0 of 31 stages measured')).toBeVisible();
    expect(screen.queryByText(/Also regressed/)).not.toBeInTheDocument();

    rerender(
      <HomeLoopLatency
        rows={[]}
        otherRegressions={['Release · Staging → Verified']}
      />
    );
    expect(
      screen.getByText('Also regressed: Release · Staging → Verified')
    ).toBeVisible();
    expect(screen.getByRole('table')).toBe(table);
  });
});
