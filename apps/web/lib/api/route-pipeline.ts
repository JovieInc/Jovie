import { type NextRequest, NextResponse } from 'next/server';
import type { ZodError, ZodType } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';

/**
 * The one request pipeline for `app/api` route handlers.
 *
 * Every stage a route used to hand-roll is declared once, in a fixed order:
 *
 *   1. access      who may call (required, so "no auth" is a visible choice)
 *   2. rateLimit   optional limiter, sees the authorized caller
 *   3. body        optional JSON parse + schema validation
 *   4. handler     the route's own logic
 *   5. errors      one 500 shape + one capture call for anything thrown
 *   6. cache       `Cache-Control: no-store` unless the handler set its own
 *
 * New routes must use it (`tests/unit/ci/api-route-pipeline-guard.test.ts`).
 * The `legacy` options exist only so an existing route can move onto the
 * pipeline with byte-identical responses; they are counted and should shrink.
 */

export type AccessResult<TAuth> =
  | { ok: true; auth: TAuth }
  | { ok: false; status: number; body: unknown };

/** Decides who may call a route. Denials are data so the pipeline owns headers. */
export interface AccessPolicy<TAuth> {
  readonly name: string;
  authorize(request: NextRequest): Promise<AccessResult<TAuth>>;
}

/** Explicitly unauthenticated. Greppable on purpose. */
export function publicAccess(): AccessPolicy<null> {
  return {
    name: 'public',
    authorize: async () => ({ ok: true, auth: null }),
  };
}

export interface RouteStageInput<TAuth> {
  request: NextRequest;
  auth: TAuth;
  /** Headers every pipeline-authored response carries. */
  responseHeaders: Readonly<Record<string, string>>;
}

export interface RouteHandlerInput<TAuth, TBody = undefined>
  extends RouteStageInput<TAuth> {
  body: TBody;
}

/** Returns a response to stop the request (for example a 429), or null to continue. */
export type RateLimitStage<TAuth> = (
  input: RouteStageInput<TAuth>
) => Promise<Response | null>;

export interface BodyStage<TBody> {
  schema: ZodType<TBody>;
  /** Default 1MB, enforced while streaming. */
  maxBodySize?: number;
  /** Treat an empty body as `{}` before validation. */
  allowEmptyBody?: boolean;
  /** Override the validation failure body. Status stays 400. */
  invalidBody?: (error: ZodError) => unknown;
}

export interface RouteConfig<TAuth, TBody> {
  /** Stable route name for logs and error capture, e.g. `/api/admin/users`. */
  route: string;
  access: AccessPolicy<TAuth>;
  rateLimit?: RateLimitStage<TAuth>;
  body?: BodyStage<TBody>;
  /** Public message for the standard 500. */
  errorMessage?: string;
  /**
   * Migration-only escape hatches. Do not use in new routes.
   * Each one preserves a pre-pipeline behavior exactly.
   */
  legacy?: {
    /**
     * `pipeline-responses-only`: handler responses are returned untouched.
     * `none`: additionally, denials carry no Cache-Control header.
     */
    cache?: 'pipeline-responses-only' | 'none';
    /** Let handler exceptions escape to the framework, as before. */
    unhandledErrors?: 'rethrow';
  };
}

/** `context` is Next's second argument (`{ params }`), typed by the handler. */
export type RouteHandler<TAuth, TBody, TContext> = (
  input: RouteHandlerInput<TAuth, TBody>,
  context: TContext
) => Promise<Response> | Response;

/**
 * The exported route function. Static routes (handler takes no `{ params }`)
 * may be called without a context; dynamic routes require it.
 */
export type PipelineRoute<TContext> = unknown extends TContext
  ? (request: NextRequest, context?: unknown) => Promise<Response>
  : (request: NextRequest, context: TContext) => Promise<Response>;

const EMPTY_HEADERS: Readonly<Record<string, string>> = Object.freeze({});

function withNoStore(response: Response): Response {
  if (response.headers.has('Cache-Control')) return response;
  try {
    response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
    return response;
  } catch {
    // Immutable headers (for example a passed-through fetch response).
    const copy = new Response(response.body, response);
    copy.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
    return copy;
  }
}

export function defineRoute<TAuth, TBody = undefined, TContext = unknown>(
  config: RouteConfig<TAuth, TBody>,
  handler: RouteHandler<TAuth, TBody, TContext>
): PipelineRoute<TContext> {
  const cacheMode = config.legacy?.cache ?? 'no-store';
  const responseHeaders: Readonly<Record<string, string>> =
    cacheMode === 'none' ? EMPTY_HEADERS : NO_STORE_HEADERS;
  const jsonInit = (status: number): ResponseInit =>
    cacheMode === 'none' ? { status } : { status, headers: responseHeaders };

  return async function routePipeline(
    request: NextRequest,
    context: TContext
  ): Promise<Response> {
    // Access errors propagate: a broken auth dependency must never be
    // mistaken for an allow or silently turned into a generic 500 here.
    const access = await config.access.authorize(request);
    if (!access.ok) {
      return NextResponse.json(access.body, jsonInit(access.status));
    }

    const stage: RouteStageInput<TAuth> = {
      request,
      auth: access.auth,
      responseHeaders,
    };

    const run = async (): Promise<Response> => {
      if (config.rateLimit) {
        const limited = await config.rateLimit(stage);
        if (limited) return limited;
      }

      let body = undefined as TBody;
      if (config.body) {
        const parsed = await parseJsonBody<unknown>(request, {
          route: config.route,
          headers: cacheMode === 'none' ? undefined : responseHeaders,
          maxBodySize: config.body.maxBodySize,
          allowEmptyBody: config.body.allowEmptyBody,
        });
        if (!parsed.ok) return parsed.response;
        const validated = config.body.schema.safeParse(parsed.data);
        if (!validated.success) {
          return NextResponse.json(
            config.body.invalidBody
              ? config.body.invalidBody(validated.error)
              : { error: 'Invalid request body' },
            jsonInit(400)
          );
        }
        body = validated.data;
      }

      return handler({ ...stage, body }, context);
    };

    let response: Response;
    if (config.legacy?.unhandledErrors === 'rethrow') {
      response = await run();
    } else {
      try {
        response = await run();
      } catch (error) {
        await captureError(`[${config.route}] Unhandled route error`, error, {
          route: config.route,
          method: request.method,
        });
        return NextResponse.json(
          { error: config.errorMessage ?? 'Internal server error' },
          jsonInit(500)
        );
      }
    }

    return cacheMode === 'no-store' ? withNoStore(response) : response;
  } as PipelineRoute<TContext>;
}
