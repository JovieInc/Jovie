import { useQueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifiedQueryRetry,
  classifiedQueryRetryDelay,
} from '@/lib/queries/retry-policy';
import {
  QueryProvider,
  resetBrowserQueryClientForTests,
} from './QueryProvider';

const chrome = vi.hoisted(() => ({ disabled: false }));
vi.mock('@/lib/demo-recording', () => ({
  isDevChromeDisabledClient: () => chrome.disabled,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function DevtoolsFixture() {
      return <aside data-testid='query-devtools'>Query devtools</aside>;
    },
}));
vi.mock('@/components/feedback', () => ({
  getFeedbackErrorMessage: () => 'Request failed',
  toast: { error: vi.fn() },
}));

beforeEach(() => {
  resetBrowserQueryClientForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  chrome.disabled = false;
  resetBrowserQueryClientForTests();
});

function QueryDefaultsProbe() {
  const queryClient = useQueryClient();
  const defaults = queryClient.getDefaultOptions();
  return (
    <output
      data-testid='query-defaults'
      data-retry={defaults.queries?.retry === classifiedQueryRetry}
      data-retry-delay={
        defaults.queries?.retryDelay === classifiedQueryRetryDelay
      }
      data-mutation-retry={String(defaults.mutations?.retry)}
    />
  );
}

describe('QueryProvider retry defaults', () => {
  it('wires the classified retry policy to queries and keeps mutations at zero', () => {
    render(
      <QueryProvider>
        <QueryDefaultsProbe />
      </QueryProvider>
    );
    const probe = screen.getByTestId('query-defaults');
    expect(probe.dataset.retry).toBe('true');
    expect(probe.dataset.retryDelay).toBe('true');
    expect(probe.dataset.mutationRetry).toBe('0');
  });
});

describe('QueryProvider devtools hydration', () => {
  it('omits browser-only chrome from SSR and hydrates when runtime flags disable it', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    chrome.disabled = false;
    const tree = (
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    const html = renderToString(tree);
    // Deliberate regression guard: the old loader renders devtools here,
    // before window/document chrome flags become available.
    expect(html).not.toContain('query-devtools');
    expect(html).toContain('Profile content');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    chrome.disabled = true;
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: error => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(
        container.querySelector('[data-testid="query-devtools"]')
      ).toBeNull();
      expect(container.textContent).toBe('Profile content');
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('loads devtools after mounting in local development with chrome enabled', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    expect(screen.getByTestId('query-devtools')).toBeVisible();
  });

  it('keeps devtools absent after mounting outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(
      <QueryProvider>
        <p>Profile content</p>
      </QueryProvider>
    );
    expect(screen.queryByTestId('query-devtools')).toBeNull();
  });
});
