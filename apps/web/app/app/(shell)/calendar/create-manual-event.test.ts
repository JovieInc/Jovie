import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createManualEvent } from './create-manual-event';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getDashboardDataEssential: vi.fn(),
  insertEvent: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));
vi.mock('../dashboard/actions', () => ({
  getDashboardDataEssential: mocks.getDashboardDataEssential,
}));
vi.mock('@/lib/events/insert', () => ({ insertEvent: mocks.insertEvent }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const event = {
  eventType: 'signing',
  title: 'New book signing',
  localStart: '2026-11-20T20:00',
  timezone: 'America/Los_Angeles',
  venueName: 'City Books',
  city: 'Los Angeles',
  region: '',
  country: 'US',
  ticketUrl: '',
};

describe('createManualEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getDashboardDataEssential.mockResolvedValue({
      selectedProfile: { id: 'profile-1' },
      needsOnboarding: false,
      dashboardLoadError: false,
    });
  });

  it('requires a session', async () => {
    mocks.getCachedAuth.mockResolvedValueOnce({ userId: null });
    expect(await createManualEvent('profile-1', event)).toEqual({
      ok: false,
      error: 'Sign in again to add an event.',
    });
    expect(mocks.getDashboardDataEssential).not.toHaveBeenCalled();
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('rejects a stale or foreign selected profile before writing', async () => {
    expect(await createManualEvent('profile-2', event)).toEqual({
      ok: false,
      error: 'Select the profile again before saving.',
    });
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it.each([
    { eventType: 'tour' },
    { eventType: 'livestream' },
    { profileId: 'profile-2' },
    { provider: 'bandsintown' },
    { venueName: '   ' },
    { country: '' },
    { ticketUrl: 'javascript:void(0)' },
    { timezone: '+02:00' },
    { localStart: '2026-02-30T10:00' },
    { localStart: '2026-03-08T02:30' }, // skipped in Los Angeles
    { localStart: '2026-11-01T01:30' }, // repeated in Los Angeles
  ])('rejects invalid form input %j without writing', async patch => {
    expect(
      await createManualEvent('profile-1', { ...event, ...patch })
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it.each(['ama', 'listening_party'])(
    'writes an explicit in-person %s with a normalized optional link',
    async eventType => {
      expect(
        await createManualEvent('profile-1', {
          ...event,
          eventType,
          timezone: 'Asia/Kathmandu',
          ticketUrl: ' https://example.com ',
        })
      ).toEqual({ ok: true });
      expect(mocks.insertEvent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          profileId: 'profile-1',
          eventType,
          provider: 'manual',
          startDate: new Date('2026-11-20T14:15:00.000Z'),
          timezone: 'Asia/Kathmandu',
          ticketUrl: 'https://example.com/',
        })
      );
    }
  );
});
