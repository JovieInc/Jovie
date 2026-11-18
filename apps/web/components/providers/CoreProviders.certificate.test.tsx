import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const pathnameRef = vi.hoisted(() => ({ current: '/app/chat' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));
vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('./LazyProviders', () => ({
  LazyProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('./DeferredAnalytics', () => ({
  DeferredAnalytics: () => <span data-testid='deferred-analytics' hidden />,
}));
vi.mock('./NuqsProvider', () => ({
  NuqsProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('./QueryProvider', () => ({
  QueryProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/lib/hooks/useChunkErrorHandler', () => ({
  useChunkErrorHandler: vi.fn(),
}));
vi.mock('@jovie/ui', () => ({
  TooltipProvider: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

import { CoreProviders } from './CoreProviders';

function makeVisible(element: HTMLElement) {
  element.getClientRects = () =>
    [{ width: 120, height: 32 }] as unknown as DOMRectList;
}

describe('CoreProviders certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pathnameRef.current = '/app/chat';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('focuses the visible search field when "/" is pressed outside a form field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(
      <CoreProviders>
        <main>
          <label htmlFor='app-search'>Search</label>
          <input id='app-search' data-app-search-field='true' />
        </main>
      </CoreProviders>
    );
    const search = screen.getByRole('textbox', { name: 'Search' });
    makeVisible(search);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');

    await user.type(search, '/beats');
    expect(search).toHaveValue('/beats');
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('opens the search trigger when no field is visible, and ignores modified keys', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onTrigger = vi.fn();
    const { container } = render(
      <CoreProviders>
        <main dir='rtl' lang='ar'>
          <button
            type='button'
            data-app-search-trigger='true'
            onClick={onTrigger}
          >
            بحث
          </button>
        </main>
      </CoreProviders>
    );
    makeVisible(screen.getByRole('button', { name: 'بحث' }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await user.keyboard('{Control>}/{/Control}');
    expect(onTrigger).not.toHaveBeenCalled();
    await user.keyboard('/');
    expect(onTrigger).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
