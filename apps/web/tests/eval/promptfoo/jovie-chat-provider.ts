import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { type ToolSet, tool, type UIMessage } from 'ai';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_HEADER,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import {
  canUseLightModel,
  executeChatTurn,
  selectKnowledgeContextForTurn,
} from '@/lib/chat/run';
import {
  decodeToolEvents,
  type PersistedToolEvent,
  persistedToolEventsSchema,
  toolEventToMessagePart,
} from '@/lib/chat/tool-events';
import {
  FREE_TIER_TOOLS,
  ONBOARDING_TOOLS,
  TOOL_SCHEMAS,
} from '@/lib/chat/tool-schemas';
import { getToolUiConfig, TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';
import type { ReleaseContext } from '@/lib/chat/types';
import {
  COMMANDS,
  commandsForSurface,
  HIDDEN_TOOLS,
} from '@/lib/commands/registry';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import { users } from '@/lib/db/schema/auth';
import { chatMessages, chatTurns } from '@/lib/db/schema/chat';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getEntitlements, type PlanId } from '@/lib/entitlements/registry';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';

type EvalVars = Record<string, unknown>;
type EvalTarget =
  | 'chat-turn'
  | 'eval-case-inventory'
  | 'model-contract'
  | 'mobile-chat-route'
  | 'tool-contract'
  | 'tool-event-contract'
  | 'tool-render-contract'
  | 'tool-inventory'
  | 'web-chat-http-route'
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
const PROMPTFOO_CONFIG_PATH = 'tests/eval/promptfoo/promptfooconfig.yaml';
const HTTP_EVAL_MAX_RESPONSE_CHARS = 4000;
const HTTP_EVAL_TIMEOUT_MS = 15_000;
const HTTP_EVAL_DEFAULT_PERSONA = 'creator-ready';

let liveHttpEvalDb: ReturnType<typeof drizzle> | null = null;

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
const GENERIC_ARTIFACT_RENDERER_TOOL_NAMES = [
  'generateAlbumArt',
  'generateReleasePitch',
  'proposeAvatarUpload',
  'proposeProfileEdit',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
  'showTopInsights',
] as const;
const GENERIC_ARTIFACT_RENDERER_NAME_SET = new Set<string>(
  GENERIC_ARTIFACT_RENDERER_TOOL_NAMES
);
const REQUIRED_TOOL_EVENT_CASES = [
  'approval-requested',
  'approval-responded',
  'dedupe-latest',
  'denied',
  'invalid',
  'inventory',
  'legacy-failure',
  'legacy-success',
] as const;
const REQUIRED_FREE_UNAVAILABLE_TOOL_NAMES = [
  'createMerch',
  'generateAlbumArt',
  'showArtistPayouts',
] as const;
const REQUIRED_ONBOARDING_UNAVAILABLE_TOOL_NAMES = [
  'generateAlbumArt',
  'openBillingPortal',
  'submitFeedback',
] as const;
const REQUIRED_SEMANTIC_INVALID_TOOL_NAMES = [
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
] as const;
const CHAT_SLASH_SKILL_NAMES = commandsForSurface('chat-slash')
  .filter(command => command.kind === 'skill')
  .map(command => command.id)
  .sort();
const CMDK_SKILL_NAMES = commandsForSurface('cmdk')
  .filter(command => command.kind === 'skill')
  .map(command => command.id)
  .sort();
const ALL_COMMAND_SKILL_NAMES = COMMANDS.filter(
  command => command.kind === 'skill'
)
  .map(command => command.id)
  .sort();
const HIDDEN_TOOL_NAMES = Object.keys(HIDDEN_TOOLS).sort();
const HIDDEN_TOOL_REASONS = HIDDEN_TOOL_NAMES.reduce<Record<string, string>>(
  (reasons, toolName) => {
    reasons[toolName] = HIDDEN_TOOLS[toolName] ?? '';
    return reasons;
  },
  {}
);

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
    value === 'eval-case-inventory' ||
    value === 'mobile-chat-route' ||
    value === 'model-contract' ||
    value === 'tool-contract' ||
    value === 'tool-event-contract' ||
    value === 'tool-render-contract' ||
    value === 'tool-inventory' ||
    value === 'web-chat-http-route' ||
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

type LiveHttpResponse = {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly responseText: string;
  readonly responseJson: unknown;
};

type LiveHttpSession = {
  readonly persona: string;
  readonly userId: string;
  readonly dbUserId: string;
  readonly profileId: string;
  readonly profilePath: string | null;
  readonly cookieHeader: string;
};

function parseJsonText(value: string): unknown {
  if (value.trim().length === 0) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function truncateHttpBody(value: string): string {
  if (value.length <= HTTP_EVAL_MAX_RESPONSE_CHARS) return value;
  return `${value.slice(0, HTTP_EVAL_MAX_RESPONSE_CHARS)}[truncated]`;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const values: Record<string, string> = {};
  headers.forEach((value, key) => {
    values[key.toLowerCase()] = value;
  });
  return values;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(headers);
  }

  const combined = headers.get('set-cookie');
  return combined ? combined.split(/,(?=\s*[^;,]+=)/).map(v => v.trim()) : [];
}

function cookieHeaderFromResponse(headers: Headers): string {
  return getSetCookieHeaders(headers)
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join('; ');
}

function getLiveHttpEvalDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for live HTTP Promptfoo evals');
  }

  liveHttpEvalDb ??= drizzle(neon(databaseUrl));
  return liveHttpEvalDb;
}

function isLoopbackHttpEvalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  );
}

