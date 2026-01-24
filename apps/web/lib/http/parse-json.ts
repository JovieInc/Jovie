import { NextResponse } from 'next/server';
import { captureError, captureWarning } from '@/lib/error-tracking';

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

/**
 * Read request body with streaming size limit to prevent OOM attacks.
 * Stops reading if body exceeds maxSize bytes.
 */
async function readBodyWithLimit(
  request: Request,
  maxSize: number
): Promise<{ body: string; exceeded: boolean; actualSize: number }> {
  const reader = request.body?.getReader();
  if (!reader) {
    return { body: '', exceeded: false, actualSize: 0 };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;

      // Stop reading if we exceed the limit
      if (totalBytes > maxSize) {
        reader.cancel();
        return { body: '', exceeded: true, actualSize: totalBytes };
      }

      chunks.push(value);
    }

    // Concatenate chunks and decode
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoder = new TextDecoder('utf-8');
    return {
      body: decoder.decode(combined),
      exceeded: false,
      actualSize: totalBytes,
    };
  } finally {
    reader.releaseLock();
  }
}

export async function parseJsonBody<T = unknown>(
  request: Request,
  options: ParseJsonOptions<T>
): Promise<ParsedJsonResult<T>> {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  // Check Content-Length header first for early rejection
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > maxBodySize) {
    captureWarning(`[${options.route}] Request body too large`, {
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

  // Use streaming read with size cap to prevent OOM if Content-Length is missing/spoofed
  const {
    body: rawBody,
    exceeded,
    actualSize,
  } = await readBodyWithLimit(request, maxBodySize);

  // Check if body exceeded limit during streaming read
  if (exceeded) {
    captureWarning(`[${options.route}] Request body exceeds size limit`, {
      actualSize,
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

    await captureError(`[${options.route}] JSON parse failed`, error, {
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
