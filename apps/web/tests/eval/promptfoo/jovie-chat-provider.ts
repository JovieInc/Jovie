import { type ToolSet, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { executeChatTurn, selectKnowledgeContextForTurn } from '@/lib/chat/run';
import {
  FREE_TIER_TOOLS,
  ONBOARDING_TOOLS,
  TOOL_SCHEMAS,
} from '@/lib/chat/tool-schemas';
import { TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';
import type { ReleaseContext } from '@/lib/chat/types';
import { getEntitlements, type PlanId } from '@/lib/entitlements/registry';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';

type EvalVars = Record<string, unknown>;
type EvalTarget =
  | 'chat-turn'
  | 'mobile-chat-route'
  | 'tool-contract'
  | 'tool-inventory'
  | 'web-chat-route';

type ToolExecution = {
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
};

type ProviderOptions = {
  readonly id?: string;
  readonly config?: Record<string, unknown>;
};

type CallApiContext = {
  readonly vars?: EvalVars;
};

type CallApiOptions = {
  readonly abortSignal?: AbortSignal;
};

type ProviderResponse = {
  readonly output?: string;
  readonly raw?: unknown;
  readonly format?: string;
  readonly latencyMs?: number;
  readonly tokenUsage?: {
    readonly prompt?: number;
    readonly completion?: number;
    readonly total?: number;
  };
  readonly error?: string;
};

const EVAL_PROFILE_ID = '00000000-0000-4000-8000-000000002561';
const EVAL_CONVERSATION_ID = 'promptfoo-eval-conversation';
const EVAL_USER_ID = 'promptfoo-eval-user';
const WEB_CHAT_ROUTE_PATH = '/api/chat';
const WEB_CHAT_REQUEST_ID = 'promptfoo-web-chat-route';
const WEB_CHAT_EVAL_EPOCH_SECONDS = 1_700_000_000;
const MOBILE_CHAT_ROUTE_PATH = '/api/mobile/v1/chat/turns';
const MAX_WEB_MESSAGES_PER_REQUEST = 50;
const MAX_WEB_MESSAGE_LENGTH = 4000;
const MAX_MOBILE_TEXT_LENGTH = 4000;
const MOBILE_CHAT_RUNTIME_DISABLED_EVENT = {
  type: 'error',
  errorCode: 'MOBILE_CHAT_RUNTIME_DISABLED',
  message: 'Native chat is not enabled for this build.',
} as const;
const MOBILE_CHAT_NDJSON_HEADERS = {
  ...NO_STORE_HEADERS,
  'Content-Type': 'application/x-ndjson; charset=utf-8',
} as const;

const ADVANCED_TOOL_SCHEMAS = {
  showTopInsights: {
    description:
      'Show the artist their top audience, release, track, and monetization signals as structured insight cards.',
    inputSchema: z.object({}),
  },
  proposeProfileEdit: {
    description:
      'Propose editing an editable artist profile field. Only displayName and bio are editable in chat.',
    inputSchema: z.object({
      field: z.enum(['displayName', 'bio']),
      newValue: z.string().min(1).max(500),
      sourceUrl: z.string().url().optional(),
      sourceTitle: z.string().max(200).optional(),
    }),
  },
  importBioFromUrl: {
    description:
      'Import an artist bio candidate from a website, link-in-bio page, or press-kit URL.',
    inputSchema: z.object({
      url: z.string().url(),
    }),
  },
  checkCanvasStatus: {
    description:
      "Check which of the artist's releases have Spotify Canvas videos set and which are missing them.",
    inputSchema: z.object({
      includeAll: z.boolean().optional(),
    }),
  },
  suggestRelatedArtists: {
    description:
      "Suggest related artists for playlist pitching, ad targeting, and collaboration based on the artist's context.",
    inputSchema: z.object({
      purpose: z.enum([
        'playlist_pitching',
        'ad_targeting',
        'collaboration',
        'all',
      ]),
      count: z.number().int().min(3).max(15).optional(),
    }),
  },
  writeWorldClassBio: {
    description:
      'Write a world-class artist bio in an editorial style suitable for Spotify, Apple Music, and press use.',
    inputSchema: z.object({
      goal: z
        .enum(['spotify', 'apple_music', 'press_kit', 'general'])
        .optional(),
      tone: z
        .enum(['cinematic', 'intimate', 'confident', 'elevated'])
        .optional(),
      maxWords: z.number().int().min(80).max(350).optional(),
    }),
  },
  generateCanvasPlan: {
    description:
      'Generate a detailed plan for creating a Spotify Canvas video from album artwork.',
    inputSchema: z.object({
      releaseTitle: z.string(),
      motionPreference: z
        .enum(['zoom', 'pan', 'particles', 'morph', 'ambient'])
        .optional(),
    }),
  },
  createPromoStrategy: {
    description:
      'Create a promotion strategy for a release, including social video, TikTok, Canvas, and ad targeting recommendations.',
    inputSchema: z.object({
      releaseTitle: z.string().optional(),
      budget: z.enum(['free', 'low', 'medium', 'high']).optional(),
      platforms: z
        .array(
          z.enum(['tiktok', 'instagram', 'youtube', 'spotify', 'hulu', 'meta'])
        )
        .optional(),
    }),
  },
  markCanvasUploaded: {
    description:
      'Mark a release as having a Spotify Canvas video uploaded after the artist confirms it is set in Spotify for Artists.',
    inputSchema: z.object({
      releaseTitle: z.string(),
    }),
  },
  createRelease: {
    description:
      "Create a new release in the artist's discography. Ask for title and release type before calling.",
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      releaseType: z.enum([
        'single',
        'ep',
        'album',
        'compilation',
        'live',
        'mixtape',
        'other',
      ]),
      releaseDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      label: z.string().max(200).optional(),
      upc: z.string().max(20).optional(),
    }),
  },
  formatLyrics: {
    description:
      'Format lyrics to Apple Music guidelines. Use when an artist asks to clean up or format lyrics.',
    inputSchema: z.object({
      lyrics: z.string().min(1).max(10000),
    }),
  },
  generateReleasePitch: {
    description:
      'Generate playlist pitches for a release. Ask which release to pitch if unclear.',
    inputSchema: z.object({
      releaseTitle: z.string().max(200),
      instructions: z.string().max(500).optional(),
    }),
  },
} as const;

