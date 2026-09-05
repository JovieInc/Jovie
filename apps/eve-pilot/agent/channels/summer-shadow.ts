import { defineChannel, GET, POST } from 'eve/channels';
import type { AuthFn } from 'eve/channels/auth';
import {
  extractBearerToken,
  routeAuth,
  vercelSubject,
  verifyVercelOidc,
  withAuthChallenges,
} from 'eve/channels/auth';
import { createSummerCommercialReadback } from '../lib/summer-commercial-readback';
import {
  createSummerShadowIngressHandler,
  summerShadowKey,
} from '../lib/summer-shadow-ingress';
import {
  conversationPath,
  createConversationIngress,
  readConversationResult,
  verifyConversationAttestation,
  verifyFounderPrincipal,
} from '../lib/summer-web-conversation';
import {
  persistImmutableShadowRecord,
  readImmutableShadowRecord,
} from '../lib/vercel-blob-shadow-store';

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
    POST(
      '/ovie/v1/summer-shadow/conversation/events',
      async (request, { from, attachSession, resolveSession }) => {
        const auth = await routeAuth(request, ovieSummerShadowOidcAuth);
        if (auth instanceof Response) return auth;
        return createConversationIngress({
          authenticate: async () => auth,
          verifyAttestation: verifyConversationAttestation,
          read: readImmutableShadowRecord,
          persist: persistImmutableShadowRecord,
          async dispatch(input, message, previousSessionId) {
            const address = `conversation:${input.conversationId}`;
            const current = await resolveSession(address);
            if (previousSessionId) {
              if (!current || current.id !== previousSessionId)
                throw new Error('canonical_session_unavailable');
              await attachSession(previousSessionId).send(message, {
                auth,
                idempotencyKey: input.eventId,
                turnPolicy: 'queue',
              });
              return previousSessionId;
            }
            if (current) throw new Error('unbound_existing_session');
            const session = await from(address).send(message, {
              auth,
              idempotencyKey: input.eventId,
              state: {
                dispatchAuthority: 'none',
                eventId: input.eventId,
                identity: 'summer',
                receiptPath: conversationPath('intents', input.eventId),
                source: 'ovie-summer-shadow',
              },
              title: 'Summer Jovi — AI Agent',
            });
            return session.id;
          },
        })(request);
      }
    ),
    GET(
      '/ovie/v1/summer-shadow/conversation/events/:eventId/result',
      async (request, { params, attachSession, resolveSession }) => {
        const auth = await routeAuth(request, ovieSummerShadowOidcAuth);
        if (auth instanceof Response) return auth;
        const resultPath = `/ovie/v1/summer-shadow/conversation/events/${params.eventId}/result`;
        const principalHash = request.headers.get(
          'x-jovie-summer-principal-hash'
        );
        const deploymentId = request.headers.get(
          'x-jovie-summer-deployment-id'
        );
        if (
          !principalHash ||
          !deploymentId ||
          !verifyFounderPrincipal(principalHash) ||
          deploymentId !== process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
          !verifyConversationAttestation(
            request,
            `GET\0${resultPath}\0${principalHash}\0${deploymentId}`
          )
        )
          return Response.json(
            { ok: false, code: 'invalid_founder_attestation' },
            { status: 403, headers: { 'cache-control': 'no-store' } }
          );
        try {
          return await readConversationResult({
            eventId: params.eventId,
            store: {
              read: readImmutableShadowRecord,
              persist: persistImmutableShadowRecord,
            },
            stream: async (sessionId, startIndex) =>
              (
                await attachSession(sessionId).getEventStream({ startIndex })
              ).pipeThrough(
                new TransformStream({
                  transform(event, controller) {
                    controller.enqueue(
                      new TextEncoder().encode(JSON.stringify(event) + '\n')
                    );
                  },
                })
              ),
            recoverSession: async conversationId =>
              (await resolveSession(`conversation:${conversationId}`))?.id ??
              null,
          });
        } catch {
          return Response.json(
            { ok: false, code: 'terminal_unavailable' },
            { status: 503, headers: { 'cache-control': 'no-store' } }
          );
        }
      }
    ),
    GET(
      '/ovie/v1/summer-shadow/commercial/:eventId',
      async (request, { params }) =>
        createSummerCommercialReadback({
          authenticate: incoming =>
            routeAuth(incoming, ovieSummerShadowOidcAuth),
          read: readImmutableShadowRecord,
        })(request, params.eventId)
    ),
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
