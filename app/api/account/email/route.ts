import { clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export const runtime = 'nodejs';

const syncSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const result = syncSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email } = result.data;

    return await withDbSession(async clerkUserId => {
      const clerkUser = await clerkClient().users.getUser(clerkUserId);
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
          { status: 400 }
        );
      }

      if (matchingEmail.verification?.status !== 'verified') {
        return NextResponse.json(
          {
            error: 'Email address must be verified before syncing.',
          },
          { status: 400 }
        );
      }

      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.clerkId, clerkUserId));

      return NextResponse.json(
        { success: true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    console.error('Failed to sync email address:', error);
    return NextResponse.json(
      { error: 'Unable to sync email address' },
      { status: 500 }
    );
  }
}
