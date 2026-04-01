import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  type DbUserContext,
  getSessionContext,
  type ProfileContext,
} from '@/lib/auth/session';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

/**
 * Context provided to dashboard route handlers after auth + profile resolution.
 */
export interface DashboardContext {
  user: DbUserContext;
  profile: ProfileContext;
  clerkUserId: string;
}

type DashboardHandler = (
  ctx: DashboardContext,
  request: NextRequest
) => Promise<NextResponse>;

interface WithDashboardRouteOptions {
  /** Route name for error tracking (defaults to request pathname) */
  routeName?: string;
}

/**
 * Wraps a dashboard API route handler with standardized:
 * - Auth check (401 if not authenticated)
 * - User + profile resolution via single JOIN query (404 if missing)
 * - Automatic NO_STORE_HEADERS on error responses
 * - Standardized error capture via Sentry
 *
 * The handler receives `{ user, profile, clerkUserId }` and the request.
 * Handlers are responsible for adding NO_STORE_HEADERS to their success responses.
 *
 * @example
 * ```ts
 * export const GET = withDashboardRoute(async (ctx) => {
 *   const data = await fetchDataForProfile(ctx.profile.id);
 *   return NextResponse.json(data, { headers: NO_STORE_HEADERS });
 * });
 * ```
 */
export function withDashboardRoute(
  handler: DashboardHandler,
  options?: WithDashboardRouteOptions
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const { userId } = await getCachedAuth();
      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401, headers: NO_STORE_HEADERS }
        );
      }

      const ctx = await getSessionContext({
        clerkUserId: userId,
        requireUser: true,
        requireProfile: true,
      });

      return await handler(
        {
          user: ctx.user,
          profile: ctx.profile!,
          clerkUserId: ctx.clerkUserId,
        },
        request
      );
    } catch (error) {
      const route = options?.routeName ?? request.nextUrl.pathname;

      // Handle known auth/profile errors as structured responses
      if (error instanceof TypeError) {
        if (error.message === 'User not found') {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404, headers: NO_STORE_HEADERS }
          );
        }
        if (error.message === 'Profile not found') {
          return NextResponse.json(
            { error: 'Profile not found' },
            { status: 404, headers: NO_STORE_HEADERS }
          );
        }
      }

      // Handle unauthorized from withDbSession/resolveClerkUserId
      if (error instanceof Error && error.message === 'Unauthorized') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401, headers: NO_STORE_HEADERS }
        );
      }

      captureError('Dashboard route error', error, { route });
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  };
}
