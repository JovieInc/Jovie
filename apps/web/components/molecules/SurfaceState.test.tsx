import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SurfaceState, type SurfaceStateProps } from './SurfaceState';

const baseProps: SurfaceStateProps = {
  state: 'loaded',
  loadingMode: 'section',
  label: 'Loading releases',
  children: <button type='button'>Open release</button>,
  loading: <div data-testid='loading'>Loading geometry</div>,
  empty: <div data-testid='empty'>No releases</div>,
  error: <div data-testid='error'>Could not load releases</div>,
  status: <span>Updating</span>,
  minHeightClassName: 'min-h-64',
};

describe('SurfaceState', () => {
  it('retains content and keyboard focus during background refresh', () => {
    const { rerender } = render(<SurfaceState {...baseProps} />);
    const action = screen.getByRole('button', { name: 'Open release' });
    action.focus();

    rerender(
      <SurfaceState
        {...baseProps}
        state='refreshing'
        loadingMode='background-refresh'
      />
    );

    expect(screen.getByRole('button', { name: 'Open release' })).toBe(action);
    expect(action).toHaveFocus();
    expect(
      screen.getByRole('status', { name: 'Loading releases' })
    ).toHaveTextContent('Updating');
  });

  it('exposes busy state only for loading and refresh', () => {
    const { rerender } = render(
      <SurfaceState {...baseProps} state='loading' />
    );
    const frame = document.querySelector('[data-slot="surface-state-frame"]');
    expect(frame).toHaveAttribute('aria-busy', 'true');

    rerender(<SurfaceState {...baseProps} state='loaded' />);
    expect(frame).toHaveAttribute('aria-busy', 'false');
  });
});
