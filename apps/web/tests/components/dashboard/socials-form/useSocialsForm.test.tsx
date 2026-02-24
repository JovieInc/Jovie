import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/dashboard/settings',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock platform detection to pass through URLs
vi.mock('@/lib/utils/platform-detection', () => ({
  normalizeUrl: (url: string) => url,
  validateUrl: () => true,
  getPlatform: (id: string) => (id ? { name: id, id } : null),
  detectPlatform: (url: string) => ({
    platform: { icon: 'website', id: 'website' },
    normalizedUrl: url,
  }),
}));

import { useSocialsForm } from '@/components/dashboard/organisms/socials-form/useSocialsForm';

describe('useSocialsForm - verification', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    // Default: return a website link with pending verification
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          links: [
            {
              id: 'link-1',
              platform: 'website',
              url: 'https://example.com',
              verificationStatus: 'pending',
              verificationToken: 'jovie-verify=abc123',
            },
          ],
        }),
    });
  });

  it('initializes with verificationError as null', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.verificationError).toBeNull();
  });

  it('sends correct POST request when verifyWebsite is called', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    // Set up verification response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          status: 'verified',
          code: 'verified',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    // The second fetch call (first is the query fetch)
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toBe('/api/dashboard/social-links');
    expect(lastCall[1].method).toBe('POST');
    const body = JSON.parse(lastCall[1].body);
    expect(body.profileId).toBe('artist-1');
    expect(body.linkId).toBe('link-1');
  });

  it('updates link status on successful verification', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          status: 'verified',
          code: 'verified',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).toBeNull();
    expect(
      result.current.socialLinks.find(l => l.id === 'link-1')
        ?.verificationStatus
    ).toBe('verified');
  });

  it('sets dns_not_found verification error when DNS record not found', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: false,
          status: 'pending',
          code: 'dns_not_found',
          error: 'DNS TXT record not found yet.',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).toEqual({
      code: 'dns_not_found',
      message: 'DNS TXT record not found yet.',
    });
  });

  it('sets domain_already_claimed error from 409 response', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    // Simulate 409 response (non-ok, so fetchWithTimeout throws FetchError)
    const errorBody = {
      ok: false,
      status: 'pending',
      code: 'domain_already_claimed',
      error: 'This domain has already been verified by another account.',
    };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: () => Promise.resolve(errorBody),
      clone: function () {
        return this;
      },
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).toEqual({
      code: 'domain_already_claimed',
      message: 'This domain has already been verified by another account.',
    });
  });

  it('sets server_error on network failure', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).toEqual({
      code: 'server_error',
      message: 'We could not verify your website. Please try again.',
    });
  });

  it('clearVerificationError resets error state', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    // First trigger an error
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: false,
          status: 'pending',
          code: 'dns_not_found',
          error: 'Not found yet.',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).not.toBeNull();

    // Now clear it
    act(() => {
      result.current.clearVerificationError();
    });

    expect(result.current.verificationError).toBeNull();
  });

  it('clears verification error when starting a new verification', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    // Trigger an error first
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: false,
          status: 'pending',
          code: 'dns_not_found',
          error: 'Not found.',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError?.code).toBe('dns_not_found');

    // Start a new verification - error should be cleared
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          status: 'verified',
          code: 'verified',
        }),
    });

    await act(async () => {
      await result.current.verifyWebsite('link-1');
    });

    expect(result.current.verificationError).toBeNull();
  });

  it('does not call fetch when linkId is empty', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const callCount = mockFetch.mock.calls.length;

    await act(async () => {
      await result.current.verifyWebsite('');
    });

    // No additional fetch call should have been made
    expect(mockFetch.mock.calls.length).toBe(callCount);
  });

  it('sets verifyingLinkId during verification', async () => {
    const { result } = renderHook(
      () => useSocialsForm({ artistId: 'artist-1' }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.socialLinks.length).toBeGreaterThan(0);
    });

    // Use a deferred promise to control timing
    let resolveVerify!: (value: unknown) => void;
    const verifyPromise = new Promise(r => {
      resolveVerify = r;
    });

    mockFetch.mockImplementationOnce(() =>
      verifyPromise.then(() => ({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            status: 'verified',
            code: 'verified',
          }),
      }))
    );

    let verifyDone: Promise<void>;
    act(() => {
      verifyDone = result.current.verifyWebsite('link-1');
    });

    // While in-flight, verifyingLinkId should be set
    expect(result.current.verifyingLinkId).toBe('link-1');

    // Resolve
    await act(async () => {
      resolveVerify(undefined);
      await verifyDone!;
    });

    expect(result.current.verifyingLinkId).toBeNull();
  });
});
