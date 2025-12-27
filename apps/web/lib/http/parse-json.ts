import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('ParseJSON');

interface ParseJsonOptions<T> {
  route: string;
  headers?: HeadersInit;
  logContext?: Record<string, unknown>;
  allowEmptyBody?: boolean;
  emptyBodyValue?: T;
}

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
  const rawBody = await request.text();

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

    log.error(`[${options.route}] JSON parse failed`, {
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
