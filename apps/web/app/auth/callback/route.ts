import {
  AUTH_STATE_PARAM,
  buildNativeHandbackBouncePath,
  createAuthAnalyticsEvent,
  type NativeAuthClient,
  resolveAuthCallback,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import { auth } from '@/lib/auth/better-auth';
import {
  consumeStoredAuthState,
  createStoredNativeExchangeCode,
} from '@/lib/auth/routing-state.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { trackServerEvent } from '@/lib/server-analytics';

export const runtime = 'nodejs';

function createExchangeCode(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

async function trackAuthEvent(
  event: Parameters<typeof createAuthAnalyticsEvent>[0],
  input: Parameters<typeof createAuthAnalyticsEvent>[1]
) {
  await trackServerEvent(event, createAuthAnalyticsEvent(event, input)).catch(
    () => undefined
  );
}

/**
 * Mint a one-time token from the completing browser's Better Auth session
 * (plan decision 9). The native exchange route verifies this OTT to redeem
 * a fresh native session (iOS) or hands it to the native-complete page
 * (Electron) which POSTs it to `/api/auth/one-time-token/verify`.
 *
 * `auth.api.generateOneTimeToken` requires a session (it reads the user
 * from the request headers); the OTT is bound to the completing user.
 * `expiresIn: 5` (minutes) ≥ the native exchange TTL (5 min).
 */
async function mintNativeOneTimeToken(
  headers: Headers
): Promise<string | null> {
  try {
    const result = await auth.api.generateOneTimeToken({ headers });
    if (!result?.token) return null;
    return result.token;
  } catch (error) {
    await captureError('Native OTT mint failed at auth callback', error, {
      route: '/auth/callback',
      operation: 'generateOneTimeToken',
    });
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  if (!state) {
    return NextResponse.json(
      { error: 'Missing auth state' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    // Better Auth session (Clerk → Better Auth migration, plan decision 9).
    // `auth.api.getSession` validates the signed session cookie and returns
    // the user. A missing session redirects to /signin with the auth state
    // preserved so the OAuth flow restarts cleanly.
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      const signInUrl = new URL(APP_ROUTES.SIGNIN, request.url);
      signInUrl.searchParams.set(AUTH_STATE_PARAM, state);
      return NextResponse.redirect(signInUrl, { headers: NO_STORE_HEADERS });
    }

    const stateRecord = await consumeStoredAuthState({ state });
    if (!stateRecord) {
      return NextResponse.json(
        { error: 'Auth state expired' },
        { status: 410, headers: NO_STORE_HEADERS }
      );
    }

    void trackAuthEvent('auth_callback_received', {
      client: stateRecord.client,
      intent: stateRecord.intent,
      result: 'received',
      returnTo: stateRecord.returnTo,
    });

    let exchangeCode: string | undefined;
    const nativeClient: NativeAuthClient | null =
      stateRecord.client === 'web' ? null : stateRecord.client;

    // Native clients: mint an OTT from the completing browser session and
    // store it in the exchange record. The native exchange route reads it
    // back to verify (iOS) or hands it to native-complete (Electron).
    let ott: string | null = null;
    if (nativeClient) {
      exchangeCode = createExchangeCode();
      ott = await mintNativeOneTimeToken(request.headers);
      if (!ott) {
        // OTT mint failed (captured above). Still create the exchange record
        // so the native client can surface a specific failure class
        // (`ott_missing`) rather than a generic missing-code error.
        await captureError(
          'Native exchange created without OTT — exchange will fail at verify',
          new Error('OTT mint returned null'),
          {
            route: '/auth/callback',
            client: nativeClient,
          }
        );
      }
      await createStoredNativeExchangeCode({
        code: exchangeCode,
        client: nativeClient,
        state: stateRecord.state,
        userId,
        returnTo: stateRecord.returnTo,
        codeChallenge: stateRecord.codeChallenge,
        ott,
      });
    }

    const resolved = resolveAuthCallback({ stateRecord, exchangeCode });
    void trackAuthEvent('auth_returned_to_client', {
      client: stateRecord.client,
      intent: stateRecord.intent,
      result: 'returned',
      returnTo: stateRecord.returnTo,
    });

    // Native sign-in runs in ASWebAuthenticationSession (iOS) or the system
    // browser (Electron). A raw 302 to a custom scheme is not a reliable
    // handback: Safari/ASWebAuthenticationSession can leave the user on the
    // last HTTPS page, which used to be the web dashboard. Bounce through an
    // allowlisted same-origin page that fires the deep link and keeps an
    // explicit "Return to Jovie" control. Never fall through to /app.
    if (resolved.client !== 'web' && exchangeCode) {
      const bounce = new URL(
        buildNativeHandbackBouncePath({
          client: resolved.client,
          code: exchangeCode,
          state: stateRecord.state,
          desktopFlow: stateRecord.desktopFlow,
        }),
        request.url
      );
      return NextResponse.redirect(bounce, { headers: NO_STORE_HEADERS });
    }

    return NextResponse.redirect(new URL(resolved.redirectUrl, request.url), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Auth callback route failed', error, {
      route: '/auth/callback',
    });

    return NextResponse.json(
      { error: 'Auth callback failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
