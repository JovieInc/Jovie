import { NO_STORE_HEADERS } from '@/lib/http/headers';

export function createExtensionCorsHeaders(
  request: Request,
  methods: string
): HeadersInit {
  const origin = request.headers.get('origin');

  if (!origin || !origin.startsWith('chrome-extension://')) {
    return NO_STORE_HEADERS;
  }

  return {
    ...NO_STORE_HEADERS,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': methods,
    Vary: 'Origin',
  };
}
