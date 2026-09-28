'use client';

import {
  HELP_CENTER_ENDPOINT,
  HELP_CENTER_SCHEMA_VERSION,
  type HelpCenterEvent,
  type HelpCenterSourceSurface,
} from '@/lib/tracking/help-center-contract';

/**
 * Same-origin companion to the docs beacon. Emits versioned, allowlisted
 * Help Center events for escalation surfaces living on jov.ie (the support
 * page). Fire-and-forget: never throws, never blocks UI.
 */
export function trackHelpCenterEvent(
  event: HelpCenterEvent,
  properties: {
    readonly article_id?: string;
    readonly source_surface?: HelpCenterSourceSurface;
    readonly query_hash?: string;
    readonly feedback_reason?:
      | 'outdated'
      | 'missing_info'
      | 'did_not_answer'
      | 'confusing';
  } = {}
): Promise<boolean> {
  try {
    const payload = {
      schema_version: HELP_CENTER_SCHEMA_VERSION,
      event_id: `${crypto.randomUUID()}:${event}`,
      event,
      client_ts: Date.now(),
      source_surface: properties.source_surface ?? 'support_page',
      signed_in: 'unknown',
      ...properties,
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon?.(HELP_CENTER_ENDPOINT, body)) {
      return Promise.resolve(true);
    }
    return fetch(HELP_CENTER_ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    })
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

const ESCALATION_SOURCES = new Set([
  'help-search-zero-results',
  'help-search-error',
  'help-article-feedback',
]);

/**
 * When the docs help center routes a reader to /support with a help-source
 * parameter, record the closed-loop escalation exactly once per landing.
 */
export function trackHelpCenterEscalationLanding(search: string): void {
  try {
    const params = new URLSearchParams(search);
    const source = params.get('source') ?? '';
    if (!ESCALATION_SOURCES.has(source)) return;
    const article = params.get('article');
    const context = {
      source_surface: 'support_page' as const,
      ...(article && /^[a-z0-9][a-z0-9/_-]{0,119}$/.test(article)
        ? { article_id: article }
        : {}),
    };
    void trackHelpCenterEvent('support_escalation', context);
    void trackHelpCenterEvent('contact_support_opened', context);
  } catch {
    // Analytics must never break the support surface.
  }
}
