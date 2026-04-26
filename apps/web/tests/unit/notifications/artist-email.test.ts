import { describe, expect, it } from 'vitest';
import {
  buildArtistEmailState,
  isArtistEmailOptedIn,
  mergeJovieAlertPreferences,
  pickJovieAlertPreferences,
  readArtistEmailReadyFromSettings,
} from '@/lib/notifications/artist-email';

describe('artist-email helpers', () => {
  it('reads the creator readiness flag from settings.notifications', () => {
    expect(
      readArtistEmailReadyFromSettings({
        notifications: { artistEmailReady: true },
      })
    ).toBe(true);
    expect(readArtistEmailReadyFromSettings(null)).toBe(false);
  });

  it('derives artist consent visibility and pending-provider state', () => {
    const optInAt = new Date('2026-04-24T10:00:00.000Z');
    const optOutAt = new Date('2026-04-24T09:00:00.000Z');

    expect(isArtistEmailOptedIn(optInAt, optOutAt)).toBe(true);
    expect(
      isArtistEmailOptedIn(optInAt, new Date('2026-04-24T11:00:00.000Z'))
    ).toBe(false);

    expect(buildArtistEmailState(true, false)).toEqual({
      optedIn: true,
      pendingProvider: true,
      visibleToArtist: false,
    });
    expect(buildArtistEmailState(true, true)).toEqual({
      optedIn: true,
      pendingProvider: false,
      visibleToArtist: true,
    });
  });

  it('keeps Jovie music preferences synchronized with release preview and release day', () => {
    const merged = mergeJovieAlertPreferences(
      {
        releasePreview: true,
        releaseDay: true,
        newMusic: true,
        tourDates: false,
        merch: false,
        general: true,
        promo: false,
      },
      {
        newMusic: false,
        merch: true,
      }
    );

    expect(merged).toMatchObject({
      newMusic: false,
      releasePreview: false,
      releaseDay: false,
      tourDates: false,
      merch: true,
      general: true,
      promo: false,
    });

    expect(pickJovieAlertPreferences(merged)).toEqual({
      newMusic: false,
      tourDates: false,
      merch: true,
      general: true,
    });
  });
});
