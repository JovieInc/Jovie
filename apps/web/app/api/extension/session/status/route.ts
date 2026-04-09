import { auth } from '@clerk/nextjs/server';
import type { ExtensionSessionStatusResponse } from '@jovie/extension-contracts';
import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { createExtensionCorsHeaders } from '@/lib/extensions/http';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
  });
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    const body: ExtensionSessionStatusResponse = {
      signedIn: false,
      profile: null,
    };

    return NextResponse.json(body, {
      headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
    });
  }

  try {
    const session = await getSessionContext({
      clerkUserId: userId,
      requireProfile: false,
    });

    const displayName =
      session.profile?.displayName ??
      session.profile?.username ??
      session.profile?.usernameNormalized ??
      'Jovie';

    const body: ExtensionSessionStatusResponse = {
      signedIn: true,
      profile: session.profile
        ? {
            id: session.profile.id,
            displayName,
            username: session.profile.username,
            avatarUrl: session.profile.avatarUrl,
          }
        : null,
    };

    return NextResponse.json(body, {
      headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Unauthorized' || error.message === 'User not found')
    ) {
      const body: ExtensionSessionStatusResponse = {
        signedIn: false,
        profile: null,
      };

      return NextResponse.json(body, {
        headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
      });
    }

    return NextResponse.json(
      { error: 'Unable to load extension session status.' },
      {
        status: 500,
        headers: createExtensionCorsHeaders(request, 'GET, OPTIONS'),
      }
    );
  }
}
