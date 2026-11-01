import { EventEmitter } from 'node:events';
import type { Frame, Page, Request, Response } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureFirstSuggestionsResponse } from './presence-suggestions-capture';

const secret = 'private-person@example.test?token=private-token';

function browserEvents() {
  const events = new EventEmitter();
  const frame = { url: () => `https://example.test/signin?${secret}` } as Frame;
  const page = Object.assign(events, {
    mainFrame: () => frame,
  }) as unknown as Page;
  return { events, frame, page };
}

function request(errorText = 'net::ERR_ABORTED', method = 'GET') {
  return {
    url: () => `https://example.test/api/suggestions?profileId=${secret}`,
    method: () => method,
    failure: () => ({ errorText }),
  } as Request;
}

function response(req: Request, status: number, text: () => Promise<string>) {
  return {
    url: req.url,
    request: () => req,
    status: () => status,
    text,
  } as Response;
}

function diagnostics(
  capture: Awaited<ReturnType<typeof captureFirstSuggestionsResponse>>
) {
  return JSON.parse(
    capture.failureMessage().replace('[presence-suggestions-capture] ', '')
  );
}

describe('Presence suggestions failure evidence', () => {
  let now = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('distinguishes no request from a response failure without changing the 30-second deadline', async () => {
    const { events, frame, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    capture.markNavigation('start');
    now += 100;
    events.emit('framenavigated', frame);
    events.emit('domcontentloaded');
    capture.markNavigation('goto-complete');
    capture.markNavigation('presence-url-ready');
    const settled = vi.fn();
    void capture.captured.then(settled);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).not.toHaveBeenCalled();
    now = 30_100;
    await vi.advanceTimersByTimeAsync(1);
    await expect(capture.captured).resolves.toEqual({ status: 0, body: '' });
    expect(diagnostics(capture)).toMatchObject({
      elapsedMs: 30_000,
      end: { atMs: 30_000, reason: 'deadline' },
      events: [
        { atMs: 0, event: 'capture-start' },
        { atMs: 0, event: 'navigation-start' },
        { atMs: 100, event: 'document-navigation' },
        { atMs: 100, event: 'dom-content-loaded' },
        { atMs: 100, event: 'navigation-goto-complete' },
        { atMs: 100, event: 'navigation-presence-url-ready' },
      ],
    });
    expect(capture.failureMessage()).not.toContain(secret);
    capture.dispose();
  });

  it('retains a received 200 and unreadable body alongside request cancellation without leaking raw errors', async () => {
    const { events, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    const req = request();
    events.emit('request', req);
    now += 10;
    events.emit(
      'response',
      response(req, 200, async () => {
        throw new Error(`Network.getResponseBody: No data found ${secret}`);
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    events.emit('requestfailed', req);
    now = 30_100;
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(capture.captured).resolves.toEqual({ status: 0, body: '' });
    expect(diagnostics(capture).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'response', status: 200, request: 1 }),
        expect.objectContaining({
          event: 'body-read-failed',
          code: 'RESPONSE_BODY_UNAVAILABLE',
          request: 1,
        }),
        expect.objectContaining({
          event: 'request-failed',
          code: 'net::ERR_ABORTED',
          request: 1,
        }),
      ])
    );
    expect(capture.failureMessage()).not.toMatch(
      /private-|example\.test|https:|profileId|No data found/
    );
    capture.dispose();
  });

  it('preserves a real 429 and its response for existing assertions while printing no body or unknown failure data', async () => {
    const { events, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    const req = request(`net::ERR_${secret}`, secret);
    events.emit('request', req);
    events.emit(
      'response',
      response(req, 429, async () => secret)
    );
    await vi.advanceTimersByTimeAsync(0);
    events.emit('requestfailed', req);
    now = 30_100;
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(capture.captured).resolves.toEqual({
      status: 429,
      body: secret,
    });
    expect(diagnostics(capture).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'response',
          status: 429,
          method: 'OTHER',
        }),
        expect.objectContaining({ event: 'request-failed', code: 'OTHER' }),
      ])
    );
    expect(capture.failureMessage()).not.toMatch(
      /private-|example\.test|https:|profileId/
    );
    capture.dispose();
  });

  it('keeps the existing first readable 200 selection and stops observation on disposal', async () => {
    const { events, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    const req = request();
    events.emit(
      'response',
      response(req, 404, async () => 'missing')
    );
    await vi.advanceTimersByTimeAsync(0);
    const body = '{"success":true,"suggestions":[]}';
    events.emit(
      'response',
      response(req, 200, async () => body)
    );
    await expect(capture.captured).resolves.toEqual({ status: 200, body });
    expect(diagnostics(capture).end.reason).toBe('success');
    expect(diagnostics(capture).events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'response', status: 404 }),
        expect.objectContaining({ event: 'body-read-complete', status: 200 }),
      ])
    );
    capture.dispose();
    expect(events.eventNames()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a response after the deadline without turning the timed-out capture into a pass', async () => {
    const { events, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    now = 30_100;
    await vi.advanceTimersByTimeAsync(30_000);
    now += 10;
    const req = request();
    const readBody = vi.fn().mockResolvedValue('late response');
    events.emit('request', req);
    events.emit('response', response(req, 200, readBody));
    await expect(capture.captured).resolves.toEqual({ status: 0, body: '' });
    expect(readBody).not.toHaveBeenCalled();
    expect(diagnostics(capture)).toMatchObject({
      end: { atMs: 30_000, reason: 'deadline' },
      events: expect.arrayContaining([
        expect.objectContaining({
          atMs: 30_010,
          event: 'response',
          status: 200,
        }),
      ]),
    });
    capture.dispose();
  });

  it('bounds evidence during a request storm while retaining the terminal reason and an explicit dropped count', async () => {
    const { events, page } = browserEvents();
    const capture = await captureFirstSuggestionsResponse(page);
    for (let index = 0; index < 1000; index += 1) {
      events.emit('request', request());
    }
    now = 30_100;
    await vi.advanceTimersByTimeAsync(30_000);
    await capture.captured;
    expect(diagnostics(capture)).toMatchObject({
      end: { reason: 'deadline' },
      droppedEvents: 937,
    });
    expect(diagnostics(capture).events).toHaveLength(64);
    expect(capture.failureMessage().length).toBeLessThan(10_000);
    capture.dispose();
  });
});
