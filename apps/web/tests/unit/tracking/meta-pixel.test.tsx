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

// Mock next/script to a plain element
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

// Import the component AFTER mocks are set up
let MetaPixel: typeof import('@/features/tracking/MetaPixel').MetaPixel;

beforeAll(async () => {
  const mod = await import('@/features/tracking/MetaPixel');
  MetaPixel = mod.MetaPixel;
});

type FbqMock = ReturnType<typeof vi.fn> & { queue?: unknown[] };

type MetaWindow = Window & {
  fbq?: FbqMock;
  _fbq?: FbqMock;
  __jovieMetaPixelInited?: Set<string>;
};

function metaWindow(): MetaWindow {
  return globalThis.window as MetaWindow;
}

function fbqCalls(): unknown[][] {
  const fbq = metaWindow().fbq;
  if (!fbq) return [];
  // Pre-existing fbq may be a vi.fn (mock.calls); the component's own stub
  // records queued calls on fbq.queue until fbevents.js drains it.
  return (fbq.mock?.calls ?? fbq.queue ?? []) as unknown[][];
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
    delete metaWindow().fbq;
    delete metaWindow()._fbq;
    delete metaWindow().__jovieMetaPixelInited;
  });

  afterEach(() => {
    cleanup();
  });

  it('inits each pixel ID and fires a PageView when marketing is allowed', async () => {
    const { container } = render(<MetaPixel pixelIds={['123', '456']} />);

    await waitFor(() => expect(hasScript(container)).toBe(true));
    await waitFor(() => {
      expect(fbqCalls()).toContainEqual(['init', '123']);
      expect(fbqCalls()).toContainEqual(['init', '456']);
      expect(fbqCalls()).toContainEqual(['track', 'PageView']);
    });
    expect(
      container.querySelector('[data-testid="next-script"]')
    ).toHaveAttribute('src', 'https://connect.facebook.net/en_US/fbevents.js');
  });

  it('renders nothing and never defines fbq without pixel IDs', () => {
    const { container } = render(<MetaPixel pixelIds={[]} />);
    expect(hasScript(container)).toBe(false);
    expect(metaWindow().fbq).toBeUndefined();
  });

  it('dedupes repeated pixel IDs', async () => {
    render(<MetaPixel pixelIds={['123', '123']} />);
    await waitFor(() => expect(fbqCalls()).toContainEqual(['init', '123']));
    const initCalls = fbqCalls().filter(
      call => call[0] === 'init' && call[1] === '123'
    );
    expect(initCalls).toHaveLength(1);
  });

  it('stays suppressed in passive runtimes', () => {
    _isTest = true;
    const { container, unmount } = render(<MetaPixel pixelIds={['123']} />);
    expect(hasScript(container)).toBe(false);
    expect(metaWindow().fbq).toBeUndefined();

    unmount();
    _isTest = false;
    _isE2E = true;
    const { container: c2 } = render(<MetaPixel pixelIds={['123']} />);
    expect(hasScript(c2)).toBe(false);
    expect(metaWindow().fbq).toBeUndefined();
  });

  it('stays suppressed during demo recording', () => {
    _isDemo = true;
    const { container } = render(<MetaPixel pixelIds={['123']} />);
    expect(hasScript(container)).toBe(false);
    expect(metaWindow().fbq).toBeUndefined();
  });

  it('does not fire when marketing consent is rejected', () => {
    _marketingAllowed = false;
    const { container } = render(<MetaPixel pixelIds={['123']} />);
    expect(hasScript(container)).toBe(false);
    expect(metaWindow().fbq).toBeUndefined();
  });

  it('does not re-init an ID across mounts but fires PageView per mount', async () => {
    const first = render(<MetaPixel pixelIds={['123']} />);
    await waitFor(() =>
      expect(fbqCalls()).toContainEqual(['track', 'PageView'])
    );
    first.unmount();

    render(<MetaPixel pixelIds={['123']} />);
    await waitFor(() => {
      const pageViews = fbqCalls().filter(
        call => call[0] === 'track' && call[1] === 'PageView'
      );
      expect(pageViews).toHaveLength(2);
    });
    const initCalls = fbqCalls().filter(
      call => call[0] === 'init' && call[1] === '123'
    );
    expect(initCalls).toHaveLength(1);
  });
});
