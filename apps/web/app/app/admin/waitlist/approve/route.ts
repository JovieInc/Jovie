import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { type DbType, db } from '@/lib/db';
import {
  creatorProfiles,
  waitlistEntries,
  waitlistInvites,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function safeRandomHandle(): string {
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  return `c${token}`;
}

function extractHandleCandidateFromUrl(urlRaw: string): string | null {
  try {
    const url = new URL(urlRaw);
    const host = url.hostname.toLowerCase();

    // Define allowed hosts for each platform (add subdomains as needed)
    const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com'];
    const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com'];
    const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com'];
    const LINKTREE_HOSTS = ['linktr.ee', 'www.linktr.ee'];

    if (INSTAGRAM_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    if (TIKTOK_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    if (YOUTUBE_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      if (!seg) return null;

      if (seg.startsWith('@')) return seg.slice(1);
      return null;
    }

    if (LINKTREE_HOSTS.includes(host)) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      return seg ? seg.replace(/^@/, '') : null;
    }

    return null;
  } catch {
    return null;
  }
}

async function findAvailableHandle(tx: DbType, base: string): Promise<string> {
  const normalizedBase = normalizeUsername(base).slice(0, 30);
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i += 1) {
    const suffix = i === 0 ? '' : `-${i}`;
    const candidate = `${normalizedBase.slice(0, 30 - suffix.length)}${suffix}`;
    if (!validateUsername(candidate).isValid) continue;

    const [existing] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.usernameNormalized, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return safeRandomHandle();
}

export async function POST(request: Request) {
  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /app/admin/waitlist/approve',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const body = parsedBody.data;
    const parsed = waitlistApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [entry] = await db
      .select({
        id: waitlistEntries.id,
        email: waitlistEntries.email,
        fullName: waitlistEntries.fullName,
        primarySocialUrlNormalized: waitlistEntries.primarySocialUrlNormalized,
        status: waitlistEntries.status,
      })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, parsed.data.entryId))
      .limit(1);

    if (!entry) {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (entry.status === 'invited' || entry.status === 'claimed') {
      return NextResponse.json(
        { success: true, status: entry.status },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withSystemIngestionSession(async tx => {
      const [existingInvite] = await tx
        .select({
          id: waitlistInvites.id,
          claimToken: waitlistInvites.claimToken,
        })
        .from(waitlistInvites)
        .where(eq(waitlistInvites.waitlistEntryId, entry.id))
        .limit(1);

      if (existingInvite) {
        await tx
          .update(waitlistEntries)
          .set({ status: 'invited', updatedAt: new Date() })
          .where(eq(waitlistEntries.id, entry.id));

        return {
          inviteId: existingInvite.id,
          claimToken: existingInvite.claimToken,
        };
      }

      const handleCandidate =
        extractHandleCandidateFromUrl(entry.primarySocialUrlNormalized) ??
        entry.email.split('@')[0] ??
        safeRandomHandle();

      const baseHandle = validateUsername(handleCandidate).isValid
        ? handleCandidate
        : safeRandomHandle();

      const usernameNormalized = await findAvailableHandle(tx, baseHandle);

      const claimToken = randomUUID();
      const claimTokenExpiresAt = new Date();
      claimTokenExpiresAt.setDate(claimTokenExpiresAt.getDate() + 30);

      const displayName = entry.fullName.trim().slice(0, 50) || 'Jovie creator';

      const [createdProfile] = await tx
        .insert(creatorProfiles)
        .values({
          creatorType: 'creator',
          username: usernameNormalized,
          usernameNormalized,
          displayName,
          isPublic: true,
          isVerified: false,
          isFeatured: false,
          marketingOptOut: false,
          isClaimed: false,
          claimToken,
          claimTokenExpiresAt,
          settings: {},
          theme: {},
          ingestionStatus: 'idle',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: creatorProfiles.id });

      if (!createdProfile) {
        throw new Error('Failed to create creator profile');
      }

      const [invite] = await tx
        .insert(waitlistInvites)
        .values({
          waitlistEntryId: entry.id,
          creatorProfileId: createdProfile.id,
          email: entry.email,
          fullName: entry.fullName,
          claimToken,
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
          runAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: waitlistInvites.waitlistEntryId,
        })
        .returning({
          id: waitlistInvites.id,
          claimToken: waitlistInvites.claimToken,
        });

      if (!invite) {
        const [existing] = await tx
          .select({
            id: waitlistInvites.id,
            claimToken: waitlistInvites.claimToken,
          })
          .from(waitlistInvites)
          .where(eq(waitlistInvites.waitlistEntryId, entry.id))
          .limit(1);

        if (!existing) {
          throw new Error('Failed to enqueue waitlist invite');
        }

        await tx
          .update(waitlistEntries)
          .set({ status: 'invited', updatedAt: new Date() })
          .where(eq(waitlistEntries.id, entry.id));

        return { inviteId: existing.id, claimToken: existing.claimToken };
      }

      await tx
        .update(waitlistEntries)
        .set({ status: 'invited', updatedAt: new Date() })
        .where(eq(waitlistEntries.id, entry.id));

      return { inviteId: invite.id, claimToken: invite.claimToken };
    });

    return NextResponse.json(
      {
        success: true,
        status: 'invited',
        inviteQueued: true,
        invite: {
          id: result.inviteId,
          claimToken: result.claimToken,
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureCriticalError(
      'Admin action failed: approve waitlist entry',
      error instanceof Error ? error : new Error(String(error)),
      {
        route: '/app/admin/waitlist/approve',
        action: 'approve_waitlist',
        adminEmail: entitlements?.email ?? 'unknown',
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json(
      { success: false, error: 'Failed to approve waitlist entry' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
