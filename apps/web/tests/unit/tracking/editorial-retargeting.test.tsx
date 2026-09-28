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
import type { EditorialRetargetingEntry } from '@/lib/retargeting/editorial';

// --- Shared mock state ---
let _marketingAllowed = true;
let _isDemo = false;
let _isTest = false;
let _isE2E = false;
let _pathname: string | null = '/blog/one-profile-for-your-work';

vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => (
    <script data-testid='next-script' {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => _pathname,
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

let EditorialRetargeting: typeof import('@/features/tracking/EditorialRetargeting').EditorialRetargeting;

beforeAll(async () => {
  const mod = await import('@/features/tracking/EditorialRetargeting');
  EditorialRetargeting = mod.EditorialRetargeting;
});

const ENTRY: EditorialRetargetingEntry = {
  canonicalPath: '/blog/one-profile-for-your-work',
  derivativeId: 'company-identity-customer-explanation',
  contentRevision: '2026-09-28',
};

type FbqMock = ((...args: unknown[]) => void) & { queue?: unknown[] };

function fbqCalls(): unknown[][] {
  const fbq = (globalThis.window as { fbq?: FbqMock }).fbq;
  if (!fbq) return [];
  return (fbq.queue ?? []) as unknown[][];
}

function hasScript(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="next-script"]') !== null;
}

function runtimeState(): string | undefined {
  return globalThis.document.documentElement.dataset.editorialRetargeting;
}

describe('EditorialRetargeting', () => {
  beforeEach(() => {
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    _marketingAllowed = true;
    _pathname = '/blog/one-profile-for-your-work';
    globalThis.JVConsent = undefined;
    const metaWindow = globalThis.window as {
      fbq?: FbqMock;
      _fbq?: FbqMock;
      __jovieMetaPixelInited?: Set<string>;
    };
    delete metaWindow.fbq;
    delete metaWindow._fbq;
    delete metaWindow.__jovieMetaPixelInited;
    delete globalThis.document.documentElement.dataset.editorialRetargeting;
    globalThis.history.replaceState(
      null,
      '',
      '/blog/one-profile-for-your-work'
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('fires a bounded custom event on a registered route with consent', async () => {
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );

    await waitFor(() => expect(hasScript(container)).toBe(true));
    await waitFor(() => {
      expect(fbqCalls()).toContainEqual(['init', 'jv-pixel-1']);
      expect(fbqCalls()).toContainEqual([
        'trackCustom',
        'EditorialArticleView',
        {
          content_path: '/blog/one-profile-for-your-work',
          content_revision: '2026-09-28',
          derivative_id: 'company-identity-customer-explanation',
        },
      ]);
    });
    expect(runtimeState()).toBe('eligible');
  });

  it('emits nothing on an unregistered route', () => {
    _pathname = '/blog/some-other-post';
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(container)).toBe(false);
    expect(runtimeState()).toBe('suppressed-unregistered-route');
  });

  it('emits nothing on private surfaces even if mounted there', () => {
    _pathname = '/investor-portal';
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(container)).toBe(false);
    expect(fbqCalls()).toEqual([]);
  });

  it('suppresses when the live URL carries a sensitive query parameter', () => {
    globalThis.history.replaceState(
      null,
      '',
      '/blog/one-profile-for-your-work?token=abc123'
    );
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(container)).toBe(false);
    expect(runtimeState()).toBe('suppressed-sensitive-query');
  });

  it('emits nothing without marketing consent (denied, revoked, or GPC)', () => {
    _marketingAllowed = false;
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(container)).toBe(false);
    expect(fbqCalls()).toEqual([]);
    expect(runtimeState()).toBe('suppressed-no-consent');
  });

  it('stops firing when consent is revoked via JVConsent', async () => {
    const listeners = new Set<() => void>();
    globalThis.JVConsent = {
      onChange: (cb: () => void) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
    } as NonNullable<typeof globalThis.JVConsent>;

    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    await waitFor(() => expect(hasScript(container)).toBe(true));

    _marketingAllowed = false;
    for (const listener of listeners) listener();
    await waitFor(() => expect(runtimeState()).toBe('suppressed-no-consent'));
  });

  it('emits nothing without a configured pixel id', () => {
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId={undefined} />
    );
    expect(hasScript(container)).toBe(false);
    expect(runtimeState()).toBe('suppressed-unconfigured');
  });

  it('stays suppressed in passive and demo runtimes', () => {
    _isTest = true;
    const { container } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(container)).toBe(false);
    expect(runtimeState()).toBe('suppressed-passive-runtime');
    cleanup();
    _isTest = false;
    _isDemo = true;
    const { container: c2 } = render(
      <EditorialRetargeting entries={[ENTRY]} pixelId='jv-pixel-1' />
    );
    expect(hasScript(c2)).toBe(false);
    expect(runtimeState()).toBe('suppressed-demo-recording');
  });
});
