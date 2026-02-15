import type {
  NotificationApiResponse,
  NotificationChannel,
  NotificationContentPreferences,
  NotificationErrorEnvelope,
  NotificationStatusResponse,
  NotificationSubscribeResponse,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

export type NotificationSubscribePayload = {
  artistId: string;
  channel: NotificationChannel;
  email?: string;
  phone?: string;
  countryCode?: string;
  city?: string;
  source?: string;
};

export type NotificationUnsubscribePayload = {
  artistId: string;
  channel?: NotificationChannel;
  email?: string;
  phone?: string;
  token?: string;
  method?: 'email_link' | 'dashboard' | 'api' | 'dropdown';
};

export type NotificationStatusPayload = {
  artistId: string;
  email?: string;
  phone?: string;
};

export type UpdateContentPreferencesPayload = {
  artistId: string;
  email?: string;
  phone?: string;
  preferences: Partial<NotificationContentPreferences>;
};

export const NOTIFICATION_COPY = {
  errors: {
    generic: 'We couldn’t update notifications. Please try again.',
    subscribe: 'We couldn’t turn on notifications. Try again in a moment.',
    unsubscribe:
      'We couldn’t update your notifications. Try again in a moment.',
    missingContact:
      'We need your contact to manage this subscription. Add it again to continue.',
    artistNotFound:
      'We couldn’t find that artist. Check the handle and try again.',
    artistUnavailable:
      'We couldn’t load that artist right now. Please try again in a moment.',
  },
  success: {
    subscribe: {
      email:
        "You're in. You'll get notified when new music drops, tours are announced & more.",
      sms: "You're in. You'll get a text when new music drops, tours are announced & more.",
    },
    unsubscribe: {
      email: 'You\u2019re unsubscribed from email notifications.',
      sms: 'You\u2019re unsubscribed from text notifications.',
    },
  },
} as const;

const isNotificationError = (
  value: unknown
): value is NotificationErrorEnvelope =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'success' in value &&
      (value as { success?: boolean }).success === false
  );

const parseResponseJson = async <T>(
  response: Response
): Promise<NotificationApiResponse<T> | null> => {
  try {
    return (await response.json()) as NotificationApiResponse<T>;
  } catch (error) {
    console.error('[notifications] JSON parse failed:', {
      status: response.status,
      url: response.url,
      contentType: response.headers.get('content-type'),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
};

const requestNotifications = async <T>(
  url: string,
  payload: Record<string, unknown>,
  fallbackError: string,
  signal?: AbortSignal,
  method: string = 'POST'
): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  const data = await parseResponseJson<T>(response);

  if (!response.ok || !data || isNotificationError(data)) {
    const message =
      data && isNotificationError(data) ? data.error : fallbackError;
    throw new Error(message);
  }

  return data as T;
};

export const subscribeToNotifications = async (
  payload: NotificationSubscribePayload
): Promise<NotificationSubscribeResponse> =>
  requestNotifications<NotificationSubscribeResponse>(
    '/api/notifications/subscribe',
    {
      artist_id: payload.artistId,
      channel: payload.channel,
      email: payload.email,
      phone: payload.phone,
      country_code: payload.countryCode,
      city: payload.city,
      source: payload.source,
    },
    NOTIFICATION_COPY.errors.subscribe
  );

export const unsubscribeFromNotifications = async (
  payload: NotificationUnsubscribePayload
): Promise<NotificationUnsubscribeResponse> =>
  requestNotifications<NotificationUnsubscribeResponse>(
    '/api/notifications/unsubscribe',
    {
      artist_id: payload.artistId,
      channel: payload.channel,
      email: payload.email,
      phone: payload.phone,
      token: payload.token,
      method: payload.method,
    },
    NOTIFICATION_COPY.errors.unsubscribe
  );

export const getNotificationStatus = async (
  payload: NotificationStatusPayload,
  signal?: AbortSignal
): Promise<NotificationStatusResponse> =>
  requestNotifications<NotificationStatusResponse>(
    '/api/notifications/status',
    {
      artist_id: payload.artistId,
      email: payload.email,
      phone: payload.phone,
    },
    NOTIFICATION_COPY.errors.generic,
    signal
  );

export const getNotificationSubscribeSuccessMessage = (
  channel: NotificationChannel
) =>
  channel === 'sms'
    ? NOTIFICATION_COPY.success.subscribe.sms
    : NOTIFICATION_COPY.success.subscribe.email;

export const getNotificationUnsubscribeSuccessMessage = (
  channel: NotificationChannel
) =>
  channel === 'sms'
    ? NOTIFICATION_COPY.success.unsubscribe.sms
    : NOTIFICATION_COPY.success.unsubscribe.email;

export const updateContentPreferences = async (
  payload: UpdateContentPreferencesPayload
): Promise<{ success: true; updated: number }> =>
  requestNotifications<{ success: true; updated: number }>(
    '/api/notifications/preferences',
    {
      artist_id: payload.artistId,
      email: payload.email,
      phone: payload.phone,
      preferences: payload.preferences,
    },
    NOTIFICATION_COPY.errors.generic,
    undefined,
    'PATCH'
  );
