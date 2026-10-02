import { cleanup, render, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// --- Shared mock state ---
let _marketingAllowed = true;
let _isDemo = false;
let _isTest = false;
let _isE2E = false;

vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => (
    <script data-testid='next-script' {...props} />
  ),
}));

vi.mock('@/lib/env-client', () => ({
  env: {
    get IS_TEST() {
      return _isTest;
    },
    get IS_E2E() {
      return _isE2E;
    },
  },
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => _isDemo,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return {
    ...original,
    isMarketingAllowed: () => _marketingAllowed,
  };
});

let MetaPixel: typeof import('./MetaPixel').MetaPixel;

beforeAll(async () => {
  const mod = await import('./MetaPixel');
  MetaPixel = mod.MetaPixel;
});

type FbqMock = ((...args: unknown[]) => void) & { queue?: unknown[] };

function fbqCalls(): unknown[][] {
  const fbq = (globalThis.window as { fbq?: FbqMock }).fbq;
  if (!fbq) return [];
  return (fbq.queue ?? []) as unknown[][];
}

function hasScript(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="next-script"]') !== null;
}

describe('MetaPixel', () => {
  beforeEach(() => {
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    _marketingAllowed = true;
    globalThis.JVConsent = undefined;
    const metaWindow = globalThis.window as {
      fbq?: FbqMock;
      _fbq?: FbqMock;
      __jovieMetaPixelInited?: Set<string>;
    };
    delete metaWindow.fbq;
    delete metaWindow._fbq;
    delete metaWindow.__jovieMetaPixelInited;
  });

  afterEach(() => {
    cleanup();
  });

  it('loads fbevents.js and fires init + PageView with consent', async () => {
    const { container } = render(<MetaPixel pixelIds={['px-1', 'px-2']} />);

    await waitFor(() => expect(hasScript(container)).toBe(true));
    await waitFor(() => {
      expect(fbqCalls()).toContainEqual(['init', 'px-1']);
      expect(fbqCalls()).toContainEqual(['init', 'px-2']);
      expect(fbqCalls()).toContainEqual(['track', 'PageView']);
    });
  });

  it('dedupes pixel ids and skips init on remount', async () => {
    const first = render(<MetaPixel pixelIds={['px-1', 'px-1']} />);
    await waitFor(() => expect(fbqCalls()).toContainEqual(['init', 'px-1']));
    first.unmount();

    const before = fbqCalls().length;
    render(<MetaPixel pixelIds={['px-1']} />);

    await waitFor(() =>
      expect(fbqCalls().length).toBeGreaterThanOrEqual(before)
    );
    const initCalls = fbqCalls().filter(
      args => args[0] === 'init' && args[1] === 'px-1'
    );
    expect(initCalls).toHaveLength(1);
  });

  it('emits nothing without marketing consent', async () => {
    _marketingAllowed = false;
    const { container } = render(<MetaPixel pixelIds={['px-1']} />);

    await waitFor(() => expect(fbqCalls()).toEqual([]));
    expect(hasScript(container)).toBe(false);
  });

  it('renders nothing with no pixel ids', () => {
    const { container } = render(<MetaPixel pixelIds={[]} />);
    expect(hasScript(container)).toBe(false);
    expect(fbqCalls()).toEqual([]);
  });

  it('stays suppressed in passive and demo runtimes', () => {
    _isTest = true;
    const { container } = render(<MetaPixel pixelIds={['px-1']} />);
    expect(hasScript(container)).toBe(false);
    expect(fbqCalls()).toEqual([]);
    cleanup();
    _isTest = false;
    _isDemo = true;
    const { container: c2 } = render(<MetaPixel pixelIds={['px-1']} />);
    expect(hasScript(c2)).toBe(false);
    expect(fbqCalls()).toEqual([]);
  });
});
