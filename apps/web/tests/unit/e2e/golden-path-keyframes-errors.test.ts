import { EventEmitter } from 'node:events';
import { appendFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureKeyframe,
  type KeyframeRecord,
  LAYOUT_AUDIT_SOURCE,
  watchKeyframeErrors,
} from '../../e2e/helpers/golden-path-keyframes';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const origin = 'http://localhost:3250';
const resourceError =
  'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';

function pageFixture(pageUrl = `${origin}/app/chat`) {
  const events = new EventEmitter();
  const page = {
    on: events.on.bind(events),
    url: () => pageUrl,
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('keyframe fixture')),
    evaluate: vi.fn(async (source: string) =>
      source === LAYOUT_AUDIT_SOURCE
        ? {
            viewport: { width: 1440, height: 900 },
            overflowPx: 0,
            offscreenInteractive: [],
            smallTargets: [],
            brokenImages: [],
          }
        : 0
    ),
  } as unknown as Page;
  return {
    page,
    events,
    consoleError: (url: string, text = resourceError) =>
      events.emit('console', {
        type: () => 'error',
        text: () => text,
        location: () => ({ url }),
      }),
  };
}

function lastRecord(): KeyframeRecord {
  const call = vi.mocked(appendFileSync).mock.calls.at(-1);
  if (!call) throw new Error('Expected a keyframe manifest record');
  return JSON.parse(String(call[1])) as KeyframeRecord;
}

describe('golden-path keyframe error attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOLDEN_PATH_KEYFRAME_DIR', '/keyframe-unit-fixture');
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    '/api/analytics/navigation',
    '/api/chat/usage',
    '/api/billing/status',
    '/api/onboarding/conversation',
    '/api/spotify/search',
  ])('attributes %s without URL credentials, query or fragment', async path => {
    const fixture = pageFixture();
    watchKeyframeErrors(fixture.page);
    const resource = new URL(path, origin);
    resource.username = 'USER_SECRET';
    resource.password = 'PASS_SECRET';
    resource.searchParams.set('token', 'QUERY_SECRET');
    resource.hash = 'FRAGMENT_SECRET';
    fixture.consoleError(resource.href);
    await captureKeyframe(fixture.page, 'dashboard');
    expect(lastRecord().pageErrors).toEqual([
      `${resourceError} [resource: ${path}]`,
    ]);
    expect(JSON.stringify(lastRecord())).not.toContain('_SECRET');
  });

  it('attributes an HTTPS resource only within the HTTPS page origin', async () => {
    const fixture = pageFixture('https://staging.jov.ie/app/chat');
    watchKeyframeErrors(fixture.page);
    fixture.consoleError('https://staging.jov.ie/api/analytics/navigation');
    await captureKeyframe(fixture.page, 'dashboard');
    expect(lastRecord().pageErrors).toEqual([
      `${resourceError} [resource: /api/analytics/navigation]`,
    ]);
  });

  it.each([
    '',
    'not a URL',
    'http://[invalid',
    '/api/analytics/navigation',
    '//localhost:3250/api/analytics/navigation',
    'https://external.test/api/analytics/navigation?token=QUERY_SECRET',
    'http://localhost:3251/api/analytics/navigation',
    'https://localhost:3250/api/analytics/navigation',
    'file:///api/analytics/navigation',
    'data:text/plain,PATH_SECRET',
    `${origin}/api/auth/reset-password/PATH_SECRET`,
    `${origin}/api/analytics/navigation/PATH_SECRET`,
    `${origin}/api/analytics/navigation%2FPATH_SECRET`,
    `${origin}/api/analytics/navigation;token=PATH_SECRET`,
    `${origin}/api/unknown-static-route`,
    `${origin}/artist-PATH_SECRET`,
  ])(
    'preserves the error without attributing unsafe or unknown URL %s',
    async url => {
      const fixture = pageFixture();
      watchKeyframeErrors(fixture.page);
      fixture.consoleError(url);
      await captureKeyframe(fixture.page, 'dashboard');
      expect(lastRecord().pageErrors).toEqual([resourceError]);
    }
  );

  it('keeps bounded error text, page errors and per-keyframe draining unchanged', async () => {
    const fixture = pageFixture();
    watchKeyframeErrors(fixture.page);
    watchKeyframeErrors(fixture.page);
    expect(fixture.events.listenerCount('console')).toBe(1);
    const longError = 'E'.repeat(1000);
    fixture.consoleError(`${origin}/api/chat/usage`, longError);
    fixture.events.emit('pageerror', new Error('Unhandled failure'));
    fixture.events.emit('console', {
      type: () => 'warning',
      text: () => 'Existing warning handling',
    });
    await captureKeyframe(fixture.page, 'dashboard');
    expect(lastRecord().pageErrors).toEqual([
      `${longError.slice(0, 300)} [resource: /api/chat/usage]`,
      'pageerror: Unhandled failure',
    ]);
    await captureKeyframe(fixture.page, 'releases');
    expect(lastRecord().pageErrors).toEqual([]);
  });
});
