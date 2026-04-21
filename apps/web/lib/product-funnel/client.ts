'use client';

import type { ProductFunnelClientEventType } from './shared';

const PRODUCT_FUNNEL_SESSION_KEY = 'jovie_product_funnel_session_id';
const MIN_PRODUCT_FUNNEL_SESSION_ID_LENGTH = 8;
const MAX_PRODUCT_FUNNEL_SESSION_ID_LENGTH = 128;
let productFunnelSessionCounter = 0;

function createSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  const timestamp = Date.now().toString(36);
  const counter = (productFunnelSessionCounter += 1).toString(36);
  return `pf_${timestamp}_${counter}`;
}

function isValidProductFunnelSessionId(value: string): boolean {
  return (
    value.length >= MIN_PRODUCT_FUNNEL_SESSION_ID_LENGTH &&
    value.length <= MAX_PRODUCT_FUNNEL_SESSION_ID_LENGTH
  );
}

function createValidProductFunnelSessionId(): string {
  let sessionId = createSessionId();
  while (!isValidProductFunnelSessionId(sessionId)) {
    sessionId = createSessionId();
  }

  return sessionId;
}

export function getProductFunnelSessionId(): string {
  try {
    const existing = globalThis.localStorage.getItem(
      PRODUCT_FUNNEL_SESSION_KEY
    );
    if (existing && isValidProductFunnelSessionId(existing)) {
      return existing;
    }
    if (existing) {
      globalThis.localStorage.removeItem(PRODUCT_FUNNEL_SESSION_KEY);
    }

    const next = createValidProductFunnelSessionId();
    globalThis.localStorage.setItem(PRODUCT_FUNNEL_SESSION_KEY, next);
    return next;
  } catch {
    return createValidProductFunnelSessionId();
  }
}

export function trackProductFunnelEvent(input: {
  readonly eventType: ProductFunnelClientEventType;
  readonly sourceSurface?: string | null;
  readonly sourceRoute?: string | null;
  readonly metadata?: Record<string, unknown>;
}): void {
  try {
    void fetch('/api/funnel/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      body: JSON.stringify({
        eventType: input.eventType,
        sessionId: getProductFunnelSessionId(),
        sourceSurface: input.sourceSurface ?? null,
        sourceRoute: input.sourceRoute ?? null,
        metadata: input.metadata,
      }),
    }).catch(() => undefined);
  } catch {
    // Product funnel telemetry must never block user actions.
  }
}
