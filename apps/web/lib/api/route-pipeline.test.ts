import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { mockCaptureError } = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));

import { type AccessPolicy, defineRoute, publicAccess } from './route-pipeline';

const ROUTE = '/api/test/pipeline';

function post(body?: unknown, init?: { raw?: string }) {
  return new NextRequest(`https://jov.ie${ROUTE}`, {
    method: 'POST',
    body: init?.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    headers: { 'content-type': 'application/json' },
  });
}

function get() {
  return new NextRequest(`https://jov.ie${ROUTE}`);
}

const allow = <T>(auth: T): AccessPolicy<T> => ({
  name: 'test-allow',
  authorize: async () => ({ ok: true, auth }),
});

const deny = (status: number, body: unknown): AccessPolicy<never> => ({
  name: 'test-deny',
  authorize: async () => ({ ok: false, status, body }),
});

describe('defineRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('access', () => {
    it('returns the denial with no-store and never runs later stages', async () => {
      const rateLimit = vi.fn();
      const handler = vi.fn();
      const route = defineRoute(
        {
          route: ROUTE,
          access: deny(401, { error: 'Unauthorized' }),
          rateLimit,
          body: { schema: z.object({}) },
        },
        handler
      );

      const response = await route(post({}));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(rateLimit).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('passes the authorized caller, request and route context to the handler', async () => {
      const handler = vi.fn(
        async (
          input: { auth: { userId: string }; request: NextRequest },
          context: { params: Promise<{ id: string }> }
        ) =>
          NextResponse.json({
            userId: input.auth.userId,
            id: (await context.params).id,
            method: input.request.method,
          })
      );
      const route = defineRoute(
        { route: ROUTE, access: allow({ userId: 'user_1' }) },
        handler
      );

      const response = await route(get(), {
        params: Promise.resolve({ id: 'abc' }),
      });

      expect(await response.json()).toEqual({
        userId: 'user_1',
        id: 'abc',
        method: 'GET',
      });
    });

    it('lets access failures propagate instead of masking them as allow or 500', async () => {
      const handler = vi.fn();
      const route = defineRoute(
        {
          route: ROUTE,
          access: {
            name: 'broken',
            authorize: async () => {
              throw new Error('session store down');
            },
          },
        },
        handler
      );

      await expect(route(get())).rejects.toThrow('session store down');
      expect(handler).not.toHaveBeenCalled();
      expect(mockCaptureError).not.toHaveBeenCalled();
    });

    it('publicAccess allows with a null caller', async () => {
      const route = defineRoute(
        { route: ROUTE, access: publicAccess() },
        ({ auth }) => NextResponse.json({ auth })
      );

      expect(await (await route(get())).json()).toEqual({
        auth: null,
      });
    });
  });

  describe('rate limit', () => {
    it('stops with the limiter response before the body is read', async () => {
      const handler = vi.fn();
      const request = post({ name: 'x' });
      const route = defineRoute(
        {
          route: ROUTE,
          access: allow({ userId: 'user_1' }),
          rateLimit: async ({ auth, responseHeaders }) =>
            NextResponse.json(
              { error: `limited ${auth.userId}` },
              { status: 429, headers: responseHeaders }
            ),
          body: { schema: z.object({ name: z.string() }) },
        },
        handler
      );

      const response = await route(request);

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: 'limited user_1' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(request.bodyUsed).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('continues when the limiter returns null', async () => {
      const route = defineRoute(
        {
          route: ROUTE,
          access: publicAccess(),
          rateLimit: async () => null,
        },
        () => NextResponse.json({ ok: true })
      );

      expect((await route(get())).status).toBe(200);
    });
  });

  describe('body', () => {
    const config = {
      route: ROUTE,
      access: publicAccess(),
      body: { schema: z.object({ name: z.string().min(1) }) },
    };

    it('hands the handler the validated, typed body', async () => {
      const route = defineRoute(config, ({ body }) =>
        NextResponse.json({ upper: body.name.toUpperCase() })
      );

      const response = await route(post({ name: 'ovie', extra: 1 }));

      expect(await response.json()).toEqual({ upper: 'OVIE' });
    });

    it('rejects malformed JSON with 400 and no-store', async () => {
      const handler = vi.fn();
      const route = defineRoute(config, handler);

      const response = await route(post(undefined, { raw: '{nope' }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(
        'Invalid JSON in request body'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects a schema mismatch with the single 400 shape', async () => {
      const handler = vi.fn();
      const route = defineRoute(config, handler);

      const response = await route(post({ name: '' }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid request body' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(handler).not.toHaveBeenCalled();
    });

    it('lets a route keep its existing validation body via invalidBody', async () => {
      const route = defineRoute(
        {
          ...config,
          body: {
            ...config.body,
            invalidBody: error => ({
              error: 'Bad name',
              fields: error.issues.map(issue => issue.path.join('.')),
            }),
          },
        },
        vi.fn()
      );

      const response = await route(post({}));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Bad name',
        fields: ['name'],
      });
    });

    it('rejects an oversized body with 413', async () => {
      const route = defineRoute(
        { ...config, body: { ...config.body, maxBodySize: 8 } },
        vi.fn()
      );

      const response = await route(
        post({ name: 'far too long for the cap' }),
        undefined
      );

      expect(response.status).toBe(413);
    });

    it('treats an empty body as {} only when allowEmptyBody is set', async () => {
      const schema = z.object({ name: z.string().optional() });
      const lenient = defineRoute(
        {
          route: ROUTE,
          access: publicAccess(),
          body: { schema, allowEmptyBody: true },
        },
        ({ body }) => NextResponse.json({ body })
      );
      const strict = defineRoute(
        { route: ROUTE, access: publicAccess(), body: { schema } },
        ({ body }) => NextResponse.json({ body })
      );

      expect(await (await lenient(post())).json()).toEqual({
        body: {},
      });
      expect((await strict(post())).status).toBe(400);
    });
  });

  describe('errors', () => {
    it('turns a thrown handler error into one 500 shape and captures it once', async () => {
      const failure = new Error('db exploded: secret detail');
      const route = defineRoute(
        { route: ROUTE, access: publicAccess() },
        () => {
          throw failure;
        }
      );

      const response = await route(get());

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(mockCaptureError).toHaveBeenCalledTimes(1);
      expect(mockCaptureError).toHaveBeenCalledWith(
        `[${ROUTE}] Unhandled route error`,
        failure,
        { route: ROUTE, method: 'GET' }
      );
    });

    it('uses the route errorMessage and also covers a throwing rate limiter', async () => {
      const route = defineRoute(
        {
          route: ROUTE,
          access: publicAccess(),
          errorMessage: 'Failed to load leads',
          rateLimit: async () => {
            throw new Error('redis down');
          },
        },
        vi.fn()
      );

      const response = await route(get());

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to load leads' });
      expect(mockCaptureError).toHaveBeenCalledTimes(1);
    });

    it('legacy rethrow lets the exception escape uncaptured', async () => {
      const route = defineRoute(
        {
          route: ROUTE,
          access: publicAccess(),
          legacy: { unhandledErrors: 'rethrow' },
        },
        async () => {
          throw new Error('legacy failure');
        }
      );

      await expect(route(get())).rejects.toThrow('legacy failure');
      expect(mockCaptureError).not.toHaveBeenCalled();
    });
  });

  describe('cache headers', () => {
    it('adds no-store to a handler response that set no Cache-Control', async () => {
      const route = defineRoute({ route: ROUTE, access: publicAccess() }, () =>
        NextResponse.json({ ok: true })
      );

      expect((await route(get())).headers.get('cache-control')).toBe(
        'no-store'
      );
    });

    it('keeps a Cache-Control the handler chose', async () => {
      const route = defineRoute({ route: ROUTE, access: publicAccess() }, () =>
        NextResponse.json(
          { ok: true },
          { headers: { 'Cache-Control': 'public, max-age=60' } }
        )
      );

      expect((await route(get())).headers.get('cache-control')).toBe(
        'public, max-age=60'
      );
    });

    it('copies a response with immutable headers rather than failing', async () => {
      const upstream = Response.redirect('https://jov.ie/elsewhere', 302);
      const route = defineRoute(
        { route: ROUTE, access: publicAccess() },
        () => upstream
      );

      const response = await route(get());

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://jov.ie/elsewhere');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('legacy pipeline-responses-only returns the handler response object untouched', async () => {
      const handlerResponse = NextResponse.json({ ok: true });
      const config = {
        route: ROUTE,
        legacy: { cache: 'pipeline-responses-only' as const },
      };
      const allowed = defineRoute(
        { ...config, access: publicAccess() },
        () => handlerResponse
      );
      const denied = defineRoute(
        { ...config, access: deny(403, { error: 'Forbidden' }) },
        vi.fn()
      );

      const response = await allowed(get());
      expect(response).toBe(handlerResponse);
      expect(response.headers.has('cache-control')).toBe(false);
      expect((await denied(get())).headers.get('cache-control')).toBe(
        'no-store'
      );
    });

    it('legacy none adds no Cache-Control anywhere', async () => {
      const config = { route: ROUTE, legacy: { cache: 'none' as const } };
      const allowed = defineRoute({ ...config, access: publicAccess() }, () =>
        NextResponse.json({ ok: true })
      );
      const denied = defineRoute(
        { ...config, access: deny(401, { error: 'Unauthorized' }) },
        vi.fn()
      );

      expect((await allowed(get())).headers.has('cache-control')).toBe(false);
      const denial = await denied(get());
      expect(denial.status).toBe(401);
      expect(denial.headers.has('cache-control')).toBe(false);
    });
  });
});
