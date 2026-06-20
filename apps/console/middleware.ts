import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const REALM = 'Jovie Internal Console';

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${REALM}"` },
  });
}

/**
 * HTTP Basic Auth gate. Set CONSOLE_USER + CONSOLE_PASSWORD env vars.
 * Behind a VPN this is sufficient; credentials never hit the consumer app.
 *
 * Skip auth for the /api/health probe so load balancers can reach it.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next();
  }

  const user = process.env.CONSOLE_USER;
  const password = process.env.CONSOLE_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return unauthorized();
  }

  const encoded = authHeader.slice('Basic '.length);
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return unauthorized();
  }

  const colon = decoded.indexOf(':');
  if (colon === -1) return unauthorized();

  const inUser = decoded.slice(0, colon);
  const inPass = decoded.slice(colon + 1);

  if (inUser !== user || inPass !== password) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
