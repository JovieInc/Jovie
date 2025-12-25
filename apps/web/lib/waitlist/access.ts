import { desc, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { waitlistEntries, waitlistInvites } from '@/lib/db/schema';

export type WaitlistStatus = 'new' | 'invited' | 'claimed' | 'rejected';

export interface WaitlistAccessLookup {
  entryId: string | null;
  status: WaitlistStatus | null;
  inviteToken: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getWaitlistAccessByEmail(
  emailRaw: string
): Promise<WaitlistAccessLookup> {
  const email = normalizeEmail(emailRaw);

  const [entry] = await db
    .select({ id: waitlistEntries.id, status: waitlistEntries.status })
    .from(waitlistEntries)
    .where(drizzleSql`lower(${waitlistEntries.email}) = ${email}`)
    .limit(1);

  const entryId = entry?.id ?? null;
  const status = (entry?.status ?? null) as WaitlistStatus | null;

  if (!entryId || status !== 'invited') {
    return { entryId, status, inviteToken: null };
  }

  const [invite] = await db
    .select({ claimToken: waitlistInvites.claimToken })
    .from(waitlistInvites)
    .where(eq(waitlistInvites.waitlistEntryId, entryId))
    .orderBy(desc(waitlistInvites.createdAt))
    .limit(1);

  return { entryId, status, inviteToken: invite?.claimToken ?? null };
}

export interface WaitlistInviteLookup {
  waitlistEntryId: string;
  email: string;
  claimToken: string;
}

export async function getWaitlistInviteByToken(
  token: string
): Promise<WaitlistInviteLookup | null> {
  const [invite] = await db
    .select({
      waitlistEntryId: waitlistInvites.waitlistEntryId,
      email: waitlistInvites.email,
      claimToken: waitlistInvites.claimToken,
    })
    .from(waitlistInvites)
    .where(eq(waitlistInvites.claimToken, token))
    .limit(1);

  return invite ?? null;
}