function resolveLiveHttpBaseUrl(vars: EvalVars): URL {
  const rawBaseUrl =
    typeof vars.baseUrl === 'string' && vars.baseUrl.trim().length > 0
      ? vars.baseUrl.trim()
      : (process.env.JOVIE_PROMPTFOO_BASE_URL ?? '').trim();

  if (!rawBaseUrl) {
    throw new Error(
      'JOVIE_PROMPTFOO_BASE_URL is required for live HTTP Promptfoo evals'
    );
  }

  const baseUrl = new URL(rawBaseUrl);
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error('JOVIE_PROMPTFOO_BASE_URL must be an HTTP(S) URL');
  }
  if (!isLoopbackHttpEvalHost(baseUrl.hostname)) {
    throw new Error(
      'Live HTTP Promptfoo evals only run against loopback hosts'
    );
  }

  return baseUrl;
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, HTTP_EVAL_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readHttpResponse(response: Response): Promise<LiveHttpResponse> {
  const responseText = truncateHttpBody(await response.text());
  return {
    status: response.status,
    headers: responseHeadersToObject(response.headers),
    responseText,
    responseJson: parseJsonText(responseText),
  };
}

function buildLiveHttpChatBody(input: {
  readonly prompt: string;
  readonly profileId?: string;
  readonly clientTurnId?: string;
  readonly clientMessageId?: string;
  readonly toolIntent?: string;
}) {
  return {
    profileId: input.profileId,
    clientTurnId: input.clientTurnId,
    clientMessageId: input.clientMessageId,
    source: 'typed',
    toolIntent: input.toolIntent,
    messages: [
      {
        id: input.clientMessageId ?? `promptfoo-http-message-${randomUUID()}`,
        role: 'user',
        parts: [{ type: 'text', text: input.prompt }],
      },
    ],
  };
}

async function resolveLiveHttpProfileForUser(clerkUserId: string): Promise<{
  readonly dbUserId: string;
  readonly profileId: string;
  readonly profilePath: string | null;
}> {
  const [profile] = await getLiveHttpEvalDb()
    .select({
      dbUserId: users.id,
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
    })
    .from(users)
    .innerJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!profile) {
    throw new Error(`No active synthetic profile found for ${clerkUserId}`);
  }

  return {
    dbUserId: profile.dbUserId,
    profileId: profile.profileId,
    profilePath: profile.username ? `/${profile.username}` : null,
  };
}

async function createLiveHttpSession(
  baseUrl: URL,
  persona: string
): Promise<LiveHttpSession> {
  const sessionResponse = await fetchWithTimeout(
    new URL('/api/dev/test-auth/session', baseUrl),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [TEST_MODE_HEADER]: TEST_AUTH_BYPASS_MODE,
      },
      body: JSON.stringify({ persona }),
    }
  );
  const session = await readHttpResponse(sessionResponse);
  if (session.status < 200 || session.status >= 300) {
    throw new Error(
      `Dev test-auth session failed with ${session.status}: ${session.responseText}`
    );
  }

  const sessionJson = toObject(session.responseJson);
  const userId =
    typeof sessionJson.userId === 'string' ? sessionJson.userId.trim() : '';
  if (!userId) {
    throw new Error('Dev test-auth session did not return userId');
  }

  const profile = await resolveLiveHttpProfileForUser(userId);
  return {
    persona,
    userId,
    ...profile,
    cookieHeader: cookieHeaderFromResponse(sessionResponse.headers),
  };
}

async function postLiveHttpChat(input: {
  readonly baseUrl: URL;
  readonly body: unknown;
  readonly requestId: string;
  readonly session?: LiveHttpSession;
}): Promise<LiveHttpResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: input.baseUrl.origin,
    'x-request-id': input.requestId,
  };

  if (input.session) {
    headers[TEST_MODE_HEADER] = TEST_AUTH_BYPASS_MODE;
    headers[TEST_USER_ID_HEADER] = input.session.userId;
    if (input.session.cookieHeader) {
      headers.Cookie = input.session.cookieHeader;
    }
  }

  return readHttpResponse(
    await fetchWithTimeout(new URL(WEB_CHAT_ROUTE_PATH, input.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(input.body),
    })
  );
}

async function readLiveHttpTurnState(input: {
  readonly dbUserId: string;
  readonly profileId: string;
  readonly clientTurnId: string;
}) {
  const database = getLiveHttpEvalDb();
  const [turn] = await database
    .select()
    .from(chatTurns)
    .where(
      and(
        eq(chatTurns.userId, input.dbUserId),
        eq(chatTurns.creatorProfileId, input.profileId),
        eq(chatTurns.clientTurnId, input.clientTurnId)
      )
    )
    .limit(1);

  if (!turn) {
    return null;
  }

  const messages = await database
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.turnId, turn.id));
  const assistantMessages = messages.filter(
    message => message.role === 'assistant'
  );
  const userMessages = messages.filter(message => message.role === 'user');

  return {
    turnId: turn.id,
    conversationId: turn.conversationId,
    status: turn.status,
    errorCode: turn.errorCode,
    errorMessage: turn.errorMessage,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    totalMessageCount: messages.length,
    assistantText: assistantMessages[0]?.content ?? '',
  };
}

