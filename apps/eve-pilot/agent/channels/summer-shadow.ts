import { defineChannel, GET, POST } from 'eve/channels';
import type { AuthFn } from 'eve/channels/auth';
import {
  extractBearerToken,
  routeAuth,
  vercelSubject,
  verifyVercelOidc,
  withAuthChallenges,
} from 'eve/channels/auth';
import {
  createSummerShadowIngressHandler,
  summerShadowKey,
} from '../lib/summer-shadow-ingress';
import { persistImmutableShadowRecord } from '../lib/vercel-blob-shadow-store';

export const JOVIE_PRODUCTION_OIDC_SUBJECT = vercelSubject({
  teamSlug: 'jovie',
  projectName: 'jovie',
  environment: 'production',
});

type SummerShadowChannelState = {
  readonly dispatchAuthority: 'none';
  readonly eventId: string;
  readonly identity: 'summer';
  readonly receiptPath: string;
  readonly source: 'ovie-summer-shadow';
};

export const ovieSummerShadowOidcAuth: AuthFn<Request> = withAuthChallenges(
  async request => {
    const verification = await verifyVercelOidc(
      extractBearerToken(request.headers.get('authorization')),
      { subjects: [JOVIE_PRODUCTION_OIDC_SUBJECT] }
    );
    if (
      !verification.ok ||
      verification.sessionAuth.subject !== JOVIE_PRODUCTION_OIDC_SUBJECT
    ) {
      return null;
    }

    return {
      ...verification.sessionAuth,
      attributes: {
        ...verification.sessionAuth.attributes,
        dispatchAuthority: 'none',
        identity: 'summer',
        readOnly: 'true',
        source: 'ovie-summer-shadow',
      },
      authenticator: 'vercel-oidc:ovie-summer-shadow',
    };
  },
  [{ scheme: 'Bearer' }]
);

export default defineChannel<SummerShadowChannelState>({
  state: {
    dispatchAuthority: 'none',
    eventId: '',
    identity: 'summer',
    receiptPath: '',
    source: 'ovie-summer-shadow',
  },
  metadata(state) {
    return {
      dispatchAuthority: state.dispatchAuthority,
      identity: state.identity,
      source: state.source,
    };
  },
  turnPolicy: 'queue',
  routes: [
    POST('/ovie/v1/summer-shadow/events', async (request, { from }) => {
      const handler = createSummerShadowIngressHandler({
        authenticate: incoming => routeAuth(incoming, ovieSummerShadowOidcAuth),
        persistImmutable: persistImmutableShadowRecord,
        async dispatch({ auth, event, conversationKey, message, receiptPath }) {
          const session = await from(conversationKey).send(message, {
            auth,
            state: {
              dispatchAuthority: 'none',
              eventId: event.eventId,
              identity: 'summer',
              receiptPath,
              source: 'ovie-summer-shadow',
            },
            title: `Summer shadow: ${event.eventId}`,
          });
          return { sessionId: session.id };
        },
      });

      return handler(request);
    }),
    GET(
      '/ovie/v1/summer-shadow/sessions/:sessionId/stream',
      async (request, { attachSession, params, resolveSession }) => {
        const auth = await routeAuth(request, ovieSummerShadowOidcAuth);
        if (auth instanceof Response) return auth;

        const requestUrl = new URL(request.url);
        const conversationId = requestUrl.searchParams.get('conversationId');
        const startIndexValue = requestUrl.searchParams.get('startIndex');
        const startIndex =
          startIndexValue === null ? 0 : Number(startIndexValue);
        if (
          !conversationId ||
          !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u.test(conversationId) ||
          !Number.isSafeInteger(startIndex) ||
          startIndex < 0
        ) {
          return Response.json(
            { ok: false, code: 'invalid_stream_request' },
            { status: 400 }
          );
        }

        const boundSession = await resolveSession(
          summerShadowKey(conversationId)
        );
        if (!boundSession || boundSession.id !== params.sessionId) {
          return Response.json(
            { ok: false, code: 'shadow_session_not_found' },
            { status: 404 }
          );
        }

        const stream = await attachSession(params.sessionId).getEventStream({
          startIndex,
        });
        return new Response(stream, {
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/x-ndjson',
          },
        });
      }
    ),
  ],
});
