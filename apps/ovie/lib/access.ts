import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export type OperatorAccess = 'anonymous' | 'forbidden' | 'admin';

export function isPublicEntry(
  pathname: string,
  method = 'GET',
  isServerAction = false
): boolean {
  // A public page must never become an unauthenticated server-action door.
  if (isServerAction) return false;
  if (pathname.startsWith('/api/auth/')) {
    return ['GET', 'HEAD', 'POST', 'OPTIONS'].includes(method);
  }
  if (!['GET', 'HEAD'].includes(method)) return false;
  return (
    pathname === '/signin' ||
    pathname.startsWith('/_next/static/') ||
    pathname === '/_next/image' ||
    pathname === '/favicon.ico'
  );
}

/** The app gate covers pages, RSC, server actions and direct API requests. */
export function accessResponse(
  request: NextRequest,
  access: OperatorAccess
): NextResponse | null {
  if (access === 'admin') {
    // JOV-6026 keeps execution default-off pending signed callback commissioning.
    // Until queue callback authentication is verified on Ovie, do not enqueue
    // runs whose callbacks would be denied by this private app gate. This
    // request guard also covers standalone artifacts with later env changes.
    if (request.nextUrl.pathname === '/api/admin/agent-os/workflows/dry-run') {
      return NextResponse.json(
        {
          error:
            'Workflow execution is unavailable until Ovie callback authentication is verified',
        },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    return null;
  }
  const status = access === 'anonymous' ? 401 : 403;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (
    request.nextUrl.pathname.startsWith('/api/') ||
    !['GET', 'HEAD'].includes(request.method) ||
    request.headers.has('next-action')
  ) {
    return NextResponse.json(
      {
        error:
          status === 401 ? 'Authentication required' : 'Ovie access required',
      },
      { status, headers }
    );
  }
  if (status === 401) {
    const destination = new URL('/signin', request.url);
    destination.searchParams.set(
      'redirect_url',
      request.nextUrl.pathname + request.nextUrl.search
    );
    const response = NextResponse.redirect(destination);
    response.headers.set('Cache-Control', headers['Cache-Control']);
    return response;
  }
  return new NextResponse(
    'Ovie access required. Return to Jovie with an authorized account.',
    { status, headers }
  );
}
