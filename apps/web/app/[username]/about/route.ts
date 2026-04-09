import { NextRequest, NextResponse } from 'next/server';
import {
  getProfileModeRedirectHref,
  getRouteRedirectSearchParams,
} from '../_lib/mode-route-redirect';

interface RouteContext {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { username } = await params;
  const location = getProfileModeRedirectHref(
    username,
    getRouteRedirectSearchParams(request.nextUrl.searchParams),
    'about'
  );

  return new NextResponse(null, {
    headers: { location },
    status: 307,
  });
}
