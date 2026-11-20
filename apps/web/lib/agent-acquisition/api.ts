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
import {
  answerQuestionSchema,
  claimHandleSchema,
  draftRefSchema,
  GOLDEN_PATH_TOOL_NAMES,
  type GoldenPathToolName,
  publishProfileSchema,
  shareProfileSchema,
} from './golden-path';
import {
  answerOnboardingQuestion,
  buildProfile,
  claimHandle,
  getQualification,
  publishProfile,
  shareProfile,
  startUpgrade,
} from './golden-path.server';
import { prepareReleaseLaunch } from './release-launch';

const searchInput = agentArtistInputSchema.extend({
  acquisition: agentAcquisitionSchema,
});

/** Golden-path step tools; capability-scoped like every other write tool. */
const GOLDEN_PATH_DRAFT_TOOLS = [
  {
    name: 'claim_handle' as const,
    title: 'Claim a handle',
    description:
      'Check and reserve the draft artist\u2019s jov.ie handle (the profile URL). Returns availability with numbered suggested alternatives when taken. High-reach artists are routed to the existing verification path. The reservation completes when the artist signs in through claim_url; nothing is public until they publish.',
    inputSchema: z.toJSONSchema(claimHandleSchema),
    annotations: {
      title: 'Claim a handle',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'answer_onboarding_question' as const,
    title: 'Record a Mom Test answer',
    description:
      "Record one onboarding Mom Test answer on the draft: lastGrowthAttempt (the artist's most recent growth attempt and how it went) or promoSpend (what they pay each month to promote their music, one of none, under_50, 50_plus). The exact question wording ships in the Jovie skill. Ask in your own voice; never lead or ask willingness-to-pay.",
    inputSchema: z.toJSONSchema(answerQuestionSchema),
    annotations: {
      title: 'Record a Mom Test answer',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'get_qualification' as const,
    title: 'Get qualification',
    description:
      'Run the shared onboarding qualification for the draft artist. Returns qualified or queued with a reason; queued carries the locked line "Your handle is reserved. You\'re on the waitlist."',
    inputSchema: z.toJSONSchema(draftRefSchema),
    annotations: {
      title: 'Get qualification',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'build_profile' as const,
    title: 'Build profile preview',
    description:
      "Build the draft profile from the artist's public data, including the real catalog preview when available. Read-only preview for the artist; nothing is published.",
    inputSchema: z.toJSONSchema(draftRefSchema),
    annotations: {
      title: 'Build profile preview',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'publish_profile' as const,
    title: 'Publish profile',
    description:
      'Publish step. Agents never publish: show claim_url so the artist signs in on Jovie and publishes from their dashboard. Returns claim_required until the draft is claimed.',
    inputSchema: z.toJSONSchema(publishProfileSchema),
    annotations: {
      title: 'Publish profile',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'share_profile' as const,
    title: 'Share a profile',
    description:
      'Return the public jov.ie profile URL plus a factual share line for an already-public profile. Never shares a private or unpublished profile.',
    inputSchema: z.toJSONSchema(shareProfileSchema),
    annotations: {
      title: 'Share a profile',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'start_upgrade' as const,
    title: 'Start upgrade',
    description:
      'Return the existing Jovie checkout entry for the draft artist (claim/start). Plans and prices are shown on Jovie from offer truth; never state a price yourself.',
    inputSchema: z.toJSONSchema(draftRefSchema),
    annotations: {
      title: 'Start upgrade',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
];

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
  ...GOLDEN_PATH_DRAFT_TOOLS,
];
const callSchema = z
  .object({
    tool: z.enum([
      'artist.search_or_import',
      'workspace.create_draft',
      'release.prepare_launch',
      ...GOLDEN_PATH_TOOL_NAMES,
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
  if (GOLDEN_PATH_TOOL_NAMES.includes(tool as GoldenPathToolName)) {
    switch (tool as GoldenPathToolName) {
      case 'claim_handle':
        return claimHandle(args);
      case 'answer_onboarding_question':
        return answerOnboardingQuestion(args);
      case 'get_qualification':
        return getQualification(args);
      case 'build_profile':
        return buildProfile(args);
      case 'publish_profile':
        return publishProfile(args);
      case 'share_profile':
        return shareProfile(args);
      case 'start_upgrade':
        return startUpgrade(args);
    }
  }
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
