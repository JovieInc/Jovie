import { clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { parseJsonBody } from '@/lib/http/parse-json';
import { accountEmailSyncSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: Request) {
  try {
    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/account/email',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const payload = parsedBody.data;
    const result = accountEmailSyncSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { email } = result.data;

    return await withDbSession(async clerkUserId => {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const normalizedEmail = email.toLowerCase();

      const matchingEmail = clerkUser.emailAddresses.find(address => {
        return address.emailAddress.toLowerCase() === normalizedEmail;
      });

      if (!matchingEmail) {
        return NextResponse.json(
          {
            error:
              'Email must match one of your verified Clerk email addresses.',
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (matchingEmail.verification?.status !== 'verified') {
        return NextResponse.json(
          {
            error: 'Email address must be verified before syncing.',
          },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.clerkId, clerkUserId));

      return NextResponse.json(
        { success: true },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    console.error('Failed to sync email address:', error);
    return NextResponse.json(
      { error: 'Unable to sync email address' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
