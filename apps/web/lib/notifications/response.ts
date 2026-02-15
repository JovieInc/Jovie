import type {
  NotificationApiResponse,
  NotificationContactValues,
  NotificationContentPreferences,
  NotificationErrorCode,
  NotificationStatusResponse,
  NotificationSubscribeResponse,
  NotificationSubscriptionState,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

export type NotificationDomainResponse<T> = {
  status: number;
  body: NotificationApiResponse<T>;
};

export type NotificationDomainContext = {
  headers?: Headers;
};

export type NotificationSubscribeDomainResponse =
  NotificationDomainResponse<NotificationSubscribeResponse> & {
    audienceIdentified: boolean;
  };

/**
 * Build a generic error response with typed error code
 */
export const buildErrorResponse = (
  status: number,
  error: string,
  code: NotificationErrorCode,
  details?: Record<string, unknown>
): NotificationDomainResponse<never> => ({
  status,
  body: {
    success: false,
    error,
    code,
    details,
  },
});

/**
 * Build a subscribe-specific error response (includes audienceIdentified flag)
 */
export const buildSubscribeErrorResponse = (
  status: number,
  error: string,
  code: NotificationErrorCode,
  details?: Record<string, unknown>
): NotificationSubscribeDomainResponse => ({
  ...buildErrorResponse(status, error, code, details),
  audienceIdentified: false,
});

/**
 * Build a successful subscribe response
 */
export const buildSubscribeSuccessResponse = (
  audienceIdentified: boolean,
  emailDispatched: boolean,
  durationMs: number,
  pendingConfirmation = false
): NotificationSubscribeDomainResponse => ({
  status: 200,
  audienceIdentified,
  body: {
    success: true,
    message: pendingConfirmation
      ? 'Please check your email to confirm your subscription'
      : 'Subscription successful',
    emailDispatched,
    durationMs,
    pendingConfirmation,
  },
});

/**
 * Build a successful unsubscribe response
 */
export const buildUnsubscribeSuccessResponse = (
  removed: number
): NotificationDomainResponse<NotificationUnsubscribeResponse> => ({
  status: 200,
  body: {
    success: true,
    removed,
    message:
      removed > 0
        ? 'Unsubscription successful'
        : 'No matching subscription found',
  },
});

/**
 * Build a successful status response
 */
export const buildStatusSuccessResponse = (
  channels: NotificationSubscriptionState,
  details: NotificationContactValues,
  contentPreferences?: NotificationContentPreferences
): NotificationDomainResponse<NotificationStatusResponse> => ({
  status: 200,
  body: {
    success: true,
    channels,
    details,
    ...(contentPreferences ? { contentPreferences } : {}),
  },
});

/**
 * Standard error responses for common cases
 */
export const buildInvalidRequestResponse = () =>
  buildErrorResponse(400, 'Invalid request data', 'invalid_request');

export const buildNotFoundResponse = (entity: string) =>
  buildErrorResponse(404, `${entity} not found`, 'not_found');

export const buildValidationErrorResponse = (message: string) =>
  buildErrorResponse(400, message, 'validation_error');

export const buildMissingIdentifierResponse = (message: string) =>
  buildErrorResponse(400, message, 'missing_identifier');

export const buildServerErrorResponse = () =>
  buildErrorResponse(500, 'Server error', 'server_error');

/**
 * Subscribe-specific error shortcut responses
 */
export const buildSubscribeValidationError = (message?: string) =>
  buildSubscribeErrorResponse(
    400,
    message ?? 'Invalid request data',
    'validation_error'
  );

export const buildSubscribeNotFoundError = () =>
  buildSubscribeErrorResponse(404, 'Artist not found', 'not_found');

export const buildSubscribeServerError = () =>
  buildSubscribeErrorResponse(500, 'Server error', 'server_error');
