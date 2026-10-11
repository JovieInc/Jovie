import { describe, expect, test } from 'vitest';
import {
  parseDesktopNotificationRequest,
  resolveDesktopNotificationClickAction,
} from '../src/desktop-notifications.ts';
import type { UrlDispositionOptions } from '../src/navigation.ts';

const production = {
  appUrl: 'https://jov.ie',
  appEnv: 'production',
} as const satisfies UrlDispositionOptions;

/**
 * JOV-6716: the notification bridge must validate renderer payloads and route
 * clicks through the same URL disposition rules as in-app navigation.
 */
describe('parseDesktopNotificationRequest', () => {
  test('accepts a full payload', () => {
    expect(
      parseDesktopNotificationRequest({
        title: 'New message',
        body: 'A fan replied',
        url: '/app/inbox',
      })
    ).toEqual({
      title: 'New message',
      body: 'A fan replied',
      url: '/app/inbox',
    });
  });

  test('accepts a title-only payload', () => {
    expect(parseDesktopNotificationRequest({ title: 'Ping' })).toEqual({
      title: 'Ping',
      body: '',
      url: undefined,
    });
  });

  test('rejects non-object, empty title, and invalid url payloads', () => {
    expect(parseDesktopNotificationRequest(null)).toBeNull();
    expect(parseDesktopNotificationRequest('New message')).toBeNull();
    expect(parseDesktopNotificationRequest({ title: '' })).toBeNull();
    expect(parseDesktopNotificationRequest({ body: 'hi' })).toBeNull();
    expect(
      parseDesktopNotificationRequest({ title: 'Hi', url: 42 })
    ).toBeNull();
    expect(
      parseDesktopNotificationRequest({ title: 'Hi', url: '   ' })
    ).toBeNull();
  });

  test('trims and clamps oversized fields', () => {
    const parsed = parseDesktopNotificationRequest({
      title: `  ${'t'.repeat(200)}  `,
      body: 'b'.repeat(400),
    });
    expect(parsed?.title.length).toBe(120);
    expect(parsed?.body.length).toBe(300);
  });
});

describe('resolveDesktopNotificationClickAction', () => {
  test('focuses the window when no url is provided', () => {
    expect(
      resolveDesktopNotificationClickAction(undefined, production)
    ).toEqual({ kind: 'focus' });
  });

  test('routes in-app deep links to the main window', () => {
    expect(
      resolveDesktopNotificationClickAction(
        'https://jov.ie/app/inbox',
        production
      )
    ).toEqual({ kind: 'load-url', url: 'https://jov.ie/app/inbox' });
  });

  test('routes public profile deep links to the preview window', () => {
    expect(
      resolveDesktopNotificationClickAction(
        'https://jov.ie/someartist',
        production
      )
    ).toEqual({ kind: 'profile-preview', url: 'https://jov.ie/someartist' });
  });

  test('routes allowlisted external urls to the system browser', () => {
    expect(
      resolveDesktopNotificationClickAction(
        'mailto:fan@example.com',
        production
      )
    ).toEqual({ kind: 'open-external', url: 'mailto:fan@example.com' });
  });

  test('blocked urls degrade to focusing the window', () => {
    expect(
      resolveDesktopNotificationClickAction(
        'https://evil.example.com/phish',
        production
      )
    ).toEqual({ kind: 'focus' });
    expect(
      resolveDesktopNotificationClickAction('javascript:alert(1)', production)
    ).toEqual({ kind: 'focus' });
  });
});
