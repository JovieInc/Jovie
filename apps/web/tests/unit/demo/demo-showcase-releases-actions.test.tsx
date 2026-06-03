import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseExperienceAdapter } from '@/features/dashboard/organisms/release-provider-matrix/types';

const mocks = vi.hoisted(() => ({
  clipboardWriteText: vi.fn(() => Promise.resolve()),
  searchParams: {
    current: new URLSearchParams('state=connected-empty'),
  },
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/demo/showcase/releases',
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => mocks.searchParams.current,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/features/demo/DemoAuthShell', () => ({
  DemoAuthShell: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='demo-auth-shell'>{children}</div>
  ),
}));

vi.mock('@/features/demo/DemoReleasesExperience', () => ({
  DemoReleasesExperience: () => <div data-testid='demo-releases-experience' />,
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/ReleasesExperience',
  () => ({
    ReleasesExperience: ({
      experienceAdapter,
    }: {
      readonly experienceAdapter?: ReleaseExperienceAdapter;
    }) => (
      <div data-testid='stub-releases-experience'>
        <button type='button' onClick={() => experienceAdapter?.onSync?.()}>
          Sync adapter
        </button>
        <button
          type='button'
          onClick={() => experienceAdapter?.onCreateRelease?.()}
        >
          Create adapter
        </button>
        <button
          type='button'
          onClick={() =>
            void experienceAdapter?.onCopy?.(
              '/demo-copy',
              'Smart link',
              'copy-smart-link'
            )
          }
        >
          Copy adapter
        </button>
        <button
          type='button'
          onClick={() =>
            void experienceAdapter?.onSaveMetadata?.('release-1', {
              label: 'Demo Label',
              upc: '123456789012',
            })
          }
        >
          Save metadata adapter
        </button>
        <button
          type='button'
          onClick={() =>
            void experienceAdapter?.onSavePrimaryIsrc?.(
              'release-1',
              'USJV12600001'
            )
          }
        >
          Save ISRC adapter
        </button>
      </div>
    ),
  })
);

const { DemoShowcaseSurface } = await import(
  '@/features/demo/DemoShowcaseSurface'
);

describe('DemoShowcaseSurface release actions', () => {
  beforeEach(() => {
    mocks.searchParams.current = new URLSearchParams('state=connected-empty');
    mocks.clipboardWriteText.mockClear();
    mocks.toastError.mockClear();
    mocks.toastInfo.mockClear();
    mocks.toastSuccess.mockClear();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: mocks.clipboardWriteText,
      },
    });
  });

  it('wires showcase release actions to demo feedback instead of no-op callbacks', async () => {
    render(<DemoShowcaseSurface surface='releases' />);

    fireEvent.click(screen.getByRole('button', { name: 'Sync adapter' }));
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Spotify sync is disabled in demo mode'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create adapter' }));
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Creating releases is disabled in demo mode'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy adapter' }));

    await waitFor(() => {
      expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
        expect.stringContaining('/demo-copy')
      );
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Smart link copied (demo)'
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Save metadata adapter' })
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Metadata editing is disabled in demo mode'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save ISRC adapter' }));
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'Primary ISRC editing is disabled in demo mode'
    );
  });
});