async function evaluateLiveHttpUnauthorized(prompt: string, baseUrl: URL) {
  const requestId = `promptfoo-http-unauth-${randomUUID()}`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId,
    body: buildLiveHttpChatBody({ prompt }),
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    costTier: 'live-http',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    requestId,
    response,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpDeterministicReplay(
  prompt: string,
  baseUrl: URL,
  vars: EvalVars
) {
  const persona =
    typeof vars.persona === 'string' && vars.persona.trim().length > 0
      ? vars.persona.trim()
      : HTTP_EVAL_DEFAULT_PERSONA;
  const session = await createLiveHttpSession(baseUrl, persona);
  const clientTurnId =
    typeof vars.clientTurnId === 'string' && vars.clientTurnId.trim().length > 0
      ? vars.clientTurnId.trim()
      : `promptfoo-http-avatar-${randomUUID()}`;
  const clientMessageId = `${clientTurnId}-message`;
  const body = buildLiveHttpChatBody({
    prompt,
    profileId: session.profileId,
    clientTurnId,
    clientMessageId,
  });

  const first = await postLiveHttpChat({
    baseUrl,
    body,
    requestId: `${clientTurnId}-first`,
    session,
  });
  const stateAfterFirst = await readLiveHttpTurnState({
    dbUserId: session.dbUserId,
    profileId: session.profileId,
    clientTurnId,
  });
  const replay = await postLiveHttpChat({
    baseUrl,
    body,
    requestId: `${clientTurnId}-replay`,
    session,
  });
  const stateAfterReplay = await readLiveHttpTurnState({
    dbUserId: session.dbUserId,
    profileId: session.profileId,
    clientTurnId,
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'deterministic-replay',
    costTier: 'live-http',
    text: replay.responseText || first.responseText,
    selectedModel: null,
    modelCalled: false,
    modelDispatchPrevented: first.headers['x-intent-routed'] === 'true',
    persistenceAttempted: true,
    session: {
      persona: session.persona,
      userId: session.userId,
      dbUserId: session.dbUserId,
      profileId: session.profileId,
      profilePath: session.profilePath,
    },
    clientTurnId,
    first,
    replay,
    stateAfterFirst,
    stateAfterReplay,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpAlbumArtUnavailable(
  prompt: string,
  baseUrl: URL,
  vars: EvalVars
) {
  const persona =
    typeof vars.persona === 'string' && vars.persona.trim().length > 0
      ? vars.persona.trim()
      : 'creator';
  const session = await createLiveHttpSession(baseUrl, persona);
  const clientTurnId =
    typeof vars.clientTurnId === 'string' && vars.clientTurnId.trim().length > 0
      ? vars.clientTurnId.trim()
      : `promptfoo-http-album-art-${randomUUID()}`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId: `${clientTurnId}-request`,
    session,
    body: buildLiveHttpChatBody({
      prompt,
      profileId: session.profileId,
      clientTurnId,
      clientMessageId: `${clientTurnId}-message`,
      toolIntent: 'album_art_generation',
    }),
  });
  const stateAfterResponse = await readLiveHttpTurnState({
    dbUserId: session.dbUserId,
    profileId: session.profileId,
    clientTurnId,
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'album-art-unavailable',
    costTier: 'live-http',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    modelDispatchPrevented:
      response.headers['x-chat-preflight'] === 'album-art-unavailable',
    persistenceAttempted: true,
    session: {
      persona: session.persona,
      userId: session.userId,
      dbUserId: session.dbUserId,
      profileId: session.profileId,
      profilePath: session.profilePath,
    },
    clientTurnId,
    response,
    stateAfterResponse,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpWebChatRoute(prompt: string, vars: EvalVars) {
  if (process.env.JOVIE_RUN_LIVE_HTTP_EVALS !== '1') {
    throw new Error(
      'Live HTTP evals are disabled. Set JOVIE_RUN_LIVE_HTTP_EVALS=1 and JOVIE_PROMPTFOO_BASE_URL to run manual live HTTP Promptfoo evals.'
    );
  }

  const baseUrl = resolveLiveHttpBaseUrl(vars);
  const httpCase =
    typeof vars.httpCase === 'string' && vars.httpCase.trim().length > 0
      ? vars.httpCase.trim()
      : 'unauthorized';

  if (httpCase === 'unauthorized') {
    return evaluateLiveHttpUnauthorized(prompt, baseUrl);
  }

  if (httpCase === 'deterministic-replay') {
    return evaluateLiveHttpDeterministicReplay(prompt, baseUrl, vars);
  }

  if (httpCase === 'album-art-unavailable') {
    return evaluateLiveHttpAlbumArtUnavailable(prompt, baseUrl, vars);
  }

  throw new RangeError(`Invalid live HTTP eval vars.httpCase: ${httpCase}`);
}

function evaluateModelContract(prompt: string, vars: EvalVars) {
  const uiMessages = toUiMessages(prompt, vars);
  const mode = toMode(vars.mode);
  const plan = toPlanId(vars.plan);
  const planLimits = getEntitlements(plan);
  const aiCanUseTools = toBoolean(
    vars.aiCanUseTools,
    planLimits.booleans.aiCanUseTools
  );
  const forceLightModel = toBoolean(vars.forceLightModel, false);
  const heuristicLightModel = canUseLightModel(uiMessages, aiCanUseTools);
  const selectedModel =
    forceLightModel || heuristicLightModel ? CHAT_MODEL_LIGHT : CHAT_MODEL;
  const expectedModel =
    vars.expectedModel === 'light'
      ? CHAT_MODEL_LIGHT
      : vars.expectedModel === 'primary'
        ? CHAT_MODEL
        : null;

  return {
    target: 'model-contract',
    adapter: 'model-contract',
    productionEntrypoint: 'apps/web/lib/chat/run.ts:executeChatTurn',
    costTier: 'deterministic',
    text: '',
    selectedModel,
    expectedModel,
    modelBoundary: selectedModel === CHAT_MODEL_LIGHT ? 'light' : 'primary',
    expectedBoundary:
      expectedModel === CHAT_MODEL_LIGHT
        ? 'light'
        : expectedModel === CHAT_MODEL
          ? 'primary'
          : null,
    lightModel: CHAT_MODEL_LIGHT,
    primaryModel: CHAT_MODEL,
    modelCalled: false,
    persistenceAttempted: false,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
    mode,
    plan,
    aiCanUseTools,
    forceLightModel,
    heuristicLightModel,
    messageCount: uiMessages.length,
    userText: uiMessages
      .filter(message => message.role === 'user')
      .flatMap(message =>
        message.parts
          .filter(
            (part): part is { type: 'text'; text: string } =>
              part.type === 'text' && typeof part.text === 'string'
          )
          .map(part => part.text)
      )
      .join('\n'),
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
  const missingSkillCommandSchemaNames = ALL_COMMAND_SKILL_NAMES.filter(
    toolName => !Object.hasOwn(ALL_EVAL_TOOL_SCHEMAS, toolName)
  );
  const missingSkillCommandCaseNames = ALL_COMMAND_SKILL_NAMES.filter(
    toolName => !coveredSet.has(toolName)
  );
  const missingCmdkSkillNames = CHAT_SLASH_SKILL_NAMES.filter(
    toolName => !CMDK_SKILL_NAMES.includes(toolName)
  );
  const staleHiddenToolNames = HIDDEN_TOOL_NAMES.filter(
    toolName => !Object.hasOwn(ALL_EVAL_TOOL_SCHEMAS, toolName)
  );
  const hiddenToolsWithoutReason = HIDDEN_TOOL_NAMES.filter(
    toolName => !HIDDEN_TOOL_REASONS[toolName]?.trim()
  );
  const visibleOrHiddenToolNames = new Set([
    ...ALL_COMMAND_SKILL_NAMES,
    ...HIDDEN_TOOL_NAMES,
  ]);
  const missingVisibilityDecisionNames = ALL_EVAL_TOOL_NAMES.filter(
    toolName => !visibleOrHiddenToolNames.has(toolName)
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
    chatSlashSkillNames: CHAT_SLASH_SKILL_NAMES,
    cmdkSkillNames: CMDK_SKILL_NAMES,
    commandSkillNames: ALL_COMMAND_SKILL_NAMES,
    hiddenToolNames: HIDDEN_TOOL_NAMES,
    hiddenToolReasons: HIDDEN_TOOL_REASONS,
    missingSkillCommandSchemaNames,
    missingSkillCommandCaseNames,
    missingCmdkSkillNames,
    staleHiddenToolNames,
    hiddenToolsWithoutReason,
    missingVisibilityDecisionNames,
  };
}

function getToolUiHint(toolName: string) {
  return TOOL_UI_REGISTRY[toolName as keyof typeof TOOL_UI_REGISTRY]?.uiHint;
}

function toolEvent(
  toolName: string,
  overrides: Partial<PersistedToolEvent> = {}
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: `${toolName}-event`,
    toolName,
    state: 'succeeded',
    input: { synthetic: true },
    output: {
      success: true,
      title: `${toolName} completed`,
      summary: `${toolName} completed`,
    },
    summary: `${toolName} completed`,
    uiHint: getToolUiHint(toolName) ?? 'status',
    ...overrides,
  };
}

function buildToolEventInput(eventCase: string, toolName: string): unknown[] {
  switch (eventCase) {
    case 'inventory':
      return ALL_EVAL_TOOL_NAMES.map(name => toolEvent(name));
    case 'legacy-success':
      return [
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'legacy-success-1',
            toolName,
            state: 'result',
            args: { synthetic: true },
            result: {
              success: true,
              title: 'Synthetic tool result',
              summary: 'Synthetic tool result',
            },
          },
        },
      ];
    case 'legacy-failure':
      return [
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'legacy-failure-1',
            toolName,
            state: 'result',
            args: { synthetic: true },
            result: {
              success: false,
              error: 'Synthetic provider unavailable',
            },
          },
        },
      ];
    case 'approval-requested':
      return [
        toolEvent(toolName, {
          toolCallId: 'approval-requested-1',
          state: 'needs-approval',
          output: undefined,
          summary: undefined,
          approval: { id: 'approval-requested-1-state' },
        }),
      ];
    case 'approval-responded':
      return [
        toolEvent(toolName, {
          toolCallId: 'approval-responded-1',
          state: 'needs-approval',
          output: undefined,
          summary: undefined,
          approval: {
            id: 'approval-responded-1-state',
            approved: true,
            reason: 'Synthetic approval granted',
          },
        }),
      ];
    case 'denied':
      return [
        toolEvent(toolName, {
          toolCallId: 'denied-1',
          state: 'denied',
          output: undefined,
          summary: 'Synthetic approval denied',
          errorMessage: 'Synthetic approval denied',
          approval: {
            id: 'denied-1-state',
            approved: false,
            reason: 'Synthetic approval denied',
          },
        }),
      ];
    case 'dedupe-latest':
      return [
        toolEvent(toolName, {
          toolCallId: 'dedupe-1',
          state: 'running',
          output: undefined,
          summary: undefined,
        }),
        toolEvent(toolName, {
          toolCallId: 'dedupe-1',
          state: 'succeeded',
          output: {
            success: true,
            title: 'Latest synthetic result',
          },
          summary: 'Latest synthetic result',
        }),
      ];
    case 'invalid':
      return [{ type: 'not-a-tool-event', value: true }];
    default:
      throw new RangeError(`Invalid eval vars.eventCase: ${eventCase}`);
  }
}

function evaluateToolEventContract(vars: EvalVars) {
  const eventCase =
    typeof vars.eventCase === 'string' ? vars.eventCase : 'legacy-success';
  const toolName = toToolName(vars.toolName ?? 'showTopInsights');
  const toolCalls = buildToolEventInput(eventCase, toolName);
  const decoded = decodeToolEvents(toolCalls);
  const schemaResult = persistedToolEventsSchema.safeParse(decoded.events);
  const messageParts = schemaResult.success
    ? schemaResult.data.map(event => toolEventToMessagePart(event))
    : [];
  const eventToolNames = decoded.events.map(event => event.toolName);
  const hydratedToolNames = messageParts
    .map(part => ('toolName' in part ? part.toolName : null))
    .filter((name): name is string => typeof name === 'string');
  const missingEventToolNames =
    eventCase === 'inventory'
      ? ALL_EVAL_TOOL_NAMES.filter(name => !eventToolNames.includes(name))
      : [];
  const missingHydratedToolNames =
    eventCase === 'inventory'
      ? ALL_EVAL_TOOL_NAMES.filter(name => !hydratedToolNames.includes(name))
      : [];

  return {
    target: 'tool-event-contract',
    adapter: 'tool-event-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    toolName,
    eventCase,
    source: decoded.source,
    schemaValid: schemaResult.success,
    schemaErrors: schemaResult.success ? [] : schemaErrorMessages(schemaResult),
    toolCalls,
    events: decoded.events,
    messageParts,
    eventStates: decoded.events.map(event => event.state),
    hydratedStates: messageParts.map(part =>
      'state' in part ? part.state : null
    ),
    eventToolNames,
    hydratedToolNames,
    missingEventToolNames,
    missingHydratedToolNames,
  };
}

function renderStatusTitle(event: PersistedToolEvent): string {
  const config = getToolUiConfig(event.toolName);

  switch (event.state) {
    case 'running':
      return config.loadingTitle ?? config.label;
    case 'failed':
      return config.errorTitle ?? `${config.label} Failed`;
    case 'denied':
      return `${config.label} denied`;
    case 'needs-approval':
      return `${config.label} needs your OK`;
    case 'succeeded':
      return config.successTitle ?? config.label;
  }
}

function renderStatusBody(event: PersistedToolEvent): string | undefined {
  switch (event.state) {
    case 'running':
      return event.summary;
    case 'failed':
    case 'denied':
      return event.errorMessage ?? event.summary;
    case 'needs-approval':
      return event.errorMessage ?? 'Approval required before continuing.';
    case 'succeeded':
      return event.summary ?? 'Completed';
  }
}

function syntheticArtifactOutputFor(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case 'generateAlbumArt':
      return {
        success: true,
        state: 'generated',
        releaseId: '00000000-0000-4000-8000-000000000401',
        releaseTitle: 'Tidal Drift',
        artistName: 'Luna Waves',
        generationId: '00000000-0000-4000-8000-000000000402',
        hasExistingArtwork: false,
        candidates: [
          {
            id: 'album-art-candidate-1',
            styleId: 'chromatic-tide',
            styleLabel: 'Chromatic tide',
            previewUrl: 'https://cdn.jov.ie/eval/album-art-preview.jpg',
            fullResUrl: 'https://cdn.jov.ie/eval/album-art-full.jpg',
          },
        ],
      };
    case 'generateReleasePitch':
      return {
        success: true,
        releaseTitle: 'Tidal Drift',
        pitches: {
          spotify: 'Synthetic Spotify pitch for Tidal Drift.',
          appleMusic: 'Synthetic Apple Music pitch for Tidal Drift.',
          amazon: 'Synthetic Amazon pitch for Tidal Drift.',
          generic: 'Synthetic generic pitch for Tidal Drift.',
        },
      };
    case 'proposeAvatarUpload':
      return { success: true };
    case 'proposeProfileEdit':
      return {
        success: true,
        preview: {
          field: 'bio',
          fieldLabel: 'Bio',
          currentValue: 'Old synthetic bio.',
          newValue: 'New synthetic bio.',
          reason: 'Synthetic eval preview.',
        },
      };
    case 'proposeSocialLink':
      return {
        success: true,
        platform: {
          id: 'instagram',
          name: 'Instagram',
          icon: 'instagram',
          color: '#E1306C',
        },
        normalizedUrl: 'https://instagram.com/lunawaves',
        originalUrl: 'https://instagram.com/lunawaves',
      };
    case 'proposeSocialLinkRemoval':
      return {
        success: true,
        linkId: '00000000-0000-4000-8000-000000000301',
        platform: 'instagram',
        url: 'https://instagram.com/lunawaves',
      };
    case 'showTopInsights':
      return {
        success: true,
        totalActive: 1,
        insights: [
          {
            id: 'synthetic-insight',
            title: 'Synthetic insight',
            body: 'Synthetic audience signal.',
            priority: 'medium',
          },
        ],
      };
    default:
      return {
        success: true,
        summary: `${toolName} completed with a synthetic eval result.`,
      };
  }
}

