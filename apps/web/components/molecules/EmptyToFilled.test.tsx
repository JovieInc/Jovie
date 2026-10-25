import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmptyToFilled } from './EmptyToFilled';

function panes(): { empty: HTMLElement; filled: HTMLElement } {
  const root = screen.getByTestId('swap-region');
  return {
    empty: root.querySelector('[data-pane="empty"]') as HTMLElement,
    filled: root.querySelector('[data-pane="filled"]') as HTMLElement,
  };
}

const EMPTY_PANE = <p>No releases yet</p>;
const FILLED_PANE = <p>First release</p>;

describe('EmptyToFilled', () => {
  it('shows the empty pane first and keeps the filled pane mounted in the same grid cell', () => {
    render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        {FILLED_PANE}
      </EmptyToFilled>
    );

    const { empty, filled } = panes();
    expect(screen.getByText('No releases yet')).toBeInTheDocument();
    expect(empty).toHaveClass('opacity-100');
    expect(filled).toHaveClass('invisible', 'opacity-0');

    // Height reservation: both panes occupy the same grid cell, so the
    // region always reserves the larger of the two heights.
    expect(empty).toHaveClass('col-start-1', 'row-start-1');
    expect(filled).toHaveClass('col-start-1', 'row-start-1');
    expect(screen.getByText('First release')).toBeInTheDocument();
  });

  it('swaps panes on state change with exactly one token-timed transition and reduced-motion fallback', () => {
    const { rerender } = render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        {FILLED_PANE}
      </EmptyToFilled>
    );

    for (const pane of Object.values(panes())) {
      expect(pane).toHaveClass(
        'transition-opacity',
        'duration-subtle',
        'ease-subtle',
        'motion-reduce:transition-none'
      );
      expect(pane.className).not.toContain('transition-[');
    }

    rerender(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        {FILLED_PANE}
      </EmptyToFilled>
    );

    const { empty, filled } = panes();
    expect(filled).toHaveClass('opacity-100');
    expect(empty).toHaveClass('invisible', 'opacity-0');
  });

  it('announces the swap through a polite live region', () => {
    const { rerender } = render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        {FILLED_PANE}
      </EmptyToFilled>
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Catalog is empty');

    rerender(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        {FILLED_PANE}
      </EmptyToFilled>
    );
    expect(status).toHaveTextContent('Releases loaded');
  });

  it('moves focus to the new content first actionable element when the focused element is swapped out', () => {
    const { rerender } = render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={
          <div>
            <p>Nothing here yet</p>
            <button type='button'>Connect Spotify</button>
          </div>
        }
      >
        <div>
          <p>Release ready</p>
          <button type='button'>View release</button>
        </div>
      </EmptyToFilled>
    );

    const emptyButton = screen.getByRole('button', {
      name: 'Connect Spotify',
    });
    emptyButton.focus();
    expect(emptyButton).toHaveFocus();

    rerender(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={
          <div>
            <p>Nothing here yet</p>
            <button type='button'>Connect Spotify</button>
          </div>
        }
      >
        <div>
          <p>Release ready</p>
          <button type='button'>View release</button>
        </div>
      </EmptyToFilled>
    );

    expect(screen.getByRole('button', { name: 'View release' })).toHaveFocus();
  });

  it('falls back to the new pane container when the new content has no actionable element', () => {
    const emptyPane = (
      <button type='button' onClick={() => {}}>
        Connect Spotify
      </button>
    );
    const { rerender } = render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={emptyPane}
      >
        <p>Release ready</p>
      </EmptyToFilled>
    );

    screen.getByRole('button', { name: 'Connect Spotify' }).focus();

    rerender(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={emptyPane}
      >
        <p>Release ready</p>
      </EmptyToFilled>
    );

    const { filled } = panes();
    expect(filled).toHaveFocus();
  });

  it('moves focus back to the empty pane action when swapping filled back to empty', () => {
    const emptyPane = (
      <button type='button' onClick={() => {}}>
        Connect Spotify
      </button>
    );
    const filledPane = (
      <button type='button' onClick={() => {}}>
        View release
      </button>
    );
    const { rerender } = render(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={emptyPane}
      >
        {filledPane}
      </EmptyToFilled>
    );

    screen.getByRole('button', { name: 'View release' }).focus();

    rerender(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={emptyPane}
      >
        {filledPane}
      </EmptyToFilled>
    );

    expect(
      screen.getByRole('button', { name: 'Connect Spotify' })
    ).toHaveFocus();
  });

  it('never steals focus when focus lives outside the swap region', () => {
    const { rerender } = render(
      <div>
        <button type='button'>Outside button</button>
        <EmptyToFilled
          state='empty'
          announcement='Catalog is empty'
          testId='swap-region'
          empty={EMPTY_PANE}
        >
          <button type='button'>View release</button>
        </EmptyToFilled>
      </div>
    );

    const outside = screen.getByRole('button', { name: 'Outside button' });
    outside.focus();
    expect(outside).toHaveFocus();

    rerender(
      <div>
        <button type='button'>Outside button</button>
        <EmptyToFilled
          state='filled'
          announcement='Releases loaded'
          testId='swap-region'
          empty={EMPTY_PANE}
        >
          <button type='button'>View release</button>
        </EmptyToFilled>
      </div>
    );

    expect(outside).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'View release' })
    ).not.toHaveFocus();
  });

  it('keeps working controls interactive in the visible pane', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        <button type='button' onClick={onClick}>
          View release
        </button>
      </EmptyToFilled>
    );

    fireEvent.click(screen.getByRole('button', { name: 'View release' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={EMPTY_PANE}
      >
        <button type='button' onClick={onClick}>
          View release
        </button>
      </EmptyToFilled>
    );
    fireEvent.click(screen.getByRole('button', { name: 'View release' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('passes an axe audit in the empty state', async () => {
    const { container } = render(
      <EmptyToFilled
        state='empty'
        announcement='Catalog is empty'
        testId='swap-region'
        empty={
          <output>
            <h3>No releases yet</h3>
            <p>Connect a provider to import your catalog.</p>
          </output>
        }
      >
        <p>First release</p>
      </EmptyToFilled>
    );
    await expectNoA11yViolations(container);
  });

  it('passes an axe audit in the filled state', async () => {
    const { container } = render(
      <EmptyToFilled
        state='filled'
        announcement='Releases loaded'
        testId='swap-region'
        empty={
          <output>
            <h3>No releases yet</h3>
            <p>Connect a provider to import your catalog.</p>
          </output>
        }
      >
        <div>
          <h3>Latest release</h3>
          <button type='button'>View release</button>
        </div>
      </EmptyToFilled>
    );
    await expectNoA11yViolations(container);
  });
});
