import { randomUUID } from 'crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { type DbType } from '@/lib/db';
import {
  creatorProfiles,
  users,
  waitlistEntries,
  waitlistInvites,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureCriticalError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { extractHandleFromUrl } from '@/lib/utils/social-platform';
import { waitlistApproveSchema } from '@/lib/validation/schemas';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function safeRandomHandle(): string {
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  return `c${token}`;
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

    const result = await withSystemIngestionSession(
      async tx => {
        const now = new Date();

        // Lock waitlist entry for update
        const [entry] = await tx
          .select({
            id: waitlistEntries.id,
            email: waitlistEntries.email,
            fullName: waitlistEntries.fullName,
            primarySocialUrlNormalized:
              waitlistEntries.primarySocialUrlNormalized,
            status: waitlistEntries.status,
          })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, parsed.data.entryId))
          .for('update')
          .limit(1);

        if (!entry) {
          return { outcome: 'not_found' as const };
        }

        if (entry.status !== 'new') {
          return {
            outcome: 'already_processed' as const,
            status: entry.status,
          };
        }

        // NEW FLOW: Get profile created during signup (via waitlistEntryId)
        const [profile] = await tx
          .select({ id: creatorProfiles.id })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.waitlistEntryId, entry.id))
          .limit(1);

        if (!profile) {
          // FALLBACK: Profile not found - this means signup happened before PR #1736
          // Use old flow: create profile with claim token
          const handleCandidate =
            extractHandleFromUrl(entry.primarySocialUrlNormalized) ??
            entry.email.split('@')[0] ??
            safeRandomHandle();

          const baseHandle = validateUsername(handleCandidate).isValid
            ? handleCandidate
            : safeRandomHandle();

          const usernameNormalized = await findAvailableHandle(tx, baseHandle);

          const claimToken = randomUUID();
          const claimTokenExpiresAt = new Date(now);
          claimTokenExpiresAt.setDate(claimTokenExpiresAt.getDate() + 30);

          const trimmedName = entry.fullName.trim();
          const displayName = trimmedName
            ? trimmedName.slice(0, 50)
            : 'Jovie creator';

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
              createdAt: now,
              updatedAt: now,
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
              runAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({
              target: waitlistInvites.waitlistEntryId,
            })
            .returning({
              id: waitlistInvites.id,
              claimToken: waitlistInvites.claimToken,
            });

          await tx
            .update(waitlistEntries)
            .set({ status: 'invited', updatedAt: now })
            .where(eq(waitlistEntries.id, entry.id));

          return {
            outcome: 'approved' as const,
            flow: 'legacy_claim' as const,
            inviteId: invite?.id,
            claimToken: invite?.claimToken ?? claimToken,
          };
        }

        // NEW FLOW: Get user by email
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(drizzleSql`lower(${users.email}) = lower(${entry.email})`)
          .limit(1);

        if (!user) {
          throw new Error(
            'User not found for email - signup flow incomplete. User may need to sign in first.'
          );
        }

        // NEW FLOW: Link profile to user and mark as claimed + public
        await tx
          .update(creatorProfiles)
          .set({
            userId: user.id,
            isClaimed: true,
            isPublic: true,
            onboardingCompletedAt: now, // Skip onboarding
            updatedAt: now,
          })
          .where(eq(creatorProfiles.id, profile.id));

        // Update waitlist entry status to 'claimed' (skip 'invited' state)
        await tx
          .update(waitlistEntries)
          .set({
            status: 'claimed',
            updatedAt: now,
          })
          .where(eq(waitlistEntries.id, entry.id));

        // Update user status to 'active'
        await tx
          .update(users)
          .set({
            userStatus: 'active',
            updatedAt: now,
          })
          .where(eq(users.id, user.id));

        // OPTIONAL: Still create waitlistInvite for tracking (no claim token needed)
        await tx
          .insert(waitlistInvites)
          .values({
            waitlistEntryId: entry.id,
            creatorProfileId: profile.id,
            email: entry.email,
            fullName: entry.fullName,
            claimToken: null as unknown as string, // No token needed for new flow
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            runAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: waitlistInvites.waitlistEntryId });

        return {
          outcome: 'approved' as const,
          flow: 'simplified' as const,
          profileId: profile.id,
        };
      },
      { isolationLevel: 'serializable' }
    );

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Waitlist entry not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (result.outcome === 'already_processed') {
      return NextResponse.json(
        {
          success: false,
          error: `Entry already processed with status: ${result.status}`,
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Handle different flows
    if (result.flow === 'simplified') {
      return NextResponse.json(
        {
          success: true,
          status: 'claimed',
          flow: 'simplified',
          profileId: result.profileId,
          message:
            'Profile linked to user and activated. User can sign in immediately.',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Legacy flow (for entries before PR #1736)
    return NextResponse.json(
      {
        success: true,
        status: 'invited',
        flow: 'legacy_claim',
        inviteQueued: true,
        invite: {
          id: result.inviteId,
          claimToken: result.claimToken,
        },
        message: 'Profile created with claim link. User must claim via email.',
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
