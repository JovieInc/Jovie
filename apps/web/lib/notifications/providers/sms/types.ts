import 'server-only';

/**
 * Provider-agnostic shape for an inbound SMS message after parsing.
 * Twilio is the only adapter today; future Telnyx/Sinch/etc. produce the
 * same shape.
 */
export interface InboundSmsMessage {
  /** Provider name: 'twilio' | 'telnyx' | ... */
  provider: string;
  /** Provider's unique event id (e.g. Twilio MessageSid). */
  messageId: string;
  /** E.164 sender. */
  fromPhone: string;
  /** E.164 destination (the Jovie sender number). */
  toPhone: string;
  /** Raw message body as delivered. */
  body: string;
  /** Optional ISO timestamp of provider receipt. */
  receivedAt?: string;
}

export interface SignatureVerificationResult {
  ok: boolean;
  /** When `ok=true`, which key matched: 'primary' or 'secondary'. */
  keyUsed?: 'primary' | 'secondary';
  /** When `ok=false`, a short reason for logging. */
  reason?: string;
}

export interface SmsProviderAdapter {
  name: string;
  /**
   * Verify the inbound webhook signature against a 2-key window.
   * `request.url` should be the FULL URL including query string, exactly
   * as the provider signed it.
   */
  verifySignature(input: {
    headers: Headers;
    rawBody: string;
    fullUrl: string;
    primaryToken: string;
    secondaryToken?: string;
    secondaryExpiresAt?: Date;
  }): SignatureVerificationResult;
  parseInbound(
    form: URLSearchParams | Record<string, string>
  ): InboundSmsMessage;
}
