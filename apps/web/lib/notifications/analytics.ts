import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import type { NotificationChannel } from '@/types/notifications';

type BaseEventProps = {
  readonly artist_id: string | null;
  readonly channel?: string;
  readonly source?: string;
};

type ErrorEventProps = BaseEventProps & {
  readonly error_type: string;
  readonly validation_errors?: string[];
  readonly error_message?: string;
  readonly method?: string;
};

type SubscribeSuccessProps = {
  readonly artist_id: string;
  readonly channel: NotificationChannel;
  readonly email_domain?: string;
  readonly phone_present: boolean;
  readonly country_code?: string;
  readonly source: string;
  readonly creator_is_pro: boolean;
  readonly dynamic_enabled: boolean;
};

type UnsubscribeSuccessProps = {
  readonly artist_id: string;
  readonly method: string;
  readonly channel: NotificationChannel;
};

/**
 * Extract safe properties from a raw payload object for analytics
 */
export const extractPayloadProps = (
  payload: Record<string, unknown>
): {
  artist_id: string | null;
  channel: string;
  email_length: number;
  phone_length: number;
  source: string;
  method: string;
} => ({
  artist_id: typeof payload.artist_id === 'string' ? payload.artist_id : null,
  channel: typeof payload.channel === 'string' ? payload.channel : 'email',
  email_length: typeof payload.email === 'string' ? payload.email.length : 0,
  phone_length: typeof payload.phone === 'string' ? payload.phone.length : 0,
  source: typeof payload.source === 'string' ? payload.source : 'unknown',
  method: typeof payload.method === 'string' ? payload.method : 'api',
});

/**
 * Determine channel from payload, inferring from presence of phone if not explicit
 */
export const inferChannel = (payload: Record<string, unknown>): string => {
  if (typeof payload.channel === 'string') return payload.channel;
  return typeof payload.phone === 'string' ? 'phone' : 'email';
};

/**
 * Track subscribe attempt event
 */
export const trackSubscribeAttempt = async (
  payload: Record<string, unknown>
): Promise<void> => {
  const props = extractPayloadProps(payload);
  await trackServerEvent('notifications_subscribe_attempt', {
    artist_id: props.artist_id,
    channel: props.channel,
    email_length: props.email_length,
    phone_length: props.phone_length,
    source: props.source,
  });
};

/**
 * Track subscribe error event
 */
export const trackSubscribeError = async (
  props: ErrorEventProps
): Promise<void> => {
  await trackServerEvent('notifications_subscribe_error', {
    artist_id: props.artist_id,
    error_type: props.error_type,
    validation_errors: props.validation_errors,
    source: props.source,
  });
};

/**
 * Track subscribe success event
 */
export const trackSubscribeSuccess = async (
  props: SubscribeSuccessProps
): Promise<void> => {
  await trackServerEvent('notifications_subscribe_success', {
    artist_id: props.artist_id,
    channel: props.channel,
    email_domain: props.email_domain,
    phone_present: props.phone_present,
    country_code: props.country_code,
    source: props.source,
    creator_is_pro: props.creator_is_pro,
    dynamic_enabled: props.dynamic_enabled,
  });
};

/**
 * Track unsubscribe attempt event
 */
export const trackUnsubscribeAttempt = async (
  payload: Record<string, unknown>
): Promise<void> => {
  const props = extractPayloadProps(payload);
  await trackServerEvent('notifications_unsubscribe_attempt', {
    artist_id: props.artist_id,
    method: props.method,
    channel: inferChannel(payload),
  });
};

/**
 * Track unsubscribe error event
 */
export const trackUnsubscribeError = async (
  props: ErrorEventProps
): Promise<void> => {
  await trackServerEvent('notifications_unsubscribe_error', {
    artist_id: props.artist_id,
    error_type: props.error_type,
    validation_errors: props.validation_errors,
    channel: props.channel,
    method: props.method,
  });
};

/**
 * Track unsubscribe success event
 */
export const trackUnsubscribeSuccess = async (
  props: UnsubscribeSuccessProps
): Promise<void> => {
  await trackServerEvent('notifications_unsubscribe_success', {
    artist_id: props.artist_id,
    method: props.method,
    channel: props.channel,
  });
};

/**
 * Track generic server error
 */
export const trackServerError = async (
  eventPrefix: 'subscribe' | 'unsubscribe',
  error: unknown
): Promise<void> => {
  await trackServerEvent(`notifications_${eventPrefix}_error`, {
    error_type: 'server_error',
    error_message: error instanceof Error ? error.message : String(error),
  });
};
