import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export type AdminAuthErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

export class AdminAuthError extends Error {
  public readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode, message: string) {
    super(message);
    this.name = 'AdminAuthError';
    this.code = code;
  }
}

export function getAdminAuthStatusCode(code: AdminAuthErrorCode): 401 | 403 {
  return code === 'UNAUTHENTICATED' ? 401 : 403;
}

async function getCurrentUserAdminRecordFromDb(
  clerkUserId: string
): Promise<{ email: string | null; isAdmin: boolean }> {
  try {
    const [row] = await db
      .select({ email: users.email, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    return { email: row?.email ?? null, isAdmin: row?.isAdmin ?? false };
  } catch (error) {
    const maybeCode = (error as { code?: string } | null)?.code;
    if (maybeCode !== '42703') {
      throw error;
    }

    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    return { email: row?.email ?? null, isAdmin: false };
  }
}

export async function requireAdmin(): Promise<{
  clerkUserId: string;
  email: string | null;
}> {
  const { userId } = await auth();

  if (!userId) {
    throw new AdminAuthError('UNAUTHENTICATED', 'Unauthorized');
  }

  const { email, isAdmin } = await getCurrentUserAdminRecordFromDb(userId);

  if (!isAdmin) {
    throw new AdminAuthError('FORBIDDEN', 'Forbidden');
  }

  return { clerkUserId: userId, email };
}
