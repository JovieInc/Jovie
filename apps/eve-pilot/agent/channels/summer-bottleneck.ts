import { defineChannel, POST } from 'eve/channels';
import type { AuthFn } from 'eve/channels/auth';
import {
  extractBearerToken,
  routeAuth,
  vercelSubject,
  verifyVercelOidc,
  withAuthChallenges,
} from 'eve/channels/auth';
import {
  ingestSummerBottleneckSnapshot,
  summerBottleneckSnapshotSchema,
} from '../lib/summer-bottleneck-loop';
import { createVercelBlobBottleneckDependencies } from '../lib/vercel-blob-bottleneck-runtime';
import { bindEvePilotIdentity } from '../select-identity';

const MAX_BODY_BYTES = 64 * 1024;
export const JOVIE_PRODUCTION_OIDC_SUBJECT = vercelSubject({
  teamSlug: 'jovie',
  projectName: 'jovie',
  environment: 'production',
});

type SummerBottleneckChannelState = {
  readonly dispatchAuthority: 'bounded-repair';
  readonly identity: 'summer';
  readonly source: 'ovie-summer-bottleneck';
};

export const ovieSummerBottleneckOidcAuth: AuthFn<Request> = withAuthChallenges(
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
        dispatchAuthority: 'bounded-repair',
        identity: 'summer',
        source: 'ovie-summer-bottleneck',
      },
      authenticator: 'vercel-oidc:ovie-summer-bottleneck',
    };
  },
  [{ scheme: 'Bearer' }]
);

export async function readBoundedSummerBottleneckJson(
  request: Request
): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error('body-too-large');
  }
  if (!request.body) throw new Error('body-missing');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('body-too-large');
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}

export default defineChannel<SummerBottleneckChannelState>({
  state: {
    dispatchAuthority: 'bounded-repair',
    identity: 'summer',
    source: 'ovie-summer-bottleneck',
  },
  metadata: state => state,
  routes: [
    POST('/ovie/v1/summer-bottleneck/events', async request => {
      const auth = await routeAuth(request, ovieSummerBottleneckOidcAuth);
      if (auth instanceof Response) return auth;
      bindEvePilotIdentity('summer').require('symphony-bounded-dispatch');
      let input: unknown;
      try {
        input = await readBoundedSummerBottleneckJson(request);
      } catch (error) {
        const oversized =
          error instanceof Error && error.message === 'body-too-large';
        return Response.json(
          { ok: false, code: oversized ? 'body_too_large' : 'invalid_json' },
          { status: oversized ? 413 : 400 }
        );
      }
      const parsed = summerBottleneckSnapshotSchema.safeParse(input);
      if (!parsed.success) {
        return Response.json(
          { ok: false, code: 'invalid_bottleneck_snapshot' },
          { status: 422 }
        );
      }
      let dependencies;
      try {
        dependencies = createVercelBlobBottleneckDependencies();
      } catch {
        return Response.json(
          { ok: false, code: 'bottleneck_runtime_unavailable' },
          { status: 503 }
        );
      }
      try {
        const receipt = await ingestSummerBottleneckSnapshot(
          parsed.data,
          dependencies
        );
        const duplicate = receipt.decision === 'duplicate-replay-rejected';
        return Response.json(
          { ok: !duplicate, receipt },
          { status: duplicate ? 409 : 202 }
        );
      } catch {
        return Response.json(
          { ok: false, code: 'bottleneck_processing_failed' },
          { status: 503 }
        );
      }
    }),
  ],
});
