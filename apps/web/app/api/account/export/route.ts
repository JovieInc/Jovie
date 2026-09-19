import { eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { appUserIdFilter } from '@/lib/auth/app-user-id';
import { getCachedAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { userSettings, users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  checkAccountExportRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/account/export
 *
 * GDPR Article 20 - Right to data portability.
 * Exports all user data as a downloadable JSON file.
 *
 * Identity is `users.id` via `appUserIdFilter`. Protected reads run on
 * the same transaction handle after transaction-local RLS setup.
 */
export async function GET() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const rateLimitResult = await checkAccountExportRateLimit(userId);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.reason ?? 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
  }

  try {
    const exportResult = await withDbSessionTx(
      async (tx, appUserId) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(appUserIdFilter(appUserId))
          .limit(1);

        if (!user) {
          return { kind: 'not_found' as const };
        }

        const [settings, profiles] = await Promise.all([
          tx
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, user.id))
            .limit(1),
          tx
            .select()
            .from(creatorProfiles)
            .where(eq(creatorProfiles.userId, user.id)),
        ]);

        const profileIds = profiles.map(p => p.id);

        const [allLinks, allContacts] =
          profileIds.length > 0
            ? await Promise.all([
                tx
                  .select({
                    id: socialLinks.id,
                    creatorProfileId: socialLinks.creatorProfileId,
                    platform: socialLinks.platform,
                    platformType: socialLinks.platformType,
                    url: socialLinks.url,
                    displayText: socialLinks.displayText,
                    state: socialLinks.state,
                    createdAt: socialLinks.createdAt,
                    updatedAt: socialLinks.updatedAt,
                  })
                  .from(socialLinks)
                  .where(inArray(socialLinks.creatorProfileId, profileIds)),
                tx
                  .select({
                    id: creatorContacts.id,
                    creatorProfileId: creatorContacts.creatorProfileId,
                    role: creatorContacts.role,
                    customLabel: creatorContacts.customLabel,
                    personName: creatorContacts.personName,
                    companyName: creatorContacts.companyName,
                    territories: creatorContacts.territories,
                    email: creatorContacts.email,
                    phone: creatorContacts.phone,
                    preferredChannel: creatorContacts.preferredChannel,
                    isActive: creatorContacts.isActive,
                    sortOrder: creatorContacts.sortOrder,
                    createdAt: creatorContacts.createdAt,
                    updatedAt: creatorContacts.updatedAt,
                  })
                  .from(creatorContacts)
                  .where(inArray(creatorContacts.creatorProfileId, profileIds)),
              ])
            : [[], []];

        const linksByProfile = new Map<string, typeof allLinks>();
        for (const link of allLinks) {
          const arr = linksByProfile.get(link.creatorProfileId) ?? [];
          arr.push(link);
          linksByProfile.set(link.creatorProfileId, arr);
        }

        const contactsByProfile = new Map<string, typeof allContacts>();
        for (const contact of allContacts) {
          const arr = contactsByProfile.get(contact.creatorProfileId) ?? [];
          arr.push(contact);
          contactsByProfile.set(contact.creatorProfileId, arr);
        }

        const profileData = profiles.map(profile => ({
          id: profile.id,
          creatorType: profile.creatorType,
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          isPublic: profile.isPublic,
          isVerified: profile.isVerified,
          genres: profile.genres,
          spotifyUrl: profile.spotifyUrl,
          appleMusicUrl: profile.appleMusicUrl,
          youtubeUrl: profile.youtubeUrl,
          settings: profile.settings,
          theme: profile.theme,
          notificationPreferences: profile.notificationPreferences,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          links: linksByProfile.get(profile.id) ?? [],
          contacts: contactsByProfile.get(profile.id) ?? [],
        }));

        return {
          kind: 'ok' as const,
          payload: {
            exportedAt: new Date().toISOString(),
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              plan: user.plan,
              userStatus: user.userStatus,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            settings: settings[0]
              ? {
                  themeMode: settings[0].themeMode,
                  sidebarCollapsed: settings[0].sidebarCollapsed,
                  updatedAt: settings[0].updatedAt,
                }
              : null,
            profiles: profileData,
          },
        };
      },
      { clerkUserId: userId }
    );

    if (exportResult.kind === 'not_found') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const json = JSON.stringify(exportResult.payload, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="jovie-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (err) {
    await captureError('Failed to export user data', err, {
      route: '/api/account/export',
    });
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
