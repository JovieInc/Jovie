import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProfileNotificationsController } from '@/components/organisms/hooks/useProfileNotificationsController';

const mockStatusQuery = vi.fn();
const mockUnsubscribeMutation = vi.fn();

// simple localStorage mock for JSDOM-less env
const localStore: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => localStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStore[key] = value;
  },
  removeItem: (key: string) => {
    delete localStore[key];
  },
  clear: () => {
    Object.keys(localStore).forEach(k => delete localStore[k]);
  },
  key: (index: number) => Object.keys(localStore)[index] ?? null,
  get length() {
    return Object.keys(localStore).length;
  },
} as unknown as Storage;

vi.mock('@/lib/queries', () => ({
  useNotificationStatusQuery: (...args: unknown[]) => mockStatusQuery(...args),
  useUnsubscribeNotificationsMutation: () => ({
    mutateAsync: mockUnsubscribeMutation,
  }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const noop = () => undefined;

describe('useProfileNotificationsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('hydrates from cached status without hitting status query', () => {
    // Seed stored contacts + cached status
    localStorage.setItem(
      'jovie:notification-contacts',
      JSON.stringify({ email: 'fan@example.com' })
    );
    localStorage.setItem(
      'jovie:notification-status-cache',
      JSON.stringify({
        artistId: 'artist-1',
        channels: { email: true },
        details: { email: 'fan@example.com' },
        timestamp: Date.now(),
      })
    );

    mockStatusQuery.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useProfileNotificationsController({
        artistId: 'artist-1',
        artistHandle: 'test',
        notificationsEnabled: true,
        onError: noop,
        onSuccess: noop,
      })
    );

    expect(mockStatusQuery).not.toHaveBeenCalled();
    expect(result.current.state).toBe('success');
    expect(result.current.subscribedChannels.email).toBe(true);
    expect(result.current.subscriptionDetails.email).toBe('fan@example.com');
  });

  it('rolls back unsubscribe on mutation failure', async () => {
    mockStatusQuery.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: false,
    });
    mockUnsubscribeMutation.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() =>
      useProfileNotificationsController({
        artistId: 'artist-1',
        artistHandle: 'test',
        notificationsEnabled: true,
        onError: noop,
        onSuccess: noop,
      })
    );

    // Seed initial subscribed state
    act(() => {
      result.current.setSubscribedChannels({ email: true });
      result.current.setSubscriptionDetails({ email: 'fan@example.com' });
      result.current.setState('success');
    });

    await act(async () => {
      await result.current.handleUnsubscribe('email');
    });

    // Should roll back to subscribed
    expect(result.current.subscribedChannels.email).toBe(true);
    expect(result.current.subscriptionDetails.email).toBe('fan@example.com');
  });
});
