import { getUrlDisposition, type UrlDispositionOptions } from './navigation';

/**
 * Native notification bridge (JOV-6716). The renderer sends a small validated
 * payload over IPC; the main process posts a macOS Notification and routes a
 * click through the same URL disposition table that guards in-app navigation,
 * so a notification can deep-link only where a navigation already could.
 */

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 300;

export interface DesktopNotificationRequest {
  readonly title: string;
  readonly body: string;
  /** Optional deep link opened when the user clicks the notification. */
  readonly url?: string;
}

export type DesktopNotificationClickAction =
  | { readonly kind: 'focus' }
  | { readonly kind: 'load-url'; readonly url: string }
  | { readonly kind: 'profile-preview'; readonly url: string }
  | { readonly kind: 'open-external'; readonly url: string };

function clampField(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseDesktopNotificationRequest(
  payload: unknown
): DesktopNotificationRequest | null {
  if (payload === null || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.title !== 'string' || record.title.trim() === '') {
    return null;
  }

  const body = typeof record.body === 'string' ? record.body : '';
  const url = record.url;
  if (url !== undefined && (typeof url !== 'string' || url.trim() === '')) {
    return null;
  }

  return {
    title: clampField(record.title, TITLE_MAX_LENGTH),
    body: clampField(body, BODY_MAX_LENGTH),
    url: typeof url === 'string' ? url : undefined,
  };
}

/**
 * Maps the notification's target URL to the same disposition the navigation
 * guards apply. A blocked URL degrades to focusing the window rather than
 * navigating anywhere the shell would have refused.
 */
export function resolveDesktopNotificationClickAction(
  urlString: string | undefined,
  options: UrlDispositionOptions
): DesktopNotificationClickAction {
  if (!urlString) return { kind: 'focus' };
  const disposition = getUrlDisposition(urlString, options);
  if (disposition === 'in-app') return { kind: 'load-url', url: urlString };
  if (disposition === 'profile-preview') {
    return { kind: 'profile-preview', url: urlString };
  }
  if (disposition === 'external')
    return { kind: 'open-external', url: urlString };
  return { kind: 'focus' };
}
