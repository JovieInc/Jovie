// @vitest-environment jsdom

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardReleasesDemo } from '@/components/features/home/demo/DashboardReleasesDemo';
import { DEMO_REFERENCE_CLOCK_ISO } from '@/lib/demo-reference-clock';

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleaseTable',
  async () => {
    const { dropDateMeta } = await import('@/lib/format-drop-date');
    return {
      ReleaseTable: ({
        dropDateReferenceIso,
      }: Readonly<{ dropDateReferenceIso?: string }>) => (
        <span data-reference-now={dropDateReferenceIso}>
          {
            dropDateMeta(
              '2025-08-08',
              dropDateReferenceIso ? new Date(dropDateReferenceIso) : undefined
            ).label
          }
        </span>
      ),
    };
  }
);

class IntersectionObserverStub {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DashboardReleasesDemo hydration', () => {
  it('threads one reference clock through SSR and hydration', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const layout = <DashboardReleasesDemo />;
    const serverMarkup = renderToString(layout);
    const container = document.createElement('div');
    container.innerHTML = serverMarkup;
    document.body.append(container);

    vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;

    await act(async () => {
      root = hydrateRoot(container, layout);
    });

    expect(container.querySelector('[data-reference-now]')).toHaveAttribute(
      'data-reference-now',
      DEMO_REFERENCE_CLOCK_ISO
    );
    expect(container.textContent).toContain('251d ago');
    expect(
      consoleError.mock.calls.some(call =>
        call.some(argument =>
          String(argument).match(/hydration|did not match/iu)
        )
      )
    ).toBe(false);

    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
