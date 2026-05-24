import { auth } from '@clerk/nextjs/server';
import {
  AUTH_STATE_PARAM,
  createAuthAnalyticsEvent,
  type NativeAuthClient,
  resolveAuthCallback,
} from '@jovie/auth-routing';
import { NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  createStoredNativeExchangeCode,
  deleteStoredAuthState,
  readStoredAuthState,
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
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL(APP_ROUTES.SIGNIN, request.url);
      signInUrl.searchParams.set(AUTH_STATE_PARAM, state);
      return NextResponse.redirect(signInUrl, { headers: NO_STORE_HEADERS });
    }

    const stateRecord = await readStoredAuthState({ state });
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
    if (stateRecord.client !== 'web') {
      exchangeCode = createExchangeCode();
      await createStoredNativeExchangeCode({
        code: exchangeCode,
        client: stateRecord.client as NativeAuthClient,
        state: stateRecord.state,
        userId,
        returnTo: stateRecord.returnTo,
        codeChallenge: stateRecord.codeChallenge,
      });
    }

    await deleteStoredAuthState({ state });

    const resolved = resolveAuthCallback({ stateRecord, exchangeCode });
    void trackAuthEvent('auth_returned_to_client', {
      client: stateRecord.client,
      intent: stateRecord.intent,
      result: 'returned',
      returnTo: stateRecord.returnTo,
    });

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
