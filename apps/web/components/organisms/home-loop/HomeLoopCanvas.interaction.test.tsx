import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOME_LOOP_FIXTURE_COPY, HOME_LOOP_FIXTURE_STAGES } from './fixtures';
import { HomeLoopCanvas, type HomeLoopCanvasProps } from './HomeLoopCanvas';

function props(
  overrides: Partial<HomeLoopCanvasProps> = {}
): HomeLoopCanvasProps {
  return {
    copy: HOME_LOOP_FIXTURE_COPY,
    stages: HOME_LOOP_FIXTURE_STAGES,
    constraint: null,
    pulse: [],
    asks: [],
    rows: [],
    done: [],
    loopStatus: 'ready',
    asksStatus: 'ready',
    answers: {},
    onApprove: vi.fn(),
    onReply: vi.fn(),
    onRetryLoop: vi.fn(),
    sectionSummaries: {
      asks: '0 open decisions',
      inFlight: '0 items in flight',
      done: '0 merges today',
    },
    ...overrides,
  };
}

describe('Ovie editorial overview', () => {
  it('starts with four independent summaries and no detail footprint', () => {
    render(<HomeLoopCanvas {...props()} />);
    const toggles = screen.getAllByRole('button', { expanded: false });
    expect(toggles).toHaveLength(4);
    expect(
      screen.queryByTestId('home-loop-asks-section')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('home-loop-in-flight-section')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /In Flight ·/ }));
    expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
      'data-state',
      'empty'
    );
    expect(
      screen.queryByTestId('home-loop-asks-section')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Done Today ·/ }));
    expect(screen.getByTestId('home-loop-done-section')).toHaveClass('w-full');
    expect(screen.getByTestId('home-loop-done-section')).not.toHaveClass(
      '@7xl:w-1/4'
    );
    expect(screen.getByTestId('home-loop-canvas')).toHaveClass(
      'overflow-y-auto'
    );
    fireEvent.click(screen.getByRole('button', { name: /In Flight ·/ }));
    expect(
      screen.queryByTestId('home-loop-in-flight-section')
    ).not.toBeInTheDocument();
  });

  it.each(['loading', 'error', 'ready'] as const)(
    'keeps the disclosure open across a %s refresh',
    state => {
      const initial = props({ loopStatus: 'loading' });
      const { rerender } = render(<HomeLoopCanvas {...initial} />);
      const toggle = screen.getByRole('button', { name: /In Flight ·/ });
      fireEvent.click(toggle);
      rerender(<HomeLoopCanvas {...initial} loopStatus={state} />);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('home-loop-in-flight-section')).toHaveAttribute(
        'data-state',
        state === 'ready' ? 'empty' : state
      );
      if (state === 'error') {
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(initial.onRetryLoop).toHaveBeenCalledOnce();
      }
    }
  );
});