function hasGeneratedAlbumArtOutput(output: Record<string, unknown>): boolean {
  const candidates = output.candidates;

  return (
    output.success === true &&
    output.state === 'generated' &&
    typeof output.releaseTitle === 'string' &&
    typeof output.artistName === 'string' &&
    typeof output.generationId === 'string' &&
    typeof output.hasExistingArtwork === 'boolean' &&
    Array.isArray(candidates) &&
    candidates.every(candidate => {
      const candidateObject = toObject(candidate);
      return (
        typeof candidateObject.id === 'string' &&
        typeof candidateObject.styleId === 'string' &&
        typeof candidateObject.styleLabel === 'string' &&
        typeof candidateObject.previewUrl === 'string' &&
        typeof candidateObject.fullResUrl === 'string'
      );
    })
  );
}

function hasReleasePitchOutput(output: Record<string, unknown>): boolean {
  const pitches = toObject(output.pitches);

  return (
    output.success === true &&
    (output.releaseTitle === undefined ||
      typeof output.releaseTitle === 'string') &&
    typeof pitches.spotify === 'string' &&
    typeof pitches.appleMusic === 'string' &&
    typeof pitches.amazon === 'string' &&
    typeof pitches.generic === 'string'
  );
}

function hasRenderableArtifact(
  event: PersistedToolEvent,
  profileIdPresent: boolean
): boolean {
  if (
    event.state !== 'succeeded' ||
    !GENERIC_ARTIFACT_RENDERER_NAME_SET.has(event.toolName)
  ) {
    return false;
  }

  const output = event.output;
  if (!output) return false;

  switch (event.toolName) {
    case 'generateAlbumArt':
      return profileIdPresent && hasGeneratedAlbumArtOutput(output);
    case 'generateReleasePitch':
      return hasReleasePitchOutput(output);
    case 'proposeAvatarUpload':
      return output.success === true;
    case 'proposeProfileEdit':
      return (
        profileIdPresent &&
        output.success === true &&
        Object.hasOwn(output, 'preview')
      );
    case 'proposeSocialLink': {
      const platform = toObject(output.platform);
      return (
        profileIdPresent &&
        typeof platform.id === 'string' &&
        typeof platform.name === 'string' &&
        typeof output.normalizedUrl === 'string' &&
        typeof output.originalUrl === 'string'
      );
    }
    case 'proposeSocialLinkRemoval':
      return (
        profileIdPresent &&
        typeof output.linkId === 'string' &&
        typeof output.platform === 'string' &&
        typeof output.url === 'string'
      );
    case 'showTopInsights':
      return Object.hasOwn(output, 'success');
    default:
      return false;
  }
}

