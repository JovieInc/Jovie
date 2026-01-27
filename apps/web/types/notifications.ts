// Fan-facing notification channels stored in the DB today
export type NotificationChannel = 'sms' | 'email';

// App-wide delivery channels (allows future push/in-app support)
export type NotificationDeliveryChannel = 'email' | 'push' | 'in_app';

export type NotificationCategory = 'transactional' | 'product' | 'marketing';

export interface NotificationPreferences {
  channels: Record<NotificationDeliveryChannel, boolean>;
  marketingEmails: boolean;
  dismissedNotificationIds: string[];
  preferredChannel?: NotificationDeliveryChannel;
  email?: string | null;
}

export interface NotificationTarget {
  email?: string | null;
  userId?: string;
  clerkUserId?: string;
  creatorProfileId?: string;
  preferences?: Partial<NotificationPreferences>;
  preferredChannel?: NotificationDeliveryChannel;
}

/**
 * Context about the sender (creator) for emails sent on their behalf.
 * Implements the "Laylo pattern" where emails appear from "Artist Name via Jovie".
 */
export interface SenderContext {
  /** Creator profile ID for quota/reputation tracking */
  creatorProfileId: string;
  /** Display name to show in "From" field (e.g., "Artist Name via Jovie") */
  displayName: string;
  /** Optional reply-to email for the creator */
  replyToEmail?: string;
  /** Type of email for attribution tracking */
  emailType:
    | 'release_notification'
    | 'claim_invite'
    | 'marketing'
    | 'transactional';
  /** Optional reference ID for the specific entity (release ID, etc.) */
  referenceId?: string;
}

export interface NotificationMessage {
  id?: string;
  dedupKey?: string;
  category: NotificationCategory;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  ctaUrl?: string;
  channels?: NotificationDeliveryChannel[];
  metadata?: Record<string, unknown>;
  respectUserPreferences?: boolean;
  dismissible?: boolean;
  /** Sender context for emails sent on behalf of a creator */
  senderContext?: SenderContext;
}

export interface NotificationChannelResult {
  channel: NotificationDeliveryChannel;
  status: 'sent' | 'skipped' | 'error';
  detail?: string;
  provider?: string;
  error?: string;
}

export interface NotificationDispatchResult {
  results: NotificationChannelResult[];
  delivered: NotificationDeliveryChannel[];
  skipped: NotificationChannelResult[];
  errors: NotificationChannelResult[];
  dedupKey?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  from?: string;
}

export interface EmailProvider {
  provider: 'resend' | 'ses' | 'mailgun' | 'debug';
  sendEmail(message: EmailMessage): Promise<NotificationChannelResult>;
}

export type NotificationSubscriptionState = Partial<
  Record<NotificationChannel, boolean>
>;

export type NotificationContactValues = Partial<
  Record<NotificationChannel, string>
>;

export type NotificationErrorCode =
  | 'invalid_request'
  | 'validation_error'
  | 'not_found'
  | 'missing_identifier'
  | 'rate_limited'
  | 'server_error';

export interface NotificationErrorEnvelope {
  success: false;
  error: string;
  code: NotificationErrorCode;
  details?: Record<string, unknown>;
}

export interface NotificationSubscribeResponse {
  success: true;
  message: string;
  emailDispatched: boolean;
  durationMs: number;
}

export interface NotificationUnsubscribeResponse {
  success: true;
  removed: number;
  message: string;
}

export interface NotificationStatusResponse {
  success: true;
  channels: NotificationSubscriptionState;
  details: NotificationContactValues;
}

export type NotificationApiResponse<T> = T | NotificationErrorEnvelope;
