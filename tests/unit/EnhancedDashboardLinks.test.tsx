import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

async function loadEnhancedDashboardLinks() {
  const importedModule = await import(
    '@/components/dashboard/organisms/EnhancedDashboardLinks'
  );
  return importedModule.EnhancedDashboardLinks;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: false }),
}));

vi.mock('@/components/dashboard/molecules/ProfilePreview', () => ({
  ProfilePreview: ({
    username,
    avatarUrl,
  }: {
    username: string;
    avatarUrl?: string | null;
  }) => (
    <div data-testid='profile-preview'>
      {username}
      {avatarUrl ? `-${avatarUrl}` : ''}
    </div>
  ),
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: Object.assign(
    React.forwardRef<HTMLDivElement, { className?: string }>(
      function AvatarUploadableMock({ className }, ref) {
        return (
          <div
            ref={ref}
            className={className}
            data-testid='avatar-uploadable'
          />
        );
      }
    ),
    { displayName: 'AvatarUploadable' }
  ),
}));

vi.mock('@/components/atoms/Input', () => ({
  Input: Object.assign(
    React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
      function InputMock(props, ref) {
        return <input ref={ref} {...props} />;
      }
    ),
    { displayName: 'Input' }
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...inputs: Array<string | undefined | null | false>) =>
    inputs.filter(Boolean).join(' '),
  slugify: (text: string): string =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  debounce: <T extends (...args: unknown[]) => unknown>(
    func: T,
    _wait: number
  ): ((...args: Parameters<T>) => void) & {
    cancel: () => void;
    flush: () => void;
  } => {
    void _wait;
    const debounced = (...args: Parameters<T>): void => {
      try {
        const result = func(...args);
        if (result instanceof Promise) {
          void result.catch(() => undefined);
        }
      } catch {
        // ignore
      }
    };

    (
      debounced as typeof debounced & {
        cancel: () => void;
        flush: () => void;
      }
    ).cancel = () => {};
    (
      debounced as typeof debounced & {
        cancel: () => void;
        flush: () => void;
      }
    ).flush = () => {};

    return debounced as ((...args: Parameters<T>) => void) & {
      cancel: () => void;
      flush: () => void;
    };
  },
}));

vi.mock('@/types', () => ({
  getSocialPlatformLabel: (platform: string) => platform,
}));

vi.mock('@/app/app/dashboard/DashboardDataContext', () => ({
  DashboardDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dashboard-data-provider'>{children}</div>
  ),
  useDashboardData: () => ({
    user: { id: 'user_123' },
    creatorProfiles: [],
    selectedProfile: { id: 'profile_123' },
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    isAdmin: false,
  }),
}));

vi.mock('@/app/app/dashboard/PreviewPanelContext', () => ({
  usePreviewPanel: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    previewData: null,
    setPreviewData: vi.fn(),
  }),
}));

vi.mock('@/types/db', () => ({
  convertDrizzleCreatorProfileToArtist: vi.fn(() => ({
    id: 'artist_123',
    owner_user_id: 'user_123',
    handle: 'handle',
    spotify_id: '',
    name: 'Artist',
    image_url: undefined,
    tagline: undefined,
    theme: undefined,
    settings: { hide_branding: false },
    spotify_url: undefined,
    apple_music_url: undefined,
    youtube_url: undefined,
    venmo_handle: undefined,
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
  })),
}));

vi.mock('@/components/dashboard/organisms/GroupedLinksManager', () => ({
  GroupedLinksManager: ({
    onLinksChange,
  }: {
    onLinksChange: (links: unknown[]) => void;
  }) => {
    const calledRef = React.useRef(false);

    React.useEffect(() => {
      if (calledRef.current) return;
      calledRef.current = true;

      onLinksChange([
        {
          platform: {
            id: 'website',
            name: 'Website',
            category: 'custom',
            icon: 'website',
            color: '000000',
            placeholder: 'https://example.com',
          },
          normalizedUrl: 'https://example.com',
          originalUrl: 'https://example.com',
          suggestedTitle: 'Website',
          isValid: true,
        },
      ]);
    }, [onLinksChange]);
    return <div data-testid='grouped-links-manager' />;
  },
}));

describe.skip('EnhancedDashboardLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces API error messages from social-links endpoint', async () => {
    const EnhancedDashboardLinks = await loadEnhancedDashboardLinks();
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = init?.method ?? 'GET';

        if (url.includes('/api/dashboard/social-links') && method === 'PUT') {
          return new Response(
            JSON.stringify({ error: 'Server validation error' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          ) as unknown as Response;
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response;
      });

    const { unmount } = render(<EnhancedDashboardLinks initialLinks={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Server validation error');
    });

    unmount();
    fetchMock.mockRestore();
  });

  it('shows success toast when social-links save succeeds', async () => {
    const EnhancedDashboardLinks = await loadEnhancedDashboardLinks();
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = init?.method ?? 'GET';

        if (url.includes('/api/dashboard/social-links') && method === 'PUT') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }) as unknown as Response;
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as unknown as Response;
      });

    const { unmount } = render(<EnhancedDashboardLinks initialLinks={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Links saved successfully')
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

    unmount();
    fetchMock.mockRestore();
  });
});
