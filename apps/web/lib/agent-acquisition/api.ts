import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  agentProfileCreateLimiter,
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';
import { agentArtistInputSchema, parseAgentArtistInput } from './artist-input';
import { resolveAgentArtist } from './artist-resolution';
import { mintDraftCapability } from './draft-capability';
import {
  agentAcquisitionSchema,
  createAgentDraftSchema,
} from './draft-contract';
import { createAgentDraft, readAgentDraft } from './draft-store';

const searchInput = agentArtistInputSchema.extend({
  acquisition: agentAcquisitionSchema,
});
export const AGENT_DRAFT_TOOLS = [
  {
    name: 'artist.search_or_import',
    description:
      'Resolve a public Spotify/Apple artist identity or return ranked name candidates. Select an exact ID before drafting. Returns a private, seven-day draft_token; retain it for workspace.create_draft. Creates no account and does not publish.',
    inputSchema: z.toJSONSchema(searchInput),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'workspace.create_draft',
    description:
      'Create or resume an unpublished visibility draft using the exact artist_id and draft_token from artist.search_or_import. Retrying the same token resumes the same draft; a token for another artist is rejected. Never claims ownership, publishes or purchases.',
    inputSchema: z.toJSONSchema(createAgentDraftSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];
const callSchema = z
  .object({
    tool: z.enum(['artist.search_or_import', 'workspace.create_draft']),
    arguments: z.unknown(),
  })
  .strict();

export function agentJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

export function agentOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(BASE_URL).origin;
}

export async function guardAgentRequest(request: Request, write = false) {
  if (!agentOriginAllowed(request))
    return agentJson({ error: 'Origin not allowed' }, 403);
  if (!(await getAppFlagValue('AGENT_PROFILE_CREATE')))
    return agentJson({ error: 'FEATURE_DISABLED' }, 503, {
      'Retry-After': '60',
    });
  const limiter = write ? agentProfileCreateLimiter : publicArtistApiLimiter;
  const limit = await limiter.limit(getClientIP(request));
  if (!limit.success)
    return agentJson(
      { error: limit.unavailable ? 'TEMPORARILY_UNAVAILABLE' : 'RATE_LIMITED' },
      limit.unavailable ? 503 : 429,
      createRateLimitHeaders(limit)
    );
  return null;
}

export async function executeAgentDraftTool(tool: string, args: unknown) {
  if (tool === 'workspace.create_draft') return createAgentDraft(args);
  const parsed = searchInput.safeParse(args);
  if (tool !== 'artist.search_or_import' || !parsed.success)
    return {
      status: 'error' as const,
      code: 'INVALID_INPUT',
      retryable: false,
    };
  const { acquisition, ...artistInput } = parsed.data;
  const result = await resolveAgentArtist(artistInput);
  if (result.status !== 'resolved') return { ...result, acquisition };
  const source = parseAgentArtistInput({ input: result.artist.source_url });
  const { capability, token } = mintDraftCapability(
    result.artist.artist_id,
    acquisition,
    Date.now(),
    source.kind === 'exact' ? source.storefront : undefined
  );
  return {
    ...result,
    draft_id: capability.draft_id,
    draft_token: token,
    expires_at: new Date(capability.expires_at).toISOString(),
    acquisition: capability.acquisition,
  };
}

export async function readAgentJson(request: Request) {
  return parseJsonBody(request, {
    route: 'agent-drafts',
    logContext: { requestUrl: new URL(request.url).pathname },
    headers: NO_STORE_HEADERS,
    maxBodySize: 16384,
    redactParseErrors: true,
  });
}

export async function reportAgentFailure() {
  // Neither raw provider/SQL errors nor bearer capabilities belong in telemetry.
  await captureError(
    'Agent draft request failed',
    new Error('Agent draft service failure')
  );
  return agentJson(
    { status: 'error', code: 'INTERNAL_FAILURE', retryable: true },
    503
  );
}

export async function handleAgentDraftPost(request: Request) {
  try {
    const blocked = await guardAgentRequest(request, true);
    if (blocked) return blocked;
    const body = await readAgentJson(request);
    if (!body.ok) return body.response;
    const call = callSchema.safeParse(body.data);
    if (!call.success)
      return agentJson(
        { status: 'error', code: 'INVALID_INPUT', retryable: false },
        400
      );
    const result = await executeAgentDraftTool(
      call.data.tool,
      call.data.arguments
    );
    return agentJson(
      result,
      result.status !== 'error'
        ? 200
        : result.code === 'DRAFT_UNAVAILABLE' ||
            result.code === 'ARTIST_NOT_FOUND'
          ? 404
          : result.retryable
            ? 503
            : 400
    );
  } catch {
    return reportAgentFailure();
  }
}

export async function handleAgentDraftGet(request: Request, draftId: string) {
  try {
    const blocked = await guardAgentRequest(request);
    if (blocked) return blocked;
    const token =
      /^Bearer ([A-Za-z0-9_.-]+)$/.exec(
        request.headers.get('authorization') ?? ''
      )?.[1] ?? '';
    const result = await readAgentDraft(draftId, token);
    return agentJson(result, result.status === 'error' ? 404 : 200);
  } catch {
    return reportAgentFailure();
  }
}
