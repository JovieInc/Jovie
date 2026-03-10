import 'server-only';

export class ServerFetchTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'ServerFetchTimeoutError';
  }
}

type ServerFetchOptions = RequestInit & {
  timeoutMs?: number;
};

export async function serverFetch(
  input: RequestInfo | URL,
  options: ServerFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 5000, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromExternalSignal = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, {
        once: true,
      });
    }
  }

  try {
    return await fetch(input, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServerFetchTimeoutError(
        `External request timed out after ${timeoutMs}ms`,
        timeoutMs
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternalSignal);
    }
  }
}
