import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

/**
 * Authentication result when successful
 */
export interface AuthSuccess {
  userId: string;
  error: null;
}

/**
 * Authentication result when failed
 */
export interface AuthError {
  userId: null;
  error: NextResponse;
}

export type AuthResult = AuthSuccess | AuthError;

/**
 * Require authentication for API routes.
 *
 * Returns the userId if authenticated, or a 401 response if not.
 * Use this to reduce boilerplate in API routes that need authentication.
 *
 * @example
 * ```typescript
 * import { requireAuth } from '@/lib/auth/require-auth';
 *
 * export async function GET() {
 *   const { userId, error } = await requireAuth();
 *   if (error) return error;
 *
 *   // userId is guaranteed to be a string here
 *   const data = await fetchUserData(userId);
 *   return NextResponse.json(data);
 * }
 * ```
 *
 * @example With custom error message
 * ```typescript
 * const { userId, error } = await requireAuth({
 *   message: 'Please sign in to upload photos',
 * });
 * if (error) return error;
 * ```
 */
export async function requireAuth(options?: {
  /** Custom error message */
  message?: string;
  /** Include NO_STORE_HEADERS (default: true) */
  noCache?: boolean;
}): Promise<AuthResult> {
  const { message = 'Unauthorized', noCache = true } = options ?? {};

  const { userId } = await auth();

  if (!userId) {
    return {
      userId: null,
      error: NextResponse.json(
        { error: message },
        {
          status: 401,
          headers: noCache ? NO_STORE_HEADERS : undefined,
        }
      ),
    };
  }

  return { userId, error: null };
}

/**
 * Get current user ID or null.
 * Simpler alternative when you don't need an error response.
 *
 * @example
 * ```typescript
 * const userId = await getAuthUserId();
 * if (!userId) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Type guard to check if auth result is successful
 */
export function isAuthSuccess(result: AuthResult): result is AuthSuccess {
  return result.error === null;
}
