import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminTableShell } from './AdminTableShell';

describe('AdminTableShell', () => {
  it('renders toolbar, children, and footer regions', () => {
    render(
      <AdminTableShell
        testId='shell'
        toolbar={<div>Toolbar</div>}
        footer={<div>Footer</div>}
      >
        {({ headerElevated, stickyTopPx }) => (
          <div data-testid='table-body'>
            {String(headerElevated)}:{stickyTopPx}
          </div>
        )}
      </AdminTableShell>
    );

    expect(screen.getByText('Toolbar')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    expect(screen.getByTestId('table-body')).toHaveTextContent('false:');
  });

  it('elevates the sticky header once the scroll container scrolls', () => {
    render(
      <AdminTableShell
        testId='shell'
        toolbar={<div>Toolbar</div>}
        scrollContainerProps={{ 'data-testid': 'scroller' }}
      >
        {({ headerElevated }) => (
          <div data-testid='table-body'>{String(headerElevated)}</div>
        )}
      </AdminTableShell>
    );

    // Move past the scroll-handler throttle window opened at mount.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 1000);

    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      value: 40,
    });
    fireEvent.scroll(scroller);
    vi.useRealTimers();

    expect(screen.getByTestId('table-body')).toHaveTextContent('true');
  });

  it('uses the external scroll container ref when provided', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <AdminTableShell scrollContainerRef={ref}>
        {() => <div>Rows</div>}
      </AdminTableShell>
    );

    expect(ref.current).not.toBeNull();
    expect(screen.getByText('Rows')).toBeInTheDocument();
  });
});
