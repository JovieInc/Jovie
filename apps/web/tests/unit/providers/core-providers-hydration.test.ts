// @vitest-environment jsdom

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitFor } from '@testing-library/react';
import { act, createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { toast as sonnerToast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/chat',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}));

vi.mock('@/lib/env-client', () => ({
  env: {
    IS_E2E: false,
    IS_TEST: true,
  },
}));

vi.mock('@/lib/hooks/useCookieBannerHeight', () => ({
  useCookieBannerHeight: () => 0,
}));

import { LazyProviders } from '@/components/providers/LazyProviders';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const coreProvidersSource = readFileSync(
  resolve(webRoot, 'components/providers/CoreProviders.tsx'),
  'utf8'
);

function findFeedbackProviderMounts(directory: string): string[] {
  const mounts: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === '.next' ||
      entry.name === 'node_modules' ||
      entry.name === 'tests'
    ) {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      mounts.push(...findFeedbackProviderMounts(entryPath));
      continue;
    }

    if (
      !entry.name.endsWith('.tsx') ||
      entry.name.includes('.test.') ||
      entry.name.includes('.spec.') ||
      entry.name.includes('.stories.')
    ) {
      continue;
    }

    if (/<FeedbackProvider(?:\s|>)/.test(readFileSync(entryPath, 'utf8'))) {
      mounts.push(relative(webRoot, entryPath));
    }
  }

  return mounts;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('CoreProviders hydration contract (JOV-4505)', () => {
  it('keeps the global feedback tree out of a dynamic hydration boundary', () => {
    expect(coreProvidersSource).toContain(
      "import { LazyProviders } from './LazyProviders';"
    );
    expect(coreProvidersSource).not.toContain("from 'next/dynamic'");
    expect(coreProvidersSource).not.toMatch(
      /const LazyProviders = dynamic[\s\S]*?\{[\s\S]*?ssr:\s*true/
    );
  });

  it('keeps one source owner for the global feedback mount', () => {
    expect(findFeedbackProviderMounts(webRoot)).toEqual([
      'components/providers/LazyProviders.tsx',
    ]);
  });

  it('hydrates before mounting exactly one Sonner viewport', async () => {
    const recoverableErrors: unknown[] = [];
    const consoleErrors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });

    const tree = createElement(
      LazyProviders,
      { enableAnalytics: false },
      createElement('main', { 'data-testid': 'hydration-child' }, 'Workspace')
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);

    expect(container.querySelector('[aria-label^="Notifications"]')).toBeNull();
    expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(0);

    // Match the runtime failure boundary: feedback may be queued while the
    // server-rendered shell is still hydrating. The canonical provider must
    // keep Sonner out of both SSR and the first client render.
    const queuedToastId = sonnerToast('Queued hydration probe', {
      duration: Number.POSITIVE_INFINITY,
    });

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(
      consoleErrors.filter(args =>
        args.some(value => /hydrat/i.test(String(value)))
      )
    ).toEqual([]);
    expect(container.querySelector('[data-testid="hydration-child"]')).not.toBe(
      null
    );

    sonnerToast.dismiss(queuedToastId);

    // Sonner commits its toast list only after the canonical client mount.
    // Duplicate provider mounts would each subscribe to the same store and
    // render duplicate viewports.
    const toastId = sonnerToast('Hydration probe', {
      duration: Number.POSITIVE_INFINITY,
    });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(
        1
      );
    });
    sonnerToast.dismiss(toastId);

    await act(async () => {
      root?.unmount();
    });
  });
});
