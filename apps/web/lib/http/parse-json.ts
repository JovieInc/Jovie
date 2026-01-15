import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';

interface ParseJsonOptions<T> {
  route: string;
  headers?: HeadersInit;
  logContext?: Record<string, unknown>;
  allowEmptyBody?: boolean;
  emptyBodyValue?: T;
  /**
   * Maximum allowed body size in bytes.
   * Default: 1MB (1048576 bytes)
   * Helps prevent DoS attacks via large payloads.
   */
  maxBodySize?: number;
}

/** Default max body size: 1MB */
const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB

type ParsedJsonSuccess<T> = {
  ok: true;
  data: T;
};

type ParsedJsonFailure = {
  ok: false;
  response: NextResponse;
};

export type ParsedJsonResult<T> = ParsedJsonSuccess<T> | ParsedJsonFailure;

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown JSON parse error';
  }
}

export async function parseJsonBody<T = unknown>(
  request: Request,
  options: ParseJsonOptions<T>
): Promise<ParsedJsonResult<T>> {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  // Check Content-Length header first for early rejection
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
    console.warn(`[${options.route}] Request body too large`, {
      contentLength,
      maxBodySize,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Request body too large' },
        { status: 413, headers: options.headers }
      ),
    };
  }

  const rawBody = await request.text();

  // Check actual body size (in case Content-Length was missing or incorrect)
  if (rawBody.length > maxBodySize) {
    console.warn(`[${options.route}] Request body exceeds size limit`, {
      actualSize: rawBody.length,
      maxBodySize,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Request body too large' },
        { status: 413, headers: options.headers }
      ),
    };
  }

  if (rawBody.trim().length === 0 && options.allowEmptyBody) {
    return {
      ok: true,
      data: options.emptyBodyValue ?? ({} as T),
    };
  }

  try {
    const parsed = JSON.parse(rawBody) as T;
    return { ok: true, data: parsed };
  } catch (error) {
    const message = formatErrorMessage(error);
    const contentType = request.headers.get('content-type') ?? undefined;
    const context = {
      route: options.route,
      requestUrl: request.url,
      contentType,
      ...options.logContext,
    };

    console.error(`[${options.route}] JSON parse failed`, {
      ...context,
      error: message,
    });

    await captureError('JSON parse failed', error, {
      context: 'json_parse_failure',
      ...context,
    });

    const includeDetails = process.env.NODE_ENV === 'development';

    const response = NextResponse.json(
      {
        error: 'Invalid JSON in request body',
        details: includeDetails ? message : undefined,
      },
      {
        status: 400,
        headers: options.headers,
      }
    );

    return { ok: false, response };
  }
}
