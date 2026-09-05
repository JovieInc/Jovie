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
  ingestSummerBottleneckSnapshot,
  type SummerBottleneckDependencies,
  summerBottleneckSnapshotSchema,
} from '../lib/summer-bottleneck-loop';
import {
  claimNextSymphonyTask,
  createSymphonyConsumerApiRuntime,
  persistSymphonyTerminal,
  type SymphonyConsumerApiRuntime,
  verifySymphonyConsumerRequest,
} from '../lib/symphony-consumer-api';
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

async function readBoundedSummerBottleneckText(
  request: Request
): Promise<string> {
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
  return body + decoder.decode();
}

export async function readBoundedSummerBottleneckJson(
  request: Request
): Promise<unknown> {
  return JSON.parse(await readBoundedSummerBottleneckText(request));
}

type SummerBottleneckHandlerDependencies = {
  readonly authenticate: (request: Request) => Promise<unknown>;
  readonly createRuntime: () => SummerBottleneckDependencies;
  readonly requireDispatchAuthority: () => void;
};

export async function handleSummerBottleneckRequest(
  request: Request,
  dependencies: SummerBottleneckHandlerDependencies = {
    authenticate: incoming => routeAuth(incoming, ovieSummerBottleneckOidcAuth),
    createRuntime: createVercelBlobBottleneckDependencies,
    requireDispatchAuthority: () =>
      bindEvePilotIdentity('summer').require('symphony-bounded-dispatch'),
  }
): Promise<Response> {
  const auth = await dependencies.authenticate(request);
  if (auth instanceof Response) return auth;
  dependencies.requireDispatchAuthority();
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
  let runtime: SummerBottleneckDependencies;
  try {
    runtime = dependencies.createRuntime();
  } catch {
    return Response.json(
      { ok: false, code: 'bottleneck_runtime_unavailable' },
      { status: 503 }
    );
  }
  try {
    const receipt = await ingestSummerBottleneckSnapshot(parsed.data, runtime);
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
}

type SymphonyConsumerHandlerDependencies = {
  readonly createRuntime: () => SymphonyConsumerApiRuntime;
};

function symphonyRuntimeResponse(): Response {
  return Response.json(
    { ok: false, code: 'symphony_consumer_runtime_unavailable' },
    { status: 503 }
  );
}

export async function handleSymphonyClaimRequest(
  request: Request,
  dependencies: SymphonyConsumerHandlerDependencies = {
    createRuntime: createSymphonyConsumerApiRuntime,
  }
): Promise<Response> {
  let runtime: SymphonyConsumerApiRuntime;
  try {
    runtime = dependencies.createRuntime();
  } catch {
    return symphonyRuntimeResponse();
  }
  const claimantKeyId = verifySymphonyConsumerRequest(request, '', runtime);
  if (!claimantKeyId) {
    return Response.json(
      { ok: false, code: 'unauthenticated_symphony_consumer' },
      { status: 401 }
    );
  }
  try {
    const outbox = await claimNextSymphonyTask(runtime, claimantKeyId);
    return outbox
      ? Response.json({ ok: true, outbox }, { status: 200 })
      : new Response(null, { status: 204 });
  } catch {
    return Response.json(
      { ok: false, code: 'symphony_claim_failed' },
      { status: 503 }
    );
  }
}

export async function handleSymphonyTerminalRequest(
  request: Request,
  dependencies: SymphonyConsumerHandlerDependencies = {
    createRuntime: createSymphonyConsumerApiRuntime,
  }
): Promise<Response> {
  let body: string;
  try {
    body = await readBoundedSummerBottleneckText(request);
  } catch (error) {
    const oversized =
      error instanceof Error && error.message === 'body-too-large';
    return Response.json(
      { ok: false, code: oversized ? 'body_too_large' : 'body_missing' },
      { status: oversized ? 413 : 400 }
    );
  }
  let runtime: SymphonyConsumerApiRuntime;
  try {
    runtime = dependencies.createRuntime();
  } catch {
    return symphonyRuntimeResponse();
  }
  const claimantKeyId = verifySymphonyConsumerRequest(request, body, runtime);
  if (!claimantKeyId) {
    return Response.json(
      { ok: false, code: 'unauthenticated_symphony_consumer' },
      { status: 401 }
    );
  }
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return Response.json({ ok: false, code: 'invalid_json' }, { status: 400 });
  }
  try {
    const result = await persistSymphonyTerminal(runtime, claimantKeyId, input);
    return Response.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    const conflict =
      error instanceof Error &&
      error.message === 'conflicting Symphony terminal';
    return Response.json(
      {
        ok: false,
        code: conflict ? 'symphony_terminal_conflict' : 'invalid_terminal',
      },
      { status: conflict ? 409 : 422 }
    );
  }
}

export default defineChannel<SummerBottleneckChannelState>({
  state: {
    dispatchAuthority: 'bounded-repair',
    identity: 'summer',
    source: 'ovie-summer-bottleneck',
  },
  metadata: state => state,
  routes: [
    GET('/ovie/v1/summer-bottleneck/symphony/claim', request =>
      handleSymphonyClaimRequest(request)
    ),
    POST('/ovie/v1/summer-bottleneck/symphony/terminal', request =>
      handleSymphonyTerminalRequest(request)
    ),
    POST('/ovie/v1/summer-bottleneck/events', async request => {
      return handleSummerBottleneckRequest(request);
    }),
  ],
});