function buildToolRenderEvent(
  renderCase: string,
  toolName: string
): PersistedToolEvent {
  const config = getToolUiConfig(toolName);

  switch (renderCase) {
    case 'artifact-success':
      return toolEvent(toolName, {
        output: syntheticArtifactOutputFor(toolName),
        summary: `${config.successTitle ?? config.label} rendered.`,
        uiHint: config.uiHint,
      });
    case 'status-success':
      return toolEvent(toolName, {
        output: {
          success: true,
          summary: `${toolName} completed with a synthetic status result.`,
        },
        summary: `${toolName} completed with a synthetic status result.`,
        uiHint: config.uiHint,
      });
    case 'failed':
      return toolEvent(toolName, {
        state: 'failed',
        output: {
          success: false,
          error: 'Synthetic render failure',
        },
        summary: 'Synthetic render failure',
        errorMessage: 'Synthetic render failure',
        uiHint: config.uiHint,
      });
    case 'needs-approval':
      return toolEvent(toolName, {
        state: 'needs-approval',
        output: undefined,
        summary: undefined,
        approval: { id: `${toolName}-render-approval` },
        uiHint: config.uiHint,
      });
    case 'denied':
      return toolEvent(toolName, {
        state: 'denied',
        output: undefined,
        summary: 'Synthetic approval denied',
        errorMessage: 'Synthetic approval denied',
        approval: {
          id: `${toolName}-render-denied`,
          approved: false,
          reason: 'Synthetic approval denied',
        },
        uiHint: config.uiHint,
      });
    default:
      throw new RangeError(`Invalid eval vars.renderCase: ${renderCase}`);
  }
}

