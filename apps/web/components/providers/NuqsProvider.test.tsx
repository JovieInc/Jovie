import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PathnameContext,
  SearchParamsContext,
} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useQueryState } from 'nuqs';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const state = vi.hoisted(() => ({
  search: new URLSearchParams('tab=releases'),
  router: {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  },
}));

import { NuqsProvider } from './NuqsProvider';

/**
 * nuqs is loaded outside Vite, so a vi.mock of next/navigation never reaches
 * its adapter. Mount the App Router contexts that next/navigation reads.
 */
function AppRouterStub({ children }: { readonly children: ReactNode }) {
  return (
    <AppRouterContext.Provider value={state.router as never}>
      <PathnameContext.Provider value='/app/chat'>
        <SearchParamsContext.Provider value={state.search}>
          {children}
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

function TabSwitcher() {
  const [tab, setTab] = useQueryState('tab');
  return (
    <main>
      <p>Current tab: {tab ?? 'none'}</p>
      <button type='button' onClick={() => void setTab('audience')}>
        Show audience
      </button>
    </main>
  );
}

describe('NuqsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.search = new URLSearchParams('tab=releases');
    globalThis.history.replaceState(null, '', '/app/chat?tab=releases');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads URL state for its children and writes updates back to the URL', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');
    const { container } = render(
      <AppRouterStub>
        <NuqsProvider>
          <TabSwitcher />
        </NuqsProvider>
      </AppRouterStub>
    );

    expect(screen.getByText('Current tab: releases')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show audience' }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('Current tab: audience')).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalled();
    expect(String(replaceState.mock.lastCall?.[2])).toContain('tab=audience');
    replaceState.mockRestore();
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it('renders plain children unchanged, including right-to-left content', async () => {
    const { container } = render(
      <NuqsProvider>
        <main dir='rtl' lang='ar'>
          محتوى الصفحة
        </main>
      </NuqsProvider>
    );

    expect(screen.getByRole('main')).toHaveTextContent('محتوى الصفحة');
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });
});
