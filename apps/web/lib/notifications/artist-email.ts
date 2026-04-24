import type { FanNotificationPreferences } from '@/lib/db/schema/analytics';
import type {
  NotificationArtistEmailState,
  NotificationContentPreferences,
} from '@/types/notifications';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function readArtistEmailReadyFromSettings(
  settings: Record<string, unknown> | null | undefined
): boolean {
  if (!isRecord(settings)) return false;
  const notifications = settings.notifications;
  if (!isRecord(notifications)) return false;
  return notifications.artistEmailReady === true;
}

export function isArtistEmailOptedIn(
  optInAt: Date | string | null | undefined,
  optOutAt: Date | string | null | undefined
): boolean {
  if (!optInAt) return false;
  if (!optOutAt) return true;
  return new Date(optInAt).getTime() > new Date(optOutAt).getTime();
}

export function buildArtistEmailState(
  optedIn: boolean,
  artistEmailReady: boolean
): NotificationArtistEmailState {
  return {
    optedIn,
    pendingProvider: optedIn && !artistEmailReady,
    visibleToArtist: optedIn && artistEmailReady,
  };
}

export function pickJovieAlertPreferences(
  prefs: FanNotificationPreferences | null | undefined
): NotificationContentPreferences {
  return {
    newMusic:
      prefs?.newMusic ?? prefs?.releaseDay ?? prefs?.releasePreview ?? true,
    tourDates: prefs?.tourDates ?? true,
    merch: prefs?.merch ?? true,
    general: prefs?.general ?? true,
  };
}

export function mergeJovieAlertPreferences(
  current: FanNotificationPreferences | null | undefined,
  updates: Partial<NotificationContentPreferences>
): FanNotificationPreferences {
  const next: FanNotificationPreferences = {
    releasePreview: current?.releasePreview ?? true,
    releaseDay: current?.releaseDay ?? true,
    newMusic:
      current?.newMusic ??
      current?.releaseDay ??
      current?.releasePreview ??
      true,
    tourDates: current?.tourDates ?? true,
    merch: current?.merch ?? true,
    general: current?.general ?? true,
    promo: current?.promo ?? false,
  };

  if (updates.newMusic !== undefined) {
    next.newMusic = updates.newMusic;
    next.releasePreview = updates.newMusic;
    next.releaseDay = updates.newMusic;
  }

  if (updates.tourDates !== undefined) {
    next.tourDates = updates.tourDates;
  }

  if (updates.merch !== undefined) {
    next.merch = updates.merch;
  }

  if (updates.general !== undefined) {
    next.general = updates.general;
  }

  return next;
}
