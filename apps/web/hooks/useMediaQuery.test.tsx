// @vitest-environment jsdom

import { act, createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

function MediaQueryProbe() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  return (
    <output data-testid='media-query-probe'>
      {isMobile ? 'mobile' : 'desktop'}
    </output>
  );
}

function createMediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(max-width: 1023px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMediaQuery hydration contract', () => {
  it('keeps the server and first hydration render on the default snapshot', async () => {
    const recoverableErrors: unknown[] = [];
    const mediaQueryList = createMediaQueryList(true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQueryList)
    );

    const tree = createElement(MediaQueryProbe);
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);

    expect(container.textContent).toBe('desktop');

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toBe('mobile');

    await act(async () => {
      root?.unmount();
    });
  });
});
