import { and, count, desc, sql as drizzleSql, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionErrorResponse } from '@/app/api/chat/session-error-response';
import { APP_ROUTES } from '@/constants/routes';
import { getSessionContext, withDbSessionTx } from '@/lib/auth/session';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { discogReleases, discogReleaseTracks } from '@/lib/db/schema/content';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { buildWelcomeMessage } from '@/lib/services/onboarding/welcome-message';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const MAX_INITIAL_REPLY_LENGTH = 2000;

function buildWelcomeChatRoute(conversationId: string): string {
  return `${APP_ROUTES.CHAT}/${conversationId}?panel=profile&from=onboarding`;
}

export async function POST(request: Request) {
  try {
    const { user, profile } = await getSessionContext({
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    let initialReply = '';
    try {
      const body = (await request.json()) as { initialReply?: unknown };
      initialReply =
        typeof body.initialReply === 'string' ? body.initialReply.trim() : '';
    } catch {
      initialReply = '';
    }

    if (initialReply.length > MAX_INITIAL_REPLY_LENGTH) {
      return NextResponse.json(
        {
          error: `Initial reply must be ${MAX_INITIAL_REPLY_LENGTH} characters or less.`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await withDbSessionTx(
      async tx => {
        await tx.execute(
          drizzleSql`SELECT ${creatorProfiles.id} FROM ${creatorProfiles} WHERE ${creatorProfiles.id} = ${profile.id} FOR UPDATE`
        );

        const [existingConversation] = await tx
          .select({
            id: chatConversations.id,
          })
          .from(chatConversations)
          .where(eq(chatConversations.creatorProfileId, profile.id))
          .orderBy(desc(chatConversations.updatedAt))
          .limit(1);

        if (existingConversation) {
          if (initialReply) {
            const [lastMessage] = await tx
              .select({
                content: chatMessages.content,
                role: chatMessages.role,
              })
              .from(chatMessages)
              .where(eq(chatMessages.conversationId, existingConversation.id))
              .orderBy(desc(chatMessages.createdAt))
              .limit(1);

            const shouldAppendInitialReply = !(
              lastMessage?.role === 'user' &&
              lastMessage.content === initialReply
            );

            if (shouldAppendInitialReply) {
              await tx.insert(chatMessages).values({
                content: initialReply,
                conversationId: existingConversation.id,
                role: 'user',
              });

              await tx
                .update(chatConversations)
                .set({ updatedAt: new Date() })
                .where(eq(chatConversations.id, existingConversation.id));
            }
          }

          return {
            conversationId: existingConversation.id,
            reused: true,
          };
        }

        const [
          trackCountResult,
          releaseCountResult,
          dspCountResult,
          socialCountResult,
          profileIdentityResult,
        ] = await Promise.all([
          tx
            .select({ value: count() })
            .from(discogReleaseTracks)
            .innerJoin(
              discogReleases,
              eq(discogReleases.id, discogReleaseTracks.releaseId)
            )
            .where(eq(discogReleases.creatorProfileId, profile.id)),
          tx
            .select({ value: count() })
            .from(discogReleases)
            .where(eq(discogReleases.creatorProfileId, profile.id)),
          tx
            .select({ value: count() })
            .from(dspArtistMatches)
            .where(
              and(
                eq(dspArtistMatches.creatorProfileId, profile.id),
                or(
                  eq(dspArtistMatches.status, 'confirmed'),
                  eq(dspArtistMatches.status, 'auto_confirmed')
                )
              )
            ),
          tx
            .select({ value: count() })
            .from(socialLinks)
            .where(
              and(
                eq(socialLinks.creatorProfileId, profile.id),
                eq(socialLinks.state, 'active')
              )
            ),
          tx
            .select({
              careerHighlights: creatorProfiles.careerHighlights,
              displayName: creatorProfiles.displayName,
              spotifyId: creatorProfiles.spotifyId,
              spotifyUrl: creatorProfiles.spotifyUrl,
              username: creatorProfiles.username,
            })
            .from(creatorProfiles)
            .where(eq(creatorProfiles.id, profile.id))
            .limit(1),
        ]);

        const profileIdentity = profileIdentityResult[0] ?? null;

        const hasSpotifyIdentity = Boolean(
          profileIdentity?.spotifyId || profileIdentity?.spotifyUrl
        );
        const trackCount = trackCountResult[0]?.value ?? 0;
        const releaseCount = releaseCountResult[0]?.value ?? 0;
        const dspCount =
          (dspCountResult[0]?.value ?? 0) + (hasSpotifyIdentity ? 1 : 0);
        const socialCount = socialCountResult[0]?.value ?? 0;
        const welcomeMessage = buildWelcomeMessage({
          displayName:
            profileIdentity?.displayName ?? profileIdentity?.username ?? '',
          releaseCount,
          trackCount,
          dspCount,
          socialCount,
          careerHighlights: profileIdentity?.careerHighlights ?? null,
        });

        const now = new Date();
        const [conversation] = await tx
          .insert(chatConversations)
          .values({
            creatorProfileId: profile.id,
            title: 'Welcome to Jovie',
            updatedAt: now,
            userId: user.id,
          })
          .returning({ id: chatConversations.id });

        await tx.insert(chatMessages).values({
          content: welcomeMessage,
          conversationId: conversation.id,
          role: 'assistant',
        });

        if (initialReply) {
          await tx.insert(chatMessages).values({
            content: initialReply,
            conversationId: conversation.id,
            role: 'user',
          });
        }

        await tx
          .update(chatConversations)
          .set({ updatedAt: new Date() })
          .where(eq(chatConversations.id, conversation.id));

        return {
          conversationId: conversation.id,
          reused: false,
        };
      },
      { clerkUserId: user.clerkId }
    );

    return NextResponse.json(
      {
        success: true,
        conversationId: result.conversationId,
        route: buildWelcomeChatRoute(result.conversationId),
        reused: result.reused,
      },
      {
        status: result.reused ? 200 : 201,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    await captureError('Onboarding welcome chat bootstrap failed', error, {
      route: '/api/onboarding/welcome-chat',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
