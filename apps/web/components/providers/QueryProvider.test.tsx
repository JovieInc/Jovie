import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryProvider } from './QueryProvider';

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

afterEach(() => {
  vi.unstubAllEnvs();
  chrome.disabled = false;
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