const ALL_EVAL_TOOL_SCHEMAS = {
  ...TOOL_SCHEMAS,
  ...ADVANCED_TOOL_SCHEMAS,
};

const ACCOUNT_TOOL_NAMES = [
  'showAccountStatus',
  'showUsage',
  'openBillingPortal',
] as const;

const MERCH_TOOL_NAMES = [
  'createMerch',
  'previewMerchOptions',
  'selectMerchDesign',
  'publishMerchCard',
  'pauseMerchCard',
  'unpauseMerchCard',
  'deleteOrArchiveMerchCard',
  'reorderMerchCards',
  'optimizeMerchCards',
  'showMerchSales',
  'showArtistPayouts',
] as const;

const INSIGHT_TOOL_NAMES = ['showTopInsights'] as const;
const ALBUM_ART_TOOL_NAMES = ['generateAlbumArt'] as const;
const PROFILE_RELEASE_TOOL_NAMES = [
  'createRelease',
  'generateReleasePitch',
] as const;
const ALWAYS_PAID_TOOL_NAMES = [
  'proposeProfileEdit',
  'importBioFromUrl',
  'checkCanvasStatus',
  'suggestRelatedArtists',
  'writeWorldClassBio',
  'generateCanvasPlan',
  'createPromoStrategy',
  'markCanvasUploaded',
  'formatLyrics',
] as const;

const PAID_TOOL_NAMES = [
  ...FREE_TIER_TOOLS,
  ...ACCOUNT_TOOL_NAMES,
  ...INSIGHT_TOOL_NAMES,
  ...ALWAYS_PAID_TOOL_NAMES,
  ...ALBUM_ART_TOOL_NAMES,
  ...PROFILE_RELEASE_TOOL_NAMES,
  ...MERCH_TOOL_NAMES,
] as const;

const FREE_APP_TOOL_NAMES = [
  ...FREE_TIER_TOOLS,
  ...ACCOUNT_TOOL_NAMES,
] as const;

const ALL_EVAL_TOOL_NAMES = Object.keys(ALL_EVAL_TOOL_SCHEMAS).sort();
const TOOL_UI_REGISTRY_NAMES = Object.keys(TOOL_UI_REGISTRY).sort();

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toPlanId(value: unknown): PlanId {
  if (value === undefined) {
    return 'pro';
  }

  if (
    value === 'free' ||
    value === 'trial' ||
    value === 'pro' ||
    value === 'max'
  ) {
    return value;
  }

  throw new RangeError(`Invalid eval vars.plan: ${String(value)}`);
}

function toMode(value: unknown): 'app' | 'onboarding' {
  return value === 'onboarding' ? 'onboarding' : 'app';
}

function toTarget(value: unknown): EvalTarget {
  if (
    value === 'mobile-chat-route' ||
    value === 'tool-contract' ||
    value === 'tool-inventory' ||
    value === 'web-chat-route'
  ) {
    return value;
  }

  return 'chat-turn';
}

