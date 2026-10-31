import 'server-only';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  agentProfileCreateLimiter,
  agentWriteGlobalLimiter,
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';
import { agentArtistInputSchema, parseAgentArtistInput } from './artist-input';
import { resolveAgentArtist } from './artist-resolution';
import { mintDraftCapability, verifyDraftCapability } from './draft-capability';
import {
  agentAcquisitionSchema,
  createAgentDraftSchema,
  invalidInputError,
  prepareReleaseLaunchSchema,
} from './draft-contract';
import { createAgentDraft, readAgentDraft } from './draft-store';
import { prepareReleaseLaunch } from './release-launch';

const searchInput = agentArtistInputSchema.extend({
  acquisition: agentAcquisitionSchema,
});
export const AGENT_DRAFT_TOOLS = [
  {
    name: 'artist.search_or_import',
    title: 'Find artist',
    description:
      'Resolve a public Spotify/Apple artist identity or return ranked name candidates. Select an exact ID before drafting. Returns a private, seven-day draft_token; retain it for workspace.create_draft. Creates no account and does not publish.',
    inputSchema: z.toJSONSchema(searchInput),
    annotations: {
      title: 'Find artist',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'workspace.create_draft',
    title: 'Create artist draft',
    description:
      'Create or resume an unpublished visibility draft using the exact artist_id and draft_token from artist.search_or_import. Retrying the same token resumes the same draft; a token for another artist is rejected. Returns claim_url: show it to the user so they can sign in on Jovie and claim the draft; the artist is matched to its Spotify identity and stays private until the user publishes. Never share draft_token. Never claims ownership, publishes or purchases.',
    inputSchema: z.toJSONSchema(createAgentDraftSchema),
    annotations: {
      title: 'Create artist draft',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'release.prepare_launch',
    title: 'Prepare release launch',
    description:
      'Resolve public release facts and create or resume an unpublished artist, release-page, and smart-link draft. Requires the draft capability. Returns only unresolved questions plus claim_url; when next_action is send_user_claim_url, show claim_url to the user so they can claim it on Jovie, where it stays private until they publish. Never claims, publishes, or purchases.',
    inputSchema: z.toJSONSchema(prepareReleaseLaunchSchema),
    annotations: {
      title: 'Prepare release launch',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];
const callSchema = z
  .object({
    tool: z.enum([
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
    ]),
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

/**
 * Write-limit caller key. Threat model: marketplace clients (ChatGPT, Claude,
 * Grok...) call from shared egress IPs, so an IP-only key would throttle every
 * user behind that IP together. The key therefore combines the client IP, the
 * optional Mcp-Session-Id header, and, when the draft_token verifies (HMAC
 * signed, so unforgeable), its draft_id and acquisition installation_id.
 * Session ids are caller-chosen and can be rotated by an attacker to dodge the
 * per-caller budget, so the global ceiling (agentWriteGlobalLimiter) still
 * bounds total write volume. Unverifiable tokens add nothing to the key.
 */
export function agentWriteCallerKey(request: Request, args?: unknown): string {
  const token =
    args && typeof args === 'object'
      ? (args as { draft_token?: unknown }).draft_token
      : undefined;
  const capability =
    typeof token === 'string' ? verifyDraftCapability(token) : null;
  const session = request.headers.get('mcp-session-id')?.slice(0, 200) ?? '';
  const parts = [
    session,
    capability?.draft_id ?? '',
    capability?.acquisition.installation_id ?? '',
  ];
  const ip = getClientIP(request);
  if (parts.every(part => !part)) return ip;
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex');
  return `${ip}:${digest.slice(0, 32)}`;
}

export async function guardAgentRequest(
  request: Request,
  write = false,
  args?: unknown
) {
  if (!agentOriginAllowed(request))
    return agentJson({ error: 'Origin not allowed' }, 403);
  if (!(await getAppFlagValue('AGENT_PROFILE_CREATE')))
    return agentJson({ error: 'FEATURE_DISABLED' }, 503, {
      'Retry-After': '60',
    });
  const limiter = write ? agentProfileCreateLimiter : publicArtistApiLimiter;
  const key = write ? agentWriteCallerKey(request, args) : getClientIP(request);
  const limit = await limiter.limit(key);
  const global =
    limit.success && write
      ? await agentWriteGlobalLimiter.limit('global')
      : limit;
  if (!global.success)
    return agentJson(
      {
        error: global.unavailable ? 'TEMPORARILY_UNAVAILABLE' : 'RATE_LIMITED',
      },
      global.unavailable ? 503 : 429,
      createRateLimitHeaders(global)
    );
  return null;
}

export async function executeAgentDraftTool(tool: string, args: unknown) {
  if (tool === 'workspace.create_draft') return createAgentDraft(args);
  if (tool === 'release.prepare_launch') return prepareReleaseLaunch(args);
  const parsed = searchInput.safeParse(args);
  if (tool !== 'artist.search_or_import')
    return {
      status: 'error' as const,
      code: 'INVALID_INPUT',
      retryable: false,
    };
  if (!parsed.success) return invalidInputError(parsed.error);
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
    if (!call.success) return agentJson(invalidInputError(call.error), 400);
    const result = await executeAgentDraftTool(
      call.data.tool,
      call.data.arguments
    );
    return agentJson(
      result,
      result.status !== 'error'
        ? 200
        : result.code === 'DRAFT_UNAVAILABLE' ||
            result.code === 'ARTIST_NOT_FOUND' ||
            result.code === 'RELEASE_NOT_FOUND'
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
