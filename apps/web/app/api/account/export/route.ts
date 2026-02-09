import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { setupDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { userSettings, users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';

/**
 * GET /api/account/export
 *
 * GDPR Article 20 - Right to data portability.
 * Exports all user data as a downloadable JSON file.
 */
export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  try {
    await setupDbSession(clerkUserId);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const [settings, profiles] = await Promise.all([
      db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, user.id))
        .limit(1),
      db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, user.id)),
    ]);

    // Fetch related data for each profile
    const profileData = await Promise.all(
      profiles.map(async profile => {
        const [profileLinks, profileContacts] = await Promise.all([
          db
            .select({
              id: socialLinks.id,
              platform: socialLinks.platform,
              platformType: socialLinks.platformType,
              url: socialLinks.url,
              displayText: socialLinks.displayText,
              state: socialLinks.state,
              createdAt: socialLinks.createdAt,
            })
            .from(socialLinks)
            .where(eq(socialLinks.creatorProfileId, profile.id)),
          db
            .select({
              id: creatorContacts.id,
              role: creatorContacts.role,
              personName: creatorContacts.personName,
              companyName: creatorContacts.companyName,
              email: creatorContacts.email,
              phone: creatorContacts.phone,
              createdAt: creatorContacts.createdAt,
            })
            .from(creatorContacts)
            .where(eq(creatorContacts.creatorProfileId, profile.id)),
        ]);

        return {
          id: profile.id,
          creatorType: profile.creatorType,
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          isPublic: profile.isPublic,
          genres: profile.genres,
          spotifyUrl: profile.spotifyUrl,
          appleMusicUrl: profile.appleMusicUrl,
          youtubeUrl: profile.youtubeUrl,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
          links: profileLinks,
          contacts: profileContacts,
        };
      })
    );

    const exportData = {
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
          }
        : null,
      profiles: profileData,
    };

    const json = JSON.stringify(exportData, null, 2);

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