function toToolName(value: unknown): string {
  if (
    typeof value === 'string' &&
    Object.hasOwn(ALL_EVAL_TOOL_SCHEMAS, value)
  ) {
    return value;
  }

  throw new RangeError(`Invalid eval vars.toolName: ${String(value)}`);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isValidMobileSource(source: unknown): source is 'typed' {
  return source === 'typed';
}

function isValidOptionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function parseMobileChatTurnRequest(value: Record<string, unknown>): {
  readonly conversationId?: string;
  readonly clientTurnId: string;
  readonly clientMessageId: string;
  readonly text: string;
  readonly source: 'typed';
} | null {
  if (
    !isValidOptionalString(value.conversationId) ||
    typeof value.clientTurnId !== 'string' ||
    value.clientTurnId.length === 0 ||
    typeof value.clientMessageId !== 'string' ||
    value.clientMessageId.length === 0 ||
    typeof value.text !== 'string' ||
    value.text.trim().length === 0 ||
    value.text.length > MAX_MOBILE_TEXT_LENGTH ||
    !isValidMobileSource(value.source)
  ) {
    return null;
  }

  return {
    conversationId: value.conversationId,
    clientTurnId: value.clientTurnId,
    clientMessageId: value.clientMessageId,
    text: value.text.trim(),
    source: value.source,
  };
}

function ndjsonEvent(event: Record<string, unknown>): string {
  return `${JSON.stringify(event)}\n`;
}

function buildDefaultWebChatBody(
  prompt: string,
  body: Record<string, unknown>
): Record<string, unknown> {
  return {
    profileId: EVAL_PROFILE_ID,
    messages: [
      {
        id: 'eval-web-route-message-1',
        role: 'user',
        parts: [{ type: 'text', text: prompt }],
      },
    ],
    ...body,
  };
}

function extractWebMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';

  return parts
    .filter(
      (part): part is { type: string; text?: string } =>
        part &&
        typeof part === 'object' &&
        'type' in part &&
        (part as { type?: unknown }).type === 'text'
    )
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function validateWebChatMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_WEB_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_WEB_MESSAGES_PER_REQUEST}`;
  }

  for (const message of messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      !('role' in message) ||
      !('parts' in message)
    ) {
      return 'Invalid message format';
    }

    const msg = message as Record<string, unknown>;
    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return 'Invalid message role';
    }
    if (!Array.isArray(msg.parts)) {
      return 'Invalid message format';
    }
    if (
      msg.role === 'user' &&
      extractWebMessageText(msg.parts).length > MAX_WEB_MESSAGE_LENGTH
    ) {
      return `Message too long. Maximum is ${MAX_WEB_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildRateLimitHeaders(
  retryAfterSeconds: number,
  nowEpochSeconds = WEB_CHAT_EVAL_EPOCH_SECONDS
) {
  const reset = nowEpochSeconds + retryAfterSeconds;
  return {
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': String(reset),
    'Retry-After': String(retryAfterSeconds),
  };
}

function evaluateWebChatRouteContract(prompt: string, vars: EvalVars) {
  const body = buildDefaultWebChatBody(prompt, toObject(vars.body));
  if (
    typeof vars.messageCount === 'number' &&
    Number.isInteger(vars.messageCount)
  ) {
    body.messages = Array.from({ length: vars.messageCount }, (_, index) => ({
      id: `eval-web-route-message-${index + 1}`,
      role: 'user',
      parts: [{ type: 'text', text: `message ${index + 1}` }],
    }));
  }
  if (
    typeof vars.longUserMessageLength === 'number' &&
    Number.isInteger(vars.longUserMessageLength)
  ) {
    body.messages = [
      {
        id: 'eval-web-route-long-message',
        role: 'user',
        parts: [{ type: 'text', text: 'x'.repeat(vars.longUserMessageLength) }],
      },
    ];
  }
  const authenticated = toBoolean(vars.authenticated, false);
  const requestId =
    typeof vars.requestId === 'string' && vars.requestId.trim().length > 0
      ? vars.requestId.trim().slice(0, 120)
      : WEB_CHAT_REQUEST_ID;
  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
  const responseHeaders = { ...corsHeaders, 'x-request-id': requestId };
  const basePayload = {
    target: 'web-chat-route',
    adapter: 'route-contract',
    productionPath: WEB_CHAT_ROUTE_PATH,
    productionHandler: 'apps/web/app/api/chat/route.ts',
    routeImportAvailable: false,
    routeImportGap:
      'Promptfoo runs outside the Next/Clerk/DB server context, so this eval mirrors checked-in /api/chat pre-model route contracts instead of importing POST directly.',
    request: {
      authenticated,
      body,
      billingVerification:
        typeof vars.billingVerification === 'string'
          ? vars.billingVerification
          : 'verified',
      chatDisabled: toBoolean(vars.chatDisabled, false),
      invalidJson: toBoolean(vars.invalidJson, false),
      rateLimited: toBoolean(vars.rateLimited, false),
      expectedError:
        typeof vars.expectedError === 'string' ? vars.expectedError : undefined,
    },
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
    persistenceAttempted: false,
    requestId,
  };

  if (!authenticated) {
    return {
      ...basePayload,
      status: 401,
      headers: responseHeaders,
      responseJson: { error: 'Unauthorized', requestId },
      responseText: JSON.stringify({ error: 'Unauthorized', requestId }),
    };
  }

  if (toBoolean(vars.chatDisabled, false)) {
    const responseJson = {
      error: 'Chat is temporarily unavailable',
      message:
        'Jovie chat is paused while we address an upstream issue. Please try again in a few minutes.',
      errorCode: 'CHAT_DISABLED',
      requestId,
    };

    return {
      ...basePayload,
      status: 503,
      headers: responseHeaders,
      responseJson,
      responseText: JSON.stringify(responseJson),
    };
  }

  if (toBoolean(vars.invalidJson, false)) {
    return {
      ...basePayload,
      status: 400,
      headers: responseHeaders,
      responseJson: { error: 'Invalid JSON body', requestId },
      responseText: JSON.stringify({ error: 'Invalid JSON body', requestId }),
    };
  }

  const profileId = toNullableString(body.profileId);
  if (
    !profileId &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return {
      ...basePayload,
      status: 400,
      headers: responseHeaders,
      responseJson: { error: 'Missing profileId or artistContext', requestId },
      responseText: JSON.stringify({
        error: 'Missing profileId or artistContext',
        requestId,
      }),
    };
  }

  const messagesError = validateWebChatMessages(body.messages);
  if (messagesError) {
    return {
      ...basePayload,
      status: 400,
      headers: responseHeaders,
      responseJson: { error: messagesError, requestId },
      responseText: JSON.stringify({ error: messagesError, requestId }),
    };
  }

  if (toNullableString(body.clientTurnId) && !profileId) {
    const responseJson = {
      error: 'profileId is required when clientTurnId is provided',
      requestId,
    };

    return {
      ...basePayload,
      status: 400,
      headers: responseHeaders,
      responseJson,
      responseText: JSON.stringify(responseJson),
    };
  }

  if (toBoolean(vars.rateLimited, false)) {
    const billingUnavailable = vars.billingVerification === 'unavailable';
    const retryAfter = 60;
    const responseJson = {
      error: 'Rate limit exceeded',
      message: billingUnavailable
        ? 'Jovie could not verify your billing status right now, so chat usage is temporarily limited. Please retry in a few minutes or open billing settings.'
        : 'You have reached your chat limit. Please try again later.',
      errorCode: 'RATE_LIMITED',
      retryAfter,
      requestId,
    };

    return {
      ...basePayload,
      status: 429,
      headers: {
        ...responseHeaders,
        ...buildRateLimitHeaders(retryAfter),
      },
      responseJson,
      responseText: JSON.stringify(responseJson),
    };
  }

  return {
    ...basePayload,
    status: 200,
    headers: responseHeaders,
    contractOnly: true,
    responseJson: {
      message:
        'This deterministic eval stops before model dispatch; use target=chat-turn for executeChatTurn behavior.',
      requestId,
    },
    responseText: JSON.stringify({
      message:
        'This deterministic eval stops before model dispatch; use target=chat-turn for executeChatTurn behavior.',
      requestId,
    }),
  };
}

function evaluateMobileChatRouteContract(prompt: string, vars: EvalVars) {
  const body = toObject(vars.body);
  const requestBody =
    typeof body.text === 'string' ? body : { ...body, text: prompt };
  if (
    typeof vars.longMobileTextLength === 'number' &&
    Number.isInteger(vars.longMobileTextLength)
  ) {
    requestBody.text = 'x'.repeat(vars.longMobileTextLength);
  }
  const authenticated = toBoolean(vars.authenticated, false);
  const basePayload = {
    target: 'mobile-chat-route',
    adapter: 'route-contract',
    productionPath: MOBILE_CHAT_ROUTE_PATH,
    productionHandler: 'apps/web/app/api/mobile/v1/chat/turns/route.ts',
    routeImportAvailable: false,
    routeImportGap:
      'Promptfoo runs outside the Next/Clerk server context, so this eval mirrors the checked-in route contract instead of importing POST directly.',
    request: {
      authenticated,
      body: requestBody,
      invalidJson: toBoolean(vars.invalidJson, false),
    },
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
    persistenceAttempted: false,
  };

  if (!authenticated) {
    return {
      ...basePayload,
      status: 401,
      headers: NO_STORE_HEADERS,
      responseJson: { error: 'Unauthorized' },
      responseText: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const parsed = parseMobileChatTurnRequest(requestBody);
  if (toBoolean(vars.invalidJson, false) || !parsed) {
    return {
      ...basePayload,
      status: 400,
      headers: NO_STORE_HEADERS,
      responseJson: { error: 'Invalid request body' },
      responseText: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  return {
    ...basePayload,
    parsedRequest: parsed,
    status: 501,
    headers: MOBILE_CHAT_NDJSON_HEADERS,
    events: [MOBILE_CHAT_RUNTIME_DISABLED_EVENT],
    responseText: ndjsonEvent(MOBILE_CHAT_RUNTIME_DISABLED_EVENT),
  };
}

function toUiMessages(prompt: string, vars: EvalVars): UIMessage[] {
  const rawMessages = Array.isArray(vars.messages) ? vars.messages : null;

  if (!rawMessages) {
    return [
      {
        id: 'eval-message-1',
        role: 'user',
        parts: [{ type: 'text', text: prompt }],
      } as UIMessage,
    ];
  }

  return rawMessages.map((raw, index) => {
    const message = toObject(raw);
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const text =
      typeof message.text === 'string'
        ? message.text
        : typeof message.content === 'string'
          ? message.content
          : '';

    return {
      id: typeof message.id === 'string' ? message.id : `eval-message-${index}`,
      role,
      parts: [{ type: 'text', text }],
    } as UIMessage;
  });
}

function buildEvalReleases(vars: EvalVars): ReleaseContext[] {
  const overrides = Array.isArray(vars.releaseOverrides)
    ? (vars.releaseOverrides as Parameters<typeof buildTestReleases>[0])
    : undefined;

  return buildTestReleases(overrides).map((release, index) => ({
    id: `00000000-0000-4000-8000-000000000${index + 1}00`,
    title: release.title,
    releaseType: release.releaseType,
    releaseDate: release.releaseDate,
    artworkUrl: `https://cdn.jov.ie/eval/${index + 1}.jpg`,
    spotifyPopularity: 35 + index,
    totalTracks: release.totalTracks,
    canvasStatus: index === 0 ? 'not_set' : 'uploaded',
    metadata: null,
  }));
}

function toBillingVerification(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : 'verified';
}

function resolveToolAvailabilityFlags(plan: PlanId, vars: EvalVars) {
  const planLimits = getEntitlements(plan);
  const billingVerification = toBillingVerification(vars.billingVerification);
  const planAllowsPaidTools = Boolean(planLimits.booleans.aiCanUseTools);
  const aiCanUseTools =
    planAllowsPaidTools && toBoolean(vars.aiCanUseTools, true);

  return {
    billingVerification,
    paidToolsEnabled:
      plan !== 'free' && billingVerification === 'verified' && aiCanUseTools,
    insightsEnabled: toBoolean(vars.insightsEnabled, true),
    albumArtEnabled: toBoolean(vars.albumArtEnabled, true),
    canGenerateAlbumArt: toBoolean(vars.canGenerateAlbumArt, true),
    resolvedProfileIdPresent: toBoolean(vars.resolvedProfileIdPresent, true),
    merchEnabled: toBoolean(vars.merchEnabled, true),
    canAccessMerchCreation: toBoolean(
      vars.canAccessMerchCreation,
      Boolean(planLimits.booleans.canAccessMerchCreation)
    ),
  };
}

function getToolNamesForTurn(
  mode: 'app' | 'onboarding',
  plan: PlanId,
  vars: EvalVars = {}
) {
  if (mode === 'onboarding') return ONBOARDING_TOOLS;

  const freeTools = [...FREE_APP_TOOL_NAMES];
  const flags = resolveToolAvailabilityFlags(plan, vars);
  if (!flags.paidToolsEnabled) return freeTools;

  const toolNames: string[] = [...freeTools, ...ALWAYS_PAID_TOOL_NAMES];

  if (flags.insightsEnabled) {
    toolNames.push(...INSIGHT_TOOL_NAMES);
  }
  if (flags.albumArtEnabled && flags.canGenerateAlbumArt) {
    toolNames.push(...ALBUM_ART_TOOL_NAMES);
  }
  if (flags.resolvedProfileIdPresent) {
    toolNames.push(...PROFILE_RELEASE_TOOL_NAMES);
  }
  if (flags.merchEnabled && flags.canAccessMerchCreation) {
    toolNames.push(...MERCH_TOOL_NAMES);
  }

  return toolNames;
}

function configuredToolResult(
  vars: EvalVars,
  toolName: string
): unknown | undefined {
  const toolResults = toObject(vars.toolResults);
  return Object.hasOwn(toolResults, toolName)
    ? toolResults[toolName]
    : undefined;
}

function defaultToolResult(toolName: string, input: unknown): unknown {
  const args = toObject(input);

  switch (toolName) {
    case 'proposeAvatarUpload':
      return { success: true, action: 'avatar_upload' };
    case 'proposeSocialLink': {
      const url = typeof args.url === 'string' ? args.url : '';
      return {
        success: true,
        action: 'propose_social_link',
        normalizedUrl: url,
        originalUrl: url,
        platform: url.includes('instagram')
          ? { id: 'instagram', name: 'Instagram' }
          : { id: 'website', name: 'Website' },
        suggestedTitle: url.includes('instagram') ? 'Instagram' : 'Website',
      };
    }
    case 'proposeSocialLinkRemoval': {
      const platform =
        typeof args.platform === 'string'
          ? args.platform.toLowerCase()
          : 'link';
      return {
        success: true,
        action: 'remove_link',
        platform,
        url: `https://${platform}.com/lunawaves`,
      };
    }
    case 'submitFeedback':
      return { success: true, message: 'Feedback recorded.' };
    case 'showAccountStatus':
      return {
        success: true,
        plan: 'pro',
        billingVerified: true,
        merchAccess: true,
        nextAction: 'Review usage or open billing settings.',
      };
    case 'showUsage':
      return {
        success: true,
        period: 'daily',
        limit: 50,
        used: 7,
        remaining: 43,
        resetsAt: '2026-05-25T07:00:00.000Z',
      };
    case 'openBillingPortal':
      return {
        success: true,
        portalUrl: 'https://billing.jov.ie/eval/session',
        fallbackUrl: APP_ROUTES.SETTINGS_BILLING,
      };
    case 'showTopInsights':
      return {
        success: true,
        title: 'Top signals',
        totalActive: 0,
        insights: [],
      };
    case 'proposeProfileEdit':
      return { success: true, action: 'profile_edit_preview', ...args };
    case 'importBioFromUrl':
      return {
        ok: true,
        candidateBio:
          'Luna Waves builds ambient electronic songs around field recordings and soft modular textures.',
        sourceUrl: args.url,
        sourceTitle: 'Luna Waves press kit',
      };
    case 'checkCanvasStatus':
      return {
        success: true,
        summary: { total: 3, withCanvas: 1, withoutCanvas: 2 },
        releases: [{ title: 'Tidal Drift', hasArtwork: true }],
      };
    case 'confirmSpotifyArtist':
      return {
        action: 'spotify_artist_confirmed',
        spotifyArtistId: args.spotifyArtistId,
        artist: {
          id: args.spotifyArtistId,
          name: 'Luna Waves',
          url: 'https://open.spotify.com/artist/spotify-luna-123',
          imageUrl: 'https://cdn.jov.ie/eval/luna-waves.jpg',
          followers: 12500,
          popularity: 45,
          genres: ['ambient', 'electronic', 'downtempo'],
        },
        summary: 'Luna Waves matched on Spotify.',
      };
    case 'checkHandle':
      return {
        action: 'check_handle',
        handle: typeof args.handle === 'string' ? args.handle : 'lunawaves',
        available: true,
        summary: 'Handle is available.',
      };
    case 'recordInterviewSignal':
      return {
        action: 'signal_recorded',
        signalCount: 1,
        summary: 'Signal noted.',
      };
    case 'proposeNextStep':
      return {
        action: 'propose_next_step',
        decision: { kind: 'needs_more_info', reason: 'Synthetic eval signal.' },
        summary: 'Next step: needs more info.',
      };
    case 'proposeCheckout':
      return {
        action: 'propose_checkout',
        plan: args.plan ?? null,
        handoffUrl:
          typeof args.plan === 'string'
            ? `/onboarding/checkout?plan=${encodeURIComponent(args.plan)}`
            : '/onboarding/checkout',
        summary: 'Checkout handoff ready.',
      };
    case 'generateAlbumArt':
      return {
        success: true,
        action: 'album_art_options_generated',
        releaseTitle: args.releaseTitle ?? null,
        options: [
          { id: 'album-art-option-1', title: 'Moonlit Signal' },
          { id: 'album-art-option-2', title: 'Neon Current' },
          { id: 'album-art-option-3', title: 'Chrome Tide' },
        ],
      };
    case 'createMerch':
    case 'previewMerchOptions':
      return {
        success: true,
        action: toolName,
        generationId: '00000000-0000-4000-8000-000000000b01',
        options: [
          { optionNumber: 1, itemType: args.itemType ?? 'tee' },
          { optionNumber: 2, itemType: args.itemType ?? 'hoodie' },
          { optionNumber: 3, itemType: args.itemType ?? 'poster' },
        ],
      };
    case 'selectMerchDesign':
      return {
        success: true,
        action: 'select_merch_design',
        generationId: args.generationId,
        optionNumber: args.optionNumber ?? null,
        optionId: args.optionId ?? null,
      };
    case 'publishMerchCard':
    case 'pauseMerchCard':
    case 'unpauseMerchCard':
    case 'deleteOrArchiveMerchCard':
      return {
        success: true,
        action: toolName,
        merchCardId: args.merchCardId,
      };
    case 'reorderMerchCards':
      return {
        success: true,
        action: 'reorder_merch_cards',
        merchCardIds: Array.isArray(args.merchCardIds) ? args.merchCardIds : [],
      };
    case 'optimizeMerchCards':
      return { success: true, action: 'optimize_merch_cards', optimized: 3 };
    case 'showMerchSales':
      return {
        success: true,
        grossRevenueCents: 12400,
        orders: 8,
        topItem: 'Luna Waves tee',
      };
    case 'showArtistPayouts':
      return {
        success: true,
        pendingLiabilityCents: 6200,
        automaticPayout: false,
      };
    default:
      return { success: true, action: toolName, input: args };
  }
}

function buildEvalTools(
  toolNames: readonly string[],
  vars: EvalVars,
  executions: ToolExecution[]
): ToolSet {
  const tools: ToolSet = {};

  for (const toolName of toolNames) {
    const schema =
      ALL_EVAL_TOOL_SCHEMAS[toolName as keyof typeof ALL_EVAL_TOOL_SCHEMAS];
    if (!schema) continue;

    const evalToolDefinition = {
      description: schema.description,
      inputSchema: schema.inputSchema,
      execute: async (input: unknown) => {
        const output =
          configuredToolResult(vars, toolName) ??
          defaultToolResult(toolName, input);
        executions.push({ name: toolName, input, output });
        return output;
      },
    };

    tools[toolName] = tool(
      evalToolDefinition as unknown as Parameters<typeof tool>[0]
    );
  }

  return tools;
}

function schemaErrorMessages(result: { error?: { issues?: unknown[] } }) {
  const issues = Array.isArray(result.error?.issues) ? result.error.issues : [];

  return issues.map(issue => {
    const record = toObject(issue);
    const path = Array.isArray(record.path)
      ? record.path.map(String).join('.')
      : '';
    const message =
      typeof record.message === 'string' ? record.message : 'Invalid input';
    return path.length > 0 ? `${path}: ${message}` : message;
  });
}

function semanticToolInputErrors(toolName: string, input: unknown): string[] {
  const args = toObject(input);

  if (toolName === 'proposeSocialLink') {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (url.length === 0) return ['url: Provide a full URL'];

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return ['url: Only http and https URLs are allowed'];
      }
    } catch {
      return ['url: Provide a valid full URL'];
    }
  }

  if (toolName === 'proposeSocialLinkRemoval') {
    const platform =
      typeof args.platform === 'string' ? args.platform.trim() : '';
    if (platform.length === 0) {
      return ['platform: Provide the platform name to remove'];
    }
  }

  return [];
}

function evaluateToolContract(vars: EvalVars) {
  const mode = toMode(vars.mode);
  const plan = toPlanId(vars.plan);
  const toolName = toToolName(vars.toolName);
  const schema =
    ALL_EVAL_TOOL_SCHEMAS[toolName as keyof typeof ALL_EVAL_TOOL_SCHEMAS];
  const input = Object.hasOwn(vars, 'toolInput') ? vars.toolInput : {};
  const schemaResult = schema.inputSchema.safeParse(input);
  const availabilityFlags = resolveToolAvailabilityFlags(plan, vars);
  const availableToolNames = [...getToolNamesForTurn(mode, plan, vars)];
  const available = (availableToolNames as readonly string[]).includes(
    toolName
  );
  const semanticErrors = schemaResult.success
    ? semanticToolInputErrors(toolName, schemaResult.data)
    : [];
  const semanticValid = semanticErrors.length === 0;
  const executionAllowed =
    available &&
    schemaResult.success &&
    semanticValid &&
    toBoolean(vars.executeTool, true);
  const output = executionAllowed
    ? (configuredToolResult(vars, toolName) ??
      defaultToolResult(toolName, schemaResult.data))
    : null;
  const toolExecutions = executionAllowed
    ? [{ name: toolName, input: schemaResult.data, output }]
    : [];

  return {
    target: 'tool-contract',
    adapter: 'tool-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    toolName,
    mode,
    plan,
    availabilityFlags,
    available,
    availableToolNames,
    schemaValid: schemaResult.success,
    schemaErrors: schemaResult.success ? [] : schemaErrorMessages(schemaResult),
    semanticValid,
    semanticErrors,
    input,
    parsedInput: schemaResult.success ? schemaResult.data : null,
    executionAttempted: executionAllowed,
    toolCalls: executionAllowed ? [{ toolName, input: schemaResult.data }] : [],
    toolResults: executionAllowed ? [{ toolName, output }] : [],
    toolExecutions,
  };
}

function evaluateToolInventory(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const coveredTools = Array.isArray(coverage.coveredTools)
    ? coverage.coveredTools.filter((toolName): toolName is string => {
        return typeof toolName === 'string';
      })
    : [];
  const coveredSet = new Set(coveredTools);
  const unknownCoveredTools = coveredTools
    .filter(toolName => !Object.hasOwn(ALL_EVAL_TOOL_SCHEMAS, toolName))
    .sort();
  const missingToolNames = ALL_EVAL_TOOL_NAMES.filter(
    toolName => !coveredSet.has(toolName)
  );
  const missingToolUiRegistryNames = ALL_EVAL_TOOL_NAMES.filter(
    toolName => !Object.hasOwn(TOOL_UI_REGISTRY, toolName)
  );
  const staleToolUiRegistryNames = TOOL_UI_REGISTRY_NAMES.filter(
    toolName => !Object.hasOwn(ALL_EVAL_TOOL_SCHEMAS, toolName)
  );

  return {
    target: 'tool-inventory',
    adapter: 'tool-inventory',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    requiredToolNames: ALL_EVAL_TOOL_NAMES,
    coveredToolNames: [...coveredSet].sort(),
    missingToolNames,
    unknownCoveredTools,
    toolUiRegistryNames: TOOL_UI_REGISTRY_NAMES,
    missingToolUiRegistryNames,
    staleToolUiRegistryNames,
    freeAppToolNames: [...FREE_APP_TOOL_NAMES],
    onboardingToolNames: [...ONBOARDING_TOOLS],
    paidToolNames: [...PAID_TOOL_NAMES],
  };
}

function toPromptfooUsage(usage: Record<string, unknown> | null | undefined) {
  if (!usage) return undefined;

  const prompt =
    typeof usage.inputTokens === 'number'
      ? usage.inputTokens
      : typeof usage.promptTokens === 'number'
        ? usage.promptTokens
        : undefined;
  const completion =
    typeof usage.outputTokens === 'number'
      ? usage.outputTokens
      : typeof usage.completionTokens === 'number'
        ? usage.completionTokens
        : undefined;
  const total =
    typeof usage.totalTokens === 'number'
      ? usage.totalTokens
      : typeof prompt === 'number' && typeof completion === 'number'
        ? prompt + completion
        : undefined;

  return { prompt, completion, total };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default class JovieChatPromptfooProvider {
  private readonly providerId: string;

  constructor(options: ProviderOptions = {}) {
    this.providerId = options.id ?? 'jovie-chat-execute-turn';
  }

  id() {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContext,
    options?: CallApiOptions
  ): Promise<ProviderResponse> {
    const startedAt = Date.now();
    const vars = context?.vars ?? {};
    const target = toTarget(vars.target);

    if (target === 'mobile-chat-route') {
      const payload = evaluateMobileChatRouteContract(prompt, vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'web-chat-route') {
      const payload = evaluateWebChatRouteContract(prompt, vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'tool-contract') {
      const payload = evaluateToolContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'tool-inventory') {
      const payload = evaluateToolInventory(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (process.env.JOVIE_RUN_LIVE_EVALS !== '1') {
      return {
        error:
          'Live chat-turn evals are disabled. Set JOVIE_RUN_LIVE_EVALS=1 and AI_GATEWAY_API_KEY to run manual live Promptfoo evals.',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (!process.env.AI_GATEWAY_API_KEY) {
      return {
        error:
          'AI_GATEWAY_API_KEY is required for manual live chat-turn Promptfoo evals.',
        latencyMs: Date.now() - startedAt,
      };
    }

    const mode = toMode(vars.mode);
    const plan = toPlanId(vars.plan);
    const uiMessages = toUiMessages(prompt, vars);
    const toolExecutions: ToolExecution[] = [];
    const streamErrors: string[] = [];
    const toolNames = getToolNamesForTurn(mode, plan);
    const tools = buildEvalTools(toolNames, vars, toolExecutions);
    const artistOverrides = toObject(vars.artistOverrides);
    const artistContext =
      mode === 'app'
        ? buildTestArtistContext(
            artistOverrides as Parameters<typeof buildTestArtistContext>[0]
          )
        : null;
    const releases = mode === 'app' ? buildEvalReleases(vars) : [];
    const knowledgeContext =
      mode === 'app' ? selectKnowledgeContextForTurn(uiMessages) : '';
    const abortController = new AbortController();
    const upstreamAbortSignal = options?.abortSignal;
    const onAbort = () => {
      abortController.abort(upstreamAbortSignal?.reason);
    };

    if (upstreamAbortSignal?.aborted) {
      onAbort();
    } else {
      upstreamAbortSignal?.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const turn = await executeChatTurn({
        uiMessages,
        artistContext,
        releases,
        resolvedProfileId: mode === 'app' ? EVAL_PROFILE_ID : null,
        resolvedConversationId: EVAL_CONVERSATION_ID,
        userId: mode === 'app' ? EVAL_USER_ID : null,
        userPlan: plan,
        planLimits: getEntitlements(plan),
        insightsEnabled: toBoolean(vars.insightsEnabled, plan !== 'free'),
        forceLightModel: toBoolean(vars.forceLightModel, false),
        tools,
        signal: abortController.signal,
        requestId: 'promptfoo-eval',
        telemetry: {
          setTags: () => undefined,
          setExtra: () => undefined,
          captureException: () => undefined,
        },
        onStreamError: error => {
          streamErrors.push(safeError(error));
        },
        mode,
      });

      const [text, toolCalls, toolResults, steps, usage, finishReason] =
        await Promise.all([
          turn.streamResult.text,
          turn.streamResult.toolCalls,
          turn.streamResult.toolResults,
          turn.streamResult.steps,
          turn.streamResult.totalUsage,
          turn.streamResult.finishReason,
        ]);

      const payload = {
        target,
        text,
        selectedModel: turn.selectedModel,
        mode,
        plan,
        toolNames: turn.toolNames,
        toolCalls,
        toolResults,
        toolExecutions,
        steps,
        finishReason,
        usage,
        knowledgeContext,
        knowledgeContextSelected: knowledgeContext.length > 0,
        systemPromptChars: turn.systemPrompt.length,
        modelMessages: turn.modelMessages.map(message => ({
          role: message.role,
          content:
            typeof message.content === 'string'
              ? message.content
              : Array.isArray(message.content)
                ? message.content
                : '[non-text content]',
        })),
      };

      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
        tokenUsage: toPromptfooUsage(usage as Record<string, unknown>),
      };
    } catch (error) {
      const streamErrorSuffix =
        streamErrors.length > 0
          ? ` Stream errors: ${streamErrors.join(' | ')}`
          : '';

      return {
        error: `${safeError(error)}${streamErrorSuffix}`,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      upstreamAbortSignal?.removeEventListener('abort', onAbort);
    }
  }
}