function buildRenderPlan(event: PersistedToolEvent, profileIdPresent: boolean) {
  const config = getToolUiConfig(event.toolName);
  const artifactRendered =
    config.renderer === 'artifact' &&
    hasRenderableArtifact(event, profileIdPresent);
  const renderKind = artifactRendered ? 'artifact-card' : 'status-row';
  const successTitle = config.successTitle ?? config.label;

  return {
    toolName: event.toolName,
    state: event.state,
    registryRenderer: config.renderer,
    registryUiHint: config.uiHint,
    genericArtifactRendererImplemented: GENERIC_ARTIFACT_RENDERER_NAME_SET.has(
      event.toolName
    ),
    profileIdPresent,
    artifactRendered,
    renderKind,
    statusTitle: renderStatusTitle(event),
    statusBody: renderStatusBody(event),
    statusRole:
      event.state === 'failed' || event.state === 'denied' ? 'alert' : 'status',
    successTitle,
    errorTitle: config.errorTitle ?? `${config.label} Failed`,
    claimsSuccess:
      event.state === 'succeeded' &&
      (artifactRendered || renderStatusTitle(event) === successTitle),
  };
}

function evaluateToolRenderContract(vars: EvalVars) {
  const renderCase =
    typeof vars.renderCase === 'string' ? vars.renderCase : 'artifact-success';
  const profileIdPresent = toBoolean(vars.profileIdPresent, true);
  const events =
    renderCase === 'inventory'
      ? TOOL_UI_REGISTRY_NAMES.map(toolName =>
          buildToolRenderEvent('artifact-success', toolName)
        )
      : [
          buildToolRenderEvent(
            renderCase,
            toToolName(vars.toolName ?? 'proposeSocialLink')
          ),
        ];
  const schemaResult = persistedToolEventsSchema.safeParse(events);
  const messageParts = schemaResult.success
    ? schemaResult.data.map(event => toolEventToMessagePart(event))
    : [];
  const renderPlans = schemaResult.success
    ? schemaResult.data.map(event => buildRenderPlan(event, profileIdPresent))
    : [];
  const renderedToolNames = renderPlans.map(plan => plan.toolName);
  const missingRenderPlanToolNames =
    renderCase === 'inventory'
      ? TOOL_UI_REGISTRY_NAMES.filter(
          toolName => !renderedToolNames.includes(toolName)
        )
      : [];
  const artifactRegistryToolNames = TOOL_UI_REGISTRY_NAMES.filter(toolName => {
    const config = getToolUiConfig(toolName);
    return config.renderer === 'artifact';
  });

  return {
    target: 'tool-render-contract',
    adapter: 'tool-render-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    renderCase,
    profileIdPresent,
    schemaValid: schemaResult.success,
    schemaErrors: schemaResult.success ? [] : schemaErrorMessages(schemaResult),
    events,
    messageParts,
    renderPlans,
    toolUiRegistryNames: TOOL_UI_REGISTRY_NAMES,
    artifactRegistryToolNames,
    artifactRendererToolNames: [...GENERIC_ARTIFACT_RENDERER_TOOL_NAMES],
    missingRenderPlanToolNames,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

type EvalCaseSummary = {
  readonly description: string;
  readonly cost: string | null;
  readonly target: string | null;
  readonly toolName: string | null;
  readonly eventCase: string | null;
  readonly renderCase: string | null;
  readonly mode: string | null;
  readonly plan: string | null;
  readonly assertions: readonly string[];
  readonly coveredTools: readonly string[];
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function scalarValue(block: string, key: string): string | null {
  const match = block.match(new RegExp(`\\n\\s+${key}:\\s*([^\\n#]+)`));
  if (!match?.[1]) return null;

  return match[1].trim().replace(/^['"]|['"]$/g, '') || null;
}

function listValuesAfter(block: string, key: string): string[] {
  const lines = block.split('\n');
  const values: string[] = [];
  const keyPattern = new RegExp(`^\\s+${key}:\\s*$`);

  for (let index = 0; index < lines.length; index += 1) {
    if (!keyPattern.test(lines[index] ?? '')) continue;

    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const item = lines[itemIndex]?.match(/^ {10}-\s+(.+?)\s*$/);
      if (!item?.[1]) break;
      values.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
    }
  }

  return values;
}

function extractPromptfooTestBlocks(configText: string): string[] {
  const testsStart = configText.match(/^tests:\s*$/m);
  if (testsStart?.index === undefined) return [];

  const lines = configText.slice(testsStart.index).split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^  - description:/.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [line];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function parseEvalCaseSummary(block: string): EvalCaseSummary {
  const description =
    block
      .match(/^  - description:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? 'Untitled eval case';
  const assertions = uniqueSorted(
    [...block.matchAll(/value:\s*file:\/\/assertions\.cjs:([A-Za-z0-9_]+)/g)]
      .map(match => match[1])
      .filter((value): value is string => typeof value === 'string')
  );

  return {
    description,
    cost: scalarValue(block, 'cost'),
    target: scalarValue(block, 'target') ?? 'chat-turn',
    toolName: scalarValue(block, 'toolName'),
    eventCase: scalarValue(block, 'eventCase'),
    renderCase: scalarValue(block, 'renderCase'),
    mode: scalarValue(block, 'mode') ?? 'app',
    plan: scalarValue(block, 'plan') ?? 'pro',
    assertions,
    coveredTools: listValuesAfter(block, 'coveredTools'),
  };
}

function parsePromptfooCaseSummaries(configText: string): EvalCaseSummary[] {
  return extractPromptfooTestBlocks(configText).map(parseEvalCaseSummary);
}

function caseHasAssertion(
  testCase: EvalCaseSummary,
  assertionName: string
): boolean {
  return testCase.assertions.includes(assertionName);
}

function toolNamesForCases(
  cases: readonly EvalCaseSummary[],
  predicate: (testCase: EvalCaseSummary) => boolean
): string[] {
  return uniqueSorted(
    cases
      .filter(predicate)
      .map(testCase => testCase.toolName)
      .filter((toolName): toolName is string => typeof toolName === 'string')
  );
}

function missingNames(
  required: readonly string[],
  covered: readonly string[]
): string[] {
  const coveredSet = new Set(covered);
  return required.filter(name => !coveredSet.has(name)).sort();
}

function evaluateEvalCaseInventory(vars: EvalVars) {
  const configPath =
    typeof vars.configPath === 'string' && vars.configPath.trim().length > 0
      ? vars.configPath.trim()
      : PROMPTFOO_CONFIG_PATH;
  const resolvedConfigPath = resolve(process.cwd(), configPath);
  const allowedConfigRoot = resolve(process.cwd(), 'tests/eval/promptfoo');
  if (!resolvedConfigPath.startsWith(`${allowedConfigRoot}${sep}`)) {
    throw new RangeError(`Invalid eval vars.configPath: ${configPath}`);
  }
  const configText = readFileSync(resolvedConfigPath, 'utf8');
  const cases = parsePromptfooCaseSummaries(configText);
  const deterministicCases = cases.filter(
    testCase => testCase.cost === 'deterministic'
  );
  const liveCases = cases.filter(testCase => testCase.cost === 'live');
  const firstToolInventoryCase = deterministicCases.find(
    testCase => testCase.target === 'tool-inventory'
  );
  const inventoryCoveredToolNames = uniqueSorted(
    firstToolInventoryCase?.coveredTools ?? []
  );
  const toolContractExecutedNames = toolNamesForCases(
    deterministicCases,
    testCase =>
      testCase.target === 'tool-contract' &&
      caseHasAssertion(testCase, 'assertToolExecuted')
  );
  const genericArtifactRenderCaseNames = toolNamesForCases(
    deterministicCases,
    testCase =>
      testCase.target === 'tool-render-contract' &&
      testCase.renderCase === 'artifact-success' &&
      caseHasAssertion(testCase, 'assertToolRenderSucceededArtifact')
  );
  const toolEventCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'tool-event-contract')
      .map(testCase => testCase.eventCase)
      .filter((eventCase): eventCase is string => typeof eventCase === 'string')
  );
  const freeUnavailableCaseNames = toolNamesForCases(
    deterministicCases,
    testCase =>
      testCase.target === 'tool-contract' &&
      testCase.mode === 'app' &&
      testCase.plan === 'free' &&
      caseHasAssertion(testCase, 'assertToolUnavailable')
  );
  const onboardingUnavailableCaseNames = toolNamesForCases(
    deterministicCases,
    testCase =>
      testCase.target === 'tool-contract' &&
      testCase.mode === 'onboarding' &&
      caseHasAssertion(testCase, 'assertToolUnavailable')
  );
  const semanticInvalidCaseNames = toolNamesForCases(
    deterministicCases,
    testCase =>
      testCase.target === 'tool-contract' &&
      caseHasAssertion(testCase, 'assertToolSemanticInvalid')
  );
  const knownToolNames = new Set(ALL_EVAL_TOOL_NAMES);

  return {
    target: 'eval-case-inventory',
    adapter: 'eval-case-inventory',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    configPath,
    caseCount: cases.length,
    deterministicCaseCount: deterministicCases.length,
    liveCaseCount: liveCases.length,
    targetCounts: deterministicCases.reduce<Record<string, number>>(
      (counts, testCase) => {
        const target = testCase.target ?? 'chat-turn';
        counts[target] = (counts[target] ?? 0) + 1;
        return counts;
      },
      {}
    ),
    requiredToolNames: ALL_EVAL_TOOL_NAMES,
    toolContractExecutedNames,
    missingToolContractExecutedNames: missingNames(
      ALL_EVAL_TOOL_NAMES,
      toolContractExecutedNames
    ),
    unknownToolContractExecutedNames: toolContractExecutedNames.filter(
      toolName => !knownToolNames.has(toolName)
    ),
    inventoryCoveredToolNames,
    missingInventoryCoveredToolNames: missingNames(
      ALL_EVAL_TOOL_NAMES,
      inventoryCoveredToolNames
    ),
    unknownInventoryCoveredToolNames: inventoryCoveredToolNames.filter(
      toolName => !knownToolNames.has(toolName)
    ),
    requiredGenericArtifactRendererToolNames: [
      ...GENERIC_ARTIFACT_RENDERER_TOOL_NAMES,
    ],
    genericArtifactRenderCaseNames,
    missingGenericArtifactRenderCaseNames: missingNames(
      GENERIC_ARTIFACT_RENDERER_TOOL_NAMES,
      genericArtifactRenderCaseNames
    ),
    requiredToolEventCases: [...REQUIRED_TOOL_EVENT_CASES],
    toolEventCaseNames,
    missingToolEventCaseNames: missingNames(
      REQUIRED_TOOL_EVENT_CASES,
      toolEventCaseNames
    ),
    requiredFreeUnavailableToolNames: [...REQUIRED_FREE_UNAVAILABLE_TOOL_NAMES],
    freeUnavailableCaseNames,
    missingFreeUnavailableCaseNames: missingNames(
      REQUIRED_FREE_UNAVAILABLE_TOOL_NAMES,
      freeUnavailableCaseNames
    ),
    requiredOnboardingUnavailableToolNames: [
      ...REQUIRED_ONBOARDING_UNAVAILABLE_TOOL_NAMES,
    ],
    onboardingUnavailableCaseNames,
    missingOnboardingUnavailableCaseNames: missingNames(
      REQUIRED_ONBOARDING_UNAVAILABLE_TOOL_NAMES,
      onboardingUnavailableCaseNames
    ),
    requiredSemanticInvalidToolNames: [...REQUIRED_SEMANTIC_INVALID_TOOL_NAMES],
    semanticInvalidCaseNames,
    missingSemanticInvalidCaseNames: missingNames(
      REQUIRED_SEMANTIC_INVALID_TOOL_NAMES,
      semanticInvalidCaseNames
    ),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
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

    if (target === 'web-chat-http-route') {
      try {
        const payload = await evaluateLiveHttpWebChatRoute(prompt, vars);
        return {
          output: JSON.stringify(payload),
          raw: payload,
          format: 'json',
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          error: safeError(error),
          latencyMs: Date.now() - startedAt,
        };
      }
    }

    if (target === 'eval-case-inventory') {
      const payload = evaluateEvalCaseInventory(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'model-contract') {
      const payload = evaluateModelContract(prompt, vars);
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

    if (target === 'tool-event-contract') {
      const payload = evaluateToolEventContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'tool-render-contract') {
      const payload = evaluateToolRenderContract(vars);
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
