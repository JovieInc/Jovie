import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCTION_WAITLIST_CANARY_STORAGE_KEY } from '@/lib/canaries/production-waitlist-client';

const mockTrack = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics', () => ({ track: mockTrack }));
vi.mock('@/features/auth', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/features/waitlist/WaitlistOutcomeView', () => ({
  WaitlistOutcomeView: () => <div>waitlist receipt</div>,
}));

import { WaitlistSuccessView } from '@/components/features/waitlist/WaitlistSuccessView';

describe('WaitlistSuccessView canary analytics receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call the canary receipt route for a normal waitlist view', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    render(<WaitlistSuccessView />);

    expect(mockTrack).toHaveBeenCalledWith('waitlist_confirmation_viewed', {
      surface: 'waitlist_receipt',
      outcome: 'pending',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('records the current synthetic run and clears the one-shot marker', async () => {
    sessionStorage.setItem(PRODUCTION_WAITLIST_CANARY_STORAGE_KEY, '123-1');
    const request = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', request);

    render(<WaitlistSuccessView />);

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/api/canary/waitlist/receipt',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'x-jovie-waitlist-canary-run-id': '123-1',
          },
        })
      )
    );
    await waitFor(() =>
      expect(
        sessionStorage.getItem(PRODUCTION_WAITLIST_CANARY_STORAGE_KEY)
      ).toBeNull()
    );
  });
});
