import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { type ToolSet, tool, type UIMessage } from 'ai';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import { buildArtistBioDraft } from '@/lib/ai/artist-bio-writer';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_HEADER,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';
import {
  type AlbumArtCapability,
  buildAlbumArtUnavailableAssistantMessage,
  detectAlbumArtGenerationIntent,
} from '@/lib/chat/album-art-capability';
import { KNOWLEDGE_TOPICS } from '@/lib/chat/knowledge/topics';
import {
  canUseLightModel,
  executeChatTurn,
  selectKnowledgeContextForTurn,
} from '@/lib/chat/run';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import {
  extractSkill,
  parseTokens,
  serializeSkill,
  serializeTokens,
} from '@/lib/chat/tokens';
import {
  canUsePaidChatTools,
  resolveChatTurnPlanLimits,
} from '@/lib/chat/tool-access';
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
import {
  evaluateAccessSignal,
  MAX_INTERVIEW_TURNS_BEFORE_FORCE,
} from '@/lib/chat/tools/onboarding-access-eval';
import {
  collapseInterviewSignals,
  interviewSignalSchema,
} from '@/lib/chat/tools/onboarding-signals';
import type { ReleaseContext } from '@/lib/chat/types';
import {
  COMMANDS,
  commandsForSurface,
  HIDDEN_TOOLS,
} from '@/lib/commands/registry';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import {
  insertSkillsCatalogSchema,
  insertToolsCatalogSchema,
} from '@/lib/db/schema/agents';
import { users } from '@/lib/db/schema/auth';
import { chatMessages, chatTurns } from '@/lib/db/schema/chat';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getEntitlements, type PlanId } from '@/lib/entitlements/registry';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  classifyIntent,
  isDeterministicIntent,
} from '@/lib/intent-detection/classifier';
import {
  type DetectedIntent,
  IntentCategory,
} from '@/lib/intent-detection/types';
import { buildAlbumArtBackgroundPrompt } from '@/lib/services/album-art/prompts';
import { ALBUM_ART_STYLES } from '@/lib/services/album-art/styles';
import {
  buildArtworkProcessingPrompt,
  buildVideoGenerationPrompt,
} from '@/lib/services/canvas/prompts';
import type { CanvasGenerationInput } from '@/lib/services/canvas/types';
import { buildWelcomeMessage } from '@/lib/services/onboarding/welcome-message';
import {
  buildPitchDraftSystemPrompt,
  buildPitchDraftUserPrompt,
  buildSystemPrompt as buildPlaylistPitchSystemPrompt,
  buildUserPrompt as buildPlaylistPitchUserPrompt,
} from '@/lib/services/pitch/prompts';
import { resolvePitchDestination } from '@/lib/services/pitch/targets';
import { type PitchInput, PLATFORM_LIMITS } from '@/lib/services/pitch/types';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { httpUrlSchema } from '@/lib/validation/schemas/base';
import {
  buildTestArtistContext,
  buildTestReleases,
} from '../../fixtures/chat-context';

type EvalVars = Record<string, unknown>;
type EvalTarget =
  | 'ai-tool-prompt-contract'
  | 'chat-confirm-route'
  | 'chat-turn'
  | 'eval-case-inventory'
  | 'knowledge-contract'
  | 'model-contract'
  | 'mobile-chat-route'
  | 'onboarding-welcome-chat-contract'
  | 'onboarding-state-contract'
  | 'onboarding-tool-sequence-contract'
  | 'prompt-context-contract'
  | 'skill-artifact-contract'
  | 'skill-catalog-sync-contract'
  | 'skill-command-contract'
  | 'skill-prompt-contract'
  | 'skill-registry-inventory'
  | 'tool-access-contract'
  | 'tool-contract'
  | 'tool-event-contract'
  | 'tool-result-shape-contract'
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
const EVAL_TURN_ID = 'promptfoo-eval-turn';
const EVAL_USER_ID = 'promptfoo-eval-user';
const WEB_CHAT_ROUTE_PATH = '/api/chat';
const CHAT_CONFIRM_ROUTE_PATHS = {
  'album-art-apply': '/api/chat/album-art/apply',
  'confirm-edit': '/api/chat/confirm-edit',
  'confirm-link': '/api/chat/confirm-link',
  'confirm-remove-link': '/api/chat/confirm-remove-link',
} as const;
const WEB_CHAT_REQUEST_ID = 'promptfoo-web-chat-route';
const CHAT_CONFIRM_REQUEST_ID = 'promptfoo-chat-confirm-route';
const WEB_CHAT_EVAL_EPOCH_SECONDS = 1_700_000_000;
const MOBILE_CHAT_ROUTE_PATH = '/api/mobile/v1/chat/turns';
const ONBOARDING_WELCOME_CHAT_ROUTE_PATH = '/api/onboarding/welcome-chat';
const MAX_WEB_MESSAGES_PER_REQUEST = 50;
const MAX_WEB_MESSAGE_LENGTH = 4000;
const MAX_ONBOARDING_MESSAGES_PER_REQUEST = 50;
const MAX_ONBOARDING_MESSAGE_LENGTH = 4000;
const MAX_MOBILE_TEXT_LENGTH = 4000;
const MAX_WELCOME_INITIAL_REPLY_LENGTH = 2000;
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
const EVAL_PROVIDER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EVAL_PROVIDER_DIR, '..', '..', '..', '..', '..');
const HTTP_EVAL_MAX_RESPONSE_CHARS = 4000;
const HTTP_EVAL_TIMEOUT_MS = 15_000;
const HTTP_EVAL_PERSISTENCE_WAIT_MS = 5000;
const HTTP_EVAL_DEFAULT_PERSONA = 'creator-ready';
const REQUIRED_WEB_CHAT_PREMODEL_CASES = [
  'deterministic-profile-name-intent',
  'deterministic-profile-bio-intent',
  'deterministic-social-link-url-intent',
  'deterministic-social-link-removal-intent',
  'deterministic-avatar-upload-intent',
  'client-turn-duplicate-in-progress',
  'client-turn-duplicate-completed-replay',
  'client-turn-duplicate-completed-tool-replay',
  'reserved-turn-rate-limit-terminal',
  'reserved-turn-album-art-unavailable',
] as const;
const REQUIRED_ONBOARDING_ROUTE_PREMODEL_CASES = [
  'onboarding-invalid-role-message',
  'onboarding-missing-user-message',
  'onboarding-oversized-user-text',
  'onboarding-too-many-messages',
  'onboarding-chat-disabled',
  'onboarding-session-secret-missing',
  'onboarding-turnstile-unconfigured',
  'onboarding-turnstile-required',
  'onboarding-persistence-unavailable',
  'onboarding-dispatch-contract',
] as const;
const REQUIRED_CHAT_CONFIRM_ROUTE_CASES = [
  'album-art-apply-feature-disabled',
  'album-art-apply-invalid-request',
  'album-art-apply-plan-unavailable',
  'album-art-apply-success',
  'confirm-edit-ownership-mismatch',
  'confirm-edit-success',
  'confirm-edit-unauthorized',
  'confirm-link-rejects-unsafe-url',
  'confirm-link-success',
  'confirm-remove-link-invalid-request',
  'confirm-remove-link-link-not-found',
  'confirm-remove-link-success',
] as const;
const REQUIRED_LIVE_HTTP_CASES = [
  'album-art-unavailable',
  'anonymous-onboarding-rate-limit-unavailable',
  'client-turn-requires-profile',
  'deterministic-replay',
  'invalid-json',
  'missing-context',
  'model-provider-terminal-error',
  'unauthorized',
] as const;
const LIVE_MODEL_COST_TIERS = ['live'] as const;
const LIVE_HTTP_COST_TIERS = [
  'live-http',
  'live-model-error',
  'live-rate-limit',
] as const;
const ALLOWED_EVAL_COST_TIERS = [
  'deterministic',
  ...LIVE_MODEL_COST_TIERS,
  ...LIVE_HTTP_COST_TIERS,
] as const;
const LIVE_MODEL_TARGETS = ['chat-turn'] as const;
const LIVE_HTTP_TARGETS = ['web-chat-http-route'] as const;

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
      sourceUrl: z
        .string()
        .url()
        .refine(value => value.startsWith('https://'), {
          message: 'sourceUrl must be https',
        })
        .optional(),
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
      'Generate one destination-aware release pitch. Ask where to pitch it if unclear.',
    inputSchema: z.object({
      releaseTitle: z.string().max(200).optional(),
      releaseId: z.string().uuid().optional(),
      target: z
        .enum([
          'playlist',
          'radio',
          'sirius_xm',
          'install',
          'playback',
          'editorial_post',
          'record_label',
          'collaborator',
        ])
        .optional(),
      platform: z
        .enum(['spotify', 'apple_music', 'amazon_music', 'music_supervisor'])
        .optional(),
      taskTitle: z.string().max(200).optional(),
      taskCategory: z.string().max(100).optional(),
      instructions: z.string().max(700).optional(),
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
const REQUIRED_TOOL_RESULT_SHAPE_CASES = ['success-failure-matrix'] as const;
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
  'importBioFromUrl',
  'proposeSocialLink',
  'proposeSocialLinkRemoval',
] as const;
const REQUIRED_MODEL_ROUTING_SCENARIOS = [
  'complex-pro-strategy-primary',
  'force-light-override',
  'free-no-tool-light',
  'long-pro-conversation-primary',
  'simple-pro-tool-light',
] as const;
const REQUIRED_ONBOARDING_STATE_CASES = [
  'latest-signal-instant-access',
  'spotify-followers-instant-access',
  'weak-signal-force-waitlist',
  'weak-signal-needs-more-info',
] as const;
const REQUIRED_ONBOARDING_TOOL_SEQUENCE_CASES = [
  'checkout-blocked-before-instant-access',
  'instant-access-next-step-before-checkout',
  'premature-next-step-blocked-before-identity',
  'spotify-confirmation-observation-next-step',
  'waitlist-outcome-no-checkout',
] as const;
const REQUIRED_WELCOME_CHAT_CASES = [
  'claims-current-session-orphan-before-creating-new',
  'creates-new-welcome-chat-with-route-panel-profile-from-onboarding',
  'does-not-claim-orphan-from-other-user-or-attached-profile',
  'existing-conversation-retry-does-not-duplicate-initial-reply',
  'existing-conversation-reuses-and-appends-once',
  'initial-reply-too-long-400',
  'missing-profile-404',
] as const;
const REQUIRED_KNOWLEDGE_CASES = [
  'monetization-only',
  'no-false-positive-had',
  'onboarding-skips-knowledge',
  'recent-user-turn-window',
  'release-playlist-topic-cap',
] as const;
const REQUIRED_PROMPT_CONTEXT_CASES = [
  'analytics-guardrails',
  'billing-drift-guidance',
  'billing-unavailable-guard',
  'free-plan-limitations',
  'no-account-context',
  'pro-verified-account',
  'release-overflow-cap',
] as const;
const REQUIRED_TOOL_ACCESS_CASES = ['billing-mode-matrix'] as const;
const REQUIRED_SKILL_ARTIFACT_CASES = ['artifact-inventory'] as const;
const REQUIRED_SKILL_CATALOG_CASES = ['catalog-sync-shape'] as const;
const REQUIRED_SKILL_COMMAND_CASES = ['command-inventory'] as const;
const REQUIRED_SKILL_PROMPT_CASES = ['release-pitch-retouch-prompts'] as const;
const REQUIRED_SKILL_REGISTRY_CASES = ['registry-inventory'] as const;
const REQUIRED_AI_TOOL_PROMPT_CASES = ['album-art-canvas-bio-prompts'] as const;
const AI_TOOL_PROMPT_TOOL_NAMES = [
  'generateAlbumArt',
  'generateCanvasPlan',
  'writeWorldClassBio',
] as const;
const SKILLS_CATALOG_SYNC_SCRIPT_PATH =
  'apps/web/scripts/sync-skills-catalog.ts';
const WEB_PACKAGE_JSON_PATH = 'apps/web/package.json';
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
const SKILL_REGISTRY_IDS = Object.keys(SKILL_REGISTRY).sort();
const ALL_EVAL_TOOL_NAME_SET = new Set<string>(ALL_EVAL_TOOL_NAMES);
const PAID_TOOL_NAME_SET = new Set<string>(PAID_TOOL_NAMES);
const TOOL_UI_REGISTRY_NAME_SET = new Set<string>(TOOL_UI_REGISTRY_NAMES);
const TOOL_RESULT_REQUIRED_KEYS: Record<string, readonly string[]> = {
  checkCanvasStatus: ['success', 'summary', 'releases'],
  checkHandle: ['action', 'handle', 'available', 'summary'],
  confirmSpotifyArtist: ['action', 'spotifyArtistId', 'artist', 'summary'],
  createMerch: ['success', 'action', 'generationId', 'options'],
  createPromoStrategy: [
    'success',
    'action',
    'releaseTitle',
    'strategy',
    'summary',
  ],
  createRelease: ['success', 'action', 'release', 'summary'],
  deleteOrArchiveMerchCard: ['success', 'action', 'merchCardId'],
  formatLyrics: ['success', 'action', 'formattedLyrics', 'summary'],
  generateAlbumArt: ['success', 'action', 'releaseTitle', 'options'],
  generateCanvasPlan: ['success', 'action', 'releaseTitle', 'plan', 'summary'],
  generateReleasePitch: [
    'success',
    'action',
    'releaseTitle',
    'pitch',
    'summary',
  ],
  importBioFromUrl: ['ok', 'candidateBio', 'sourceUrl', 'sourceTitle'],
  markCanvasUploaded: ['success', 'action', 'releaseTitle', 'summary'],
  openBillingPortal: ['success', 'portalUrl', 'fallbackUrl'],
  optimizeMerchCards: ['success', 'action', 'optimized'],
  pauseMerchCard: ['success', 'action', 'merchCardId'],
  previewMerchOptions: ['success', 'action', 'generationId', 'options'],
  proposeAvatarUpload: ['success', 'action'],
  proposeCheckout: ['action', 'plan', 'handoffUrl', 'summary'],
  proposeNextStep: ['action', 'decision', 'summary'],
  proposeProfileEdit: ['success', 'action', 'field', 'newValue'],
  proposeSocialLink: [
    'success',
    'action',
    'normalizedUrl',
    'originalUrl',
    'platform',
    'suggestedTitle',
  ],
  proposeSocialLinkRemoval: ['success', 'action', 'platform', 'url'],
  publishMerchCard: ['success', 'action', 'merchCardId'],
  recordInterviewSignal: ['action', 'signalCount', 'summary'],
  reorderMerchCards: ['success', 'action', 'merchCardIds'],
  searchSpotifyArtist: ['action', 'query', 'candidates', 'summary'],
  selectMerchDesign: ['success', 'action', 'generationId'],
  showAccountStatus: [
    'success',
    'plan',
    'billingVerified',
    'merchAccess',
    'nextAction',
  ],
  showArtistPayouts: ['success', 'pendingLiabilityCents', 'automaticPayout'],
  showMerchSales: ['success', 'grossRevenueCents', 'orders', 'topItem'],
  showTopInsights: ['success', 'title', 'totalActive', 'insights'],
  showUsage: ['success', 'period', 'limit', 'used', 'remaining', 'resetsAt'],
  submitFeedback: ['success', 'message'],
  suggestRelatedArtists: ['success', 'action', 'artists', 'summary'],
  unpauseMerchCard: ['success', 'action', 'merchCardId'],
  writeWorldClassBio: ['success', 'action', 'bio', 'summary'],
};
const SENSITIVE_RESULT_KEY_PATTERN =
  /(?:api[_-]?key|authorization|cookie|password|secret|session|token)/i;
const SENSITIVE_RESULT_VALUE_PATTERN =
  /(?:sk-[a-z0-9_-]{12,}|pk_[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i;

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
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
    value === 'ai-tool-prompt-contract' ||
    value === 'chat-confirm-route' ||
    value === 'eval-case-inventory' ||
    value === 'knowledge-contract' ||
    value === 'mobile-chat-route' ||
    value === 'model-contract' ||
    value === 'onboarding-welcome-chat-contract' ||
    value === 'onboarding-state-contract' ||
    value === 'onboarding-tool-sequence-contract' ||
    value === 'prompt-context-contract' ||
    value === 'skill-artifact-contract' ||
    value === 'skill-catalog-sync-contract' ||
    value === 'skill-command-contract' ||
    value === 'skill-prompt-contract' ||
    value === 'skill-registry-inventory' ||
    value === 'tool-access-contract' ||
    value === 'tool-contract' ||
    value === 'tool-event-contract' ||
    value === 'tool-result-shape-contract' ||
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

type ChatConfirmRoute = keyof typeof CHAT_CONFIRM_ROUTE_PATHS;

const CONFIRM_EDIT_SCHEMA = z.object({
  profileId: z.string().uuid(),
  field: z.enum(['displayName', 'bio']),
  newValue: z.string(),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
});

const CONFIRM_LINK_SCHEMA = z.object({
  profileId: z.string().uuid(),
  platform: z.string().min(1),
  url: httpUrlSchema,
  normalizedUrl: httpUrlSchema,
});

const CONFIRM_REMOVE_LINK_SCHEMA = z.object({
  profileId: z.string().uuid(),
  linkId: z.string().uuid(),
});

const ALBUM_ART_APPLY_SCHEMA = z.object({
  profileId: z.string().uuid(),
  releaseId: z.string().uuid(),
  generationId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

function toChatConfirmRoute(value: unknown): ChatConfirmRoute {
  if (
    value === 'album-art-apply' ||
    value === 'confirm-edit' ||
    value === 'confirm-link' ||
    value === 'confirm-remove-link'
  ) {
    return value;
  }

  return 'confirm-edit';
}

function buildDefaultChatConfirmBody(
  route: ChatConfirmRoute,
  body: Record<string, unknown>
): Record<string, unknown> {
  const base = (() => {
    switch (route) {
      case 'album-art-apply':
        return {
          profileId: EVAL_PROFILE_ID,
          releaseId: '00000000-0000-4000-8000-000000002571',
          generationId: '00000000-0000-4000-8000-000000002572',
          candidateId: '00000000-0000-4000-8000-000000002573',
        };
      case 'confirm-link':
        return {
          profileId: EVAL_PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/lunawaves',
          normalizedUrl: 'https://instagram.com/lunawaves',
        };
      case 'confirm-remove-link':
        return {
          profileId: EVAL_PROFILE_ID,
          linkId: '00000000-0000-4000-8000-000000002574',
        };
      case 'confirm-edit':
        return {
          profileId: EVAL_PROFILE_ID,
          field: 'displayName',
          newValue: 'Luna Waves',
          conversationId: '00000000-0000-4000-8000-000000002575',
          messageId: '00000000-0000-4000-8000-000000002576',
        };
    }
  })();

  return { ...base, ...body };
}

function evaluateChatConfirmRouteContract(vars: EvalVars) {
  const route = toChatConfirmRoute(vars.confirmRoute);
  const body = buildDefaultChatConfirmBody(route, toObject(vars.body));
  const authenticated = toBoolean(vars.authenticated, true);
  const requestId =
    typeof vars.requestId === 'string' && vars.requestId.trim().length > 0
      ? vars.requestId.trim().slice(0, 120)
      : CHAT_CONFIRM_REQUEST_ID;
  const headers = { 'x-request-id': requestId };
  const basePayload = {
    target: 'chat-confirm-route',
    adapter: 'route-contract',
    productionPath: CHAT_CONFIRM_ROUTE_PATHS[route],
    productionHandler:
      route === 'album-art-apply'
        ? 'apps/web/app/api/chat/album-art/apply/route.ts'
        : `apps/web/app/api/chat/${route}/route.ts`,
    routeImportAvailable: false,
    routeImportGap:
      'Promptfoo runs outside the Next/Clerk/DB server context, so this eval mirrors checked-in chat confirmation route contracts instead of importing POST directly.',
    request: {
      authenticated,
      body,
      confirmRoute: route,
      confirmRouteCase:
        typeof vars.confirmRouteCase === 'string'
          ? vars.confirmRouteCase
          : undefined,
      invalidJson: toBoolean(vars.invalidJson, false),
      profileLookup:
        typeof vars.profileLookup === 'string' ? vars.profileLookup : 'found',
      ownerMatched: toBoolean(vars.ownerMatched, true),
      linkLookup:
        typeof vars.linkLookup === 'string' ? vars.linkLookup : 'found',
      albumArtFeature:
        typeof vars.albumArtFeature === 'string'
          ? vars.albumArtFeature
          : 'enabled',
      albumArtEntitled: toBoolean(vars.albumArtEntitled, true),
      albumArtApplyOutcome:
        typeof vars.albumArtApplyOutcome === 'string'
          ? vars.albumArtApplyOutcome
          : 'success',
    },
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    requestId,
  };
  const response = (status: number, responseJson: Record<string, unknown>) => ({
    ...basePayload,
    status,
    headers,
    responseJson,
    responseText: JSON.stringify(responseJson),
  });

  if (!authenticated) {
    return response(401, { error: 'Unauthorized' });
  }

  if (route === 'album-art-apply') {
    if (vars.albumArtFeature === 'disabled') {
      return response(404, {
        error: 'Album art generation is currently unavailable.',
      });
    }
    if (toBoolean(vars.albumArtEntitled, true) === false) {
      return response(403, {
        error: 'Album art generation requires a Pro plan.',
      });
    }
  }

  if (toBoolean(vars.invalidJson, false)) {
    return response(400, { error: 'Invalid JSON body' });
  }

  if (route === 'confirm-edit') {
    const parsed = CONFIRM_EDIT_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return response(400, {
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    if (vars.profileLookup === 'missing') {
      return response(404, { error: 'Profile not found' });
    }
    if (toBoolean(vars.ownerMatched, true) === false) {
      return response(403, { error: 'Unauthorized - not your profile' });
    }

    return {
      ...response(200, {
        success: true,
        field: parsed.data.field,
        newValue: parsed.data.newValue,
      }),
      profileUpdateWouldBeAttempted: true,
      auditWouldBeWritten: true,
      auditAction: 'profile_edit',
      ownershipModel: 'creator-profile-user-id',
      oldValueStubbed: true,
      persistenceStubbed: true,
    };
  }

  if (route === 'confirm-link') {
    const parsed = CONFIRM_LINK_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return response(400, {
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    if (vars.profileLookup === 'missing') {
      return response(404, { error: 'Profile not found' });
    }
    if (toBoolean(vars.ownerMatched, true) === false) {
      return response(403, { error: 'Unauthorized - not your profile' });
    }

    const urlValidation = validateSocialLinkUrl(parsed.data.normalizedUrl);
    if (!urlValidation.valid) {
      return response(400, {
        error: urlValidation.error ?? 'Invalid URL',
      });
    }

    const detected = detectPlatform(parsed.data.normalizedUrl);
    if (!detected.isValid) {
      return response(400, {
        error: detected.error ?? 'Unsupported platform URL',
      });
    }

    const linkId =
      typeof vars.existingLinkId === 'string'
        ? vars.existingLinkId
        : '00000000-0000-4000-8000-000000002577';

    return {
      ...response(200, {
        success: true,
        platform: detected.platform.id,
        linkId,
      }),
      socialLinkWriteWouldBeAttempted: true,
      socialLinkAction: toBoolean(vars.existingLink, false)
        ? 'update_existing'
        : 'insert_new',
      detectedPlatform: detected.platform.id,
      normalizedUrl: detected.normalizedUrl,
      auditWouldBeWritten: true,
      auditAction: 'add_social_link',
      syncPrimaryMusicUrlsWouldBeAttempted: true,
      ownershipModel: 'creator-profile-clerk-id-join',
      persistenceStubbed: true,
    };
  }

  if (route === 'confirm-remove-link') {
    const parsed = CONFIRM_REMOVE_LINK_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return response(400, {
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    if (vars.profileLookup === 'missing') {
      return response(404, { error: 'Profile not found' });
    }
    if (toBoolean(vars.ownerMatched, true) === false) {
      return response(403, { error: 'Unauthorized - not your profile' });
    }
    if (vars.linkLookup === 'missing') {
      return response(404, { error: 'Link not found' });
    }

    return {
      ...response(200, { success: true, platform: 'instagram' }),
      socialLinkWriteWouldBeAttempted: true,
      socialLinkAction: 'soft_delete',
      linkStateWouldBecome: 'rejected',
      linkActiveWouldBecome: false,
      auditWouldBeWritten: true,
      auditAction: 'remove_social_link',
      syncPrimaryMusicUrlsWouldBeAttempted: true,
      ownershipModel: 'creator-profile-user-id',
      persistenceStubbed: true,
    };
  }

  const parsed = ALBUM_ART_APPLY_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return response(400, {
      error: 'Invalid request',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  if (vars.albumArtApplyOutcome === 'not-found') {
    return response(404, { error: 'Generated album art not found' });
  }

  return {
    ...response(200, {
      success: true,
      releaseId: parsed.data.releaseId,
      generationId: parsed.data.generationId,
      candidateId: parsed.data.candidateId,
      artworkUrl: 'https://cdn.jov.ie/eval/album-art-applied.jpg',
    }),
    albumArtApplyWouldBeAttempted: true,
    albumArtResultStubbed: true,
    persistenceStubbed: true,
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

function extractLastWebUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';

  const lastUserMessage = [...messages]
    .reverse()
    .find(
      (message): message is { role: 'user'; parts: unknown } =>
        Boolean(message) &&
        typeof message === 'object' &&
        (message as { role?: unknown }).role === 'user'
    );

  return extractWebMessageText(lastUserMessage?.parts).trim();
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

type WebChatClientTurnReservation =
  | 'created'
  | 'duplicate_completed'
  | 'duplicate_in_progress';

function toWebChatClientTurnReservation(
  value: unknown
): WebChatClientTurnReservation {
  if (
    value === 'created' ||
    value === 'duplicate_completed' ||
    value === 'duplicate_in_progress'
  ) {
    return value;
  }

  return 'created';
}

function buildEvalReservedTurn(body: Record<string, unknown>) {
  return {
    conversationId:
      toNullableString(body.conversationId) ?? EVAL_CONVERSATION_ID,
    turnId: EVAL_TURN_ID,
  };
}

function buildEvalAlbumArtCapability(vars: EvalVars): AlbumArtCapability {
  if (vars.albumArtCapability === 'available') {
    return {
      availability: 'available',
      reason: null,
      reasonCode: null,
    };
  }

  if (vars.albumArtCapability === 'feature-disabled') {
    return {
      availability: 'unavailable',
      reason: 'Album art generation is not enabled for this workspace.',
      reasonCode: 'FEATURE_DISABLED',
    };
  }

  if (vars.albumArtCapability === 'plan-unavailable') {
    return {
      availability: 'unavailable',
      reason: 'Album art generation requires a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    };
  }

  return {
    availability: 'unavailable',
    reason: 'Album art generation is temporarily unavailable.',
    reasonCode: 'PROVIDER_UNAVAILABLE',
  };
}

function buildStubbedIntentResult(intent: DetectedIntent): {
  readonly success: boolean;
  readonly message: string;
  readonly clientAction?: string;
  readonly data?: Record<string, unknown>;
  readonly persistenceWouldBeAttempted: boolean;
} | null {
  const { platform, url, value } = intent.extractedData;

  if (intent.category === IntentCategory.PROFILE_UPDATE_NAME) {
    if (!value) {
      return {
        success: false,
        message: 'I need a name to set. What should your display name be?',
        persistenceWouldBeAttempted: false,
      };
    }

    return {
      success: true,
      message: `Done! Your display name is now "${value}".`,
      data: { displayName: value },
      persistenceWouldBeAttempted: true,
    };
  }

  if (intent.category === IntentCategory.PROFILE_UPDATE_BIO) {
    if (!value) {
      return {
        success: false,
        message: 'I need the bio text. What should your bio say?',
        persistenceWouldBeAttempted: false,
      };
    }

    return {
      success: true,
      message: 'Done! Your bio has been updated.',
      data: { bio: value },
      persistenceWouldBeAttempted: true,
    };
  }

  if (intent.category === IntentCategory.LINK_ADD) {
    if (url) {
      return {
        success: true,
        message: "I'll add that link for you.",
        clientAction: 'propose_social_link',
        data: { platform: platform || '', url },
        persistenceWouldBeAttempted: false,
      };
    }

    if (platform) {
      return {
        success: true,
        message: `To add your ${platform} link, please paste the URL.`,
        clientAction: 'prompt_link_url',
        data: { platform },
        persistenceWouldBeAttempted: false,
      };
    }

    return {
      success: false,
      message:
        'Which platform would you like to add? (e.g., Instagram, Spotify, TikTok)',
      persistenceWouldBeAttempted: false,
    };
  }

  if (intent.category === IntentCategory.LINK_REMOVE) {
    if (!platform) {
      return {
        success: false,
        message: 'Which link would you like to remove?',
        persistenceWouldBeAttempted: false,
      };
    }

    return {
      success: true,
      message: `I'll remove your ${platform} link.`,
      clientAction: 'propose_social_link_removal',
      data: { platform },
      persistenceWouldBeAttempted: false,
    };
  }

  if (intent.category === IntentCategory.AVATAR_UPLOAD) {
    return {
      success: true,
      message: "Let's update your profile photo. Use the uploader below.",
      clientAction: 'propose_avatar_upload',
      persistenceWouldBeAttempted: false,
    };
  }

  return null;
}

function buildReplayToolEvents(value: unknown): PersistedToolEvent[] {
  if (value === 'social-link-success') {
    return [
      toolEvent('proposeSocialLink', {
        toolCallId: 'replay-social-link-1',
        input: {
          platform: 'instagram',
          url: 'https://instagram.com/lunawaves',
        },
        output: syntheticArtifactOutputFor('proposeSocialLink'),
        summary: 'Instagram link proposal is ready.',
        uiHint: 'artifact',
      }),
    ];
  }

  return [];
}

function validateOnboardingRouteMessages(messages: unknown[]): string | null {
  if (messages.length === 0) {
    return 'messages array must be non-empty';
  }

  for (let index = 0; index < messages.length; index += 1) {
    const shapeError = validateOnboardingMessageShape(messages[index], index);
    if (shapeError) return shapeError;

    const parts = (messages[index] as { parts: unknown[] }).parts;
    const partsError = validateOnboardingTextPartLengths(parts, index);
    if (partsError) return partsError;
  }

  return null;
}

function validateOnboardingMessageShape(
  message: unknown,
  index: number
): string | null {
  if (!message || typeof message !== 'object') {
    return `messages[${index}] must be an object`;
  }

  const candidate = message as { role?: unknown; parts?: unknown };
  if (
    candidate.role !== 'user' &&
    candidate.role !== 'assistant' &&
    candidate.role !== 'system'
  ) {
    return `messages[${index}].role must be user/assistant/system`;
  }
  if (!Array.isArray(candidate.parts)) {
    return `messages[${index}].parts must be an array`;
  }

  return null;
}

function validateOnboardingTextPartLengths(
  parts: unknown[],
  messageIndex: number
): string | null {
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if ((part as { type?: unknown }).type !== 'text') continue;

    const text = (part as { text?: unknown }).text;
    if (
      typeof text === 'string' &&
      text.length > MAX_ONBOARDING_MESSAGE_LENGTH
    ) {
      return `messages[${messageIndex}] text part exceeds ${MAX_ONBOARDING_MESSAGE_LENGTH} chars`;
    }
  }

  return null;
}

function hasOnboardingUserMessage(messages: unknown[]): boolean {
  return messages.some(
    message =>
      Boolean(message) &&
      typeof message === 'object' &&
      (message as { role?: unknown }).role === 'user'
  );
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
  if (toMode(vars.mode) === 'onboarding' && body.mode === undefined) {
    body.mode = 'onboarding';
  }
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
  const mode = body.mode === 'onboarding' ? 'onboarding' : toMode(vars.mode);
  const basePayload = {
    target: 'web-chat-route',
    adapter: 'route-contract',
    productionPath: WEB_CHAT_ROUTE_PATH,
    productionHandler: 'apps/web/app/api/chat/route.ts',
    routeImportAvailable: false,
    routeImportGap:
      'Promptfoo runs outside the Next/Clerk/DB server context, so this eval mirrors checked-in /api/chat pre-model route contracts instead of importing POST directly.',
    request: {
      mode,
      authenticated,
      body,
      billingVerification:
        typeof vars.billingVerification === 'string'
          ? vars.billingVerification
          : 'verified',
      chatDisabled: toBoolean(vars.chatDisabled, false),
      invalidJson: toBoolean(vars.invalidJson, false),
      rateLimited: toBoolean(vars.rateLimited, false),
      webRouteCase:
        typeof vars.webRouteCase === 'string' ? vars.webRouteCase : undefined,
      clientTurnReservation:
        typeof vars.clientTurnReservation === 'string'
          ? vars.clientTurnReservation
          : undefined,
      replayToolEvents:
        typeof vars.replayToolEvents === 'string'
          ? vars.replayToolEvents
          : undefined,
      albumArtCapability:
        typeof vars.albumArtCapability === 'string'
          ? vars.albumArtCapability
          : undefined,
      expectedIntentCategory:
        typeof vars.expectedIntentCategory === 'string'
          ? vars.expectedIntentCategory
          : undefined,
      expectedClientAction:
        typeof vars.expectedClientAction === 'string'
          ? vars.expectedClientAction
          : undefined,
      expectedSafeUrl:
        typeof vars.expectedSafeUrl === 'string'
          ? vars.expectedSafeUrl
          : undefined,
      expectedError:
        typeof vars.expectedError === 'string' ? vars.expectedError : undefined,
      expectedErrorCode:
        typeof vars.expectedErrorCode === 'string'
          ? vars.expectedErrorCode
          : undefined,
      expectedStatus:
        typeof vars.expectedStatus === 'number'
          ? vars.expectedStatus
          : undefined,
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

  if (mode === 'onboarding') {
    const onboardingHeaders = {
      ...responseHeaders,
      'x-chat-mode': 'onboarding',
    };
    const response = (
      status: number,
      responseJson: Record<string, unknown>
    ) => ({
      ...basePayload,
      status,
      headers: onboardingHeaders,
      responseJson,
      responseText: JSON.stringify(responseJson),
    });

    if (
      body.mode !== 'onboarding' ||
      (body.turnstileToken !== undefined &&
        typeof body.turnstileToken !== 'string') ||
      (body.messages !== undefined && !Array.isArray(body.messages)) ||
      (Array.isArray(body.messages) &&
        body.messages.length > MAX_ONBOARDING_MESSAGES_PER_REQUEST)
    ) {
      return response(400, {
        error: 'Invalid onboarding chat request',
        errorCode: 'INVALID_ONBOARDING_PAYLOAD',
        requestId,
      });
    }

    if (toBoolean(vars.chatDisabled, false)) {
      return response(503, {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'ONBOARDING_CHAT_DISABLED',
        requestId,
      });
    }

    const existingSession = toBoolean(vars.existingOnboardingSession, true);
    if (
      !existingSession &&
      toBoolean(vars.sessionSecretConfigured, true) === false
    ) {
      return response(503, {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'SESSION_SECRET_NOT_CONFIGURED',
        requestId,
      });
    }
    if (
      !existingSession &&
      toBoolean(vars.turnstileConfigured, true) === false
    ) {
      return response(503, {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'TURNSTILE_NOT_CONFIGURED',
        requestId,
      });
    }
    if (!existingSession && toBoolean(vars.turnstileVerified, true) === false) {
      return response(403, {
        error: 'Bot challenge failed',
        errorCode: 'TURNSTILE_REQUIRED',
        reason: 'invalid-input-response',
        requestId,
      });
    }

    if (toBoolean(vars.rateLimited, false)) {
      const retryAfter = 60;
      const responseJson = {
        error: 'Rate limit exceeded',
        message:
          typeof vars.rateLimitReason === 'string'
            ? vars.rateLimitReason
            : 'Too many onboarding messages. Please retry in a few minutes.',
        errorCode: 'RATE_LIMITED',
        requestId,
      };

      return {
        ...basePayload,
        status: 429,
        headers: {
          ...onboardingHeaders,
          ...buildRateLimitHeaders(retryAfter),
        },
        responseJson,
        responseText: JSON.stringify(responseJson),
      };
    }

    const rawMessages = (body.messages ?? []) as unknown[];
    const messagesError = validateOnboardingRouteMessages(rawMessages);
    if (messagesError) {
      return response(400, {
        error: messagesError,
        errorCode: 'INVALID_MESSAGES',
        requestId,
      });
    }

    if (!hasOnboardingUserMessage(rawMessages)) {
      return response(400, {
        error: 'messages array must include a user message',
        errorCode: 'INVALID_MESSAGES',
        requestId,
      });
    }

    if (vars.onboardingPersistence === 'unavailable') {
      return {
        ...response(503, {
          error: 'Onboarding chat is temporarily unavailable',
          errorCode: 'ONBOARDING_CHAT_PERSISTENCE_FAILED',
          requestId,
        }),
        persistenceStubbed: true,
        persistenceWouldBeAttempted: true,
      };
    }

    const responseJson = {
      message:
        'This deterministic onboarding eval stops before model dispatch; use target=chat-turn for executeChatTurn behavior.',
      requestId,
    };

    return {
      ...basePayload,
      status: 200,
      headers: onboardingHeaders,
      contractOnly: true,
      productionEntrypoint: 'apps/web/lib/chat/run.ts:executeChatTurn',
      responseJson,
      responseText: JSON.stringify(responseJson),
      mode: 'onboarding',
      plan: 'free',
      selectedModel: CHAT_MODEL_LIGHT,
      modelBoundary: 'light',
      forceLightModel: true,
      availableToolNames: [...ONBOARDING_TOOLS],
      onboardingToolNames: [...ONBOARDING_TOOLS],
      modelDispatchPrevented: true,
      persistenceStubbed: true,
      persistenceWouldBeAttempted: true,
    };
  }

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

  const clientTurnId = toNullableString(body.clientTurnId);
  const clientMessageId = toNullableString(body.clientMessageId);
  const userText = extractLastWebUserText(body.messages);
  const toolIntent = toNullableString(body.toolIntent);
  let reservedTurn: {
    readonly conversationId: string;
    readonly turnId: string;
  } | null = null;

  if (clientTurnId && !profileId) {
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

  if (clientTurnId) {
    reservedTurn = buildEvalReservedTurn(body);
    const reservationOutcome = toWebChatClientTurnReservation(
      vars.clientTurnReservation
    );
    const reservationHeaders = {
      ...responseHeaders,
      'x-conversation-id': reservedTurn.conversationId,
      'x-chat-turn-id': reservedTurn.turnId,
    };

    if (reservationOutcome === 'duplicate_in_progress') {
      const responseJson = {
        error: 'TURN_IN_PROGRESS',
        message: 'This chat action is still in progress.',
        errorCode: 'TURN_IN_PROGRESS',
        requestId,
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
      };

      return {
        ...basePayload,
        status: 409,
        headers: reservationHeaders,
        responseJson,
        responseText: JSON.stringify(responseJson),
        clientTurnId,
        clientMessageId,
        reservationOutcome,
        reservationStubbed: true,
        persistenceWouldBeAttempted: true,
      };
    }

    if (reservationOutcome === 'duplicate_completed') {
      const replayToolEvents = buildReplayToolEvents(vars.replayToolEvents);
      const replayMessageParts = replayToolEvents.map(event =>
        toolEventToMessagePart(event)
      );
      const replayText =
        typeof vars.replayText === 'string' && vars.replayText.length > 0
          ? vars.replayText
          : replayToolEvents.length > 0
            ? ''
            : 'This chat action already finished. Please send a new message if you need anything else.';
      const responseJson = {
        message: replayText,
        requestId,
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
        toolEventCount: replayToolEvents.length,
      };

      return {
        ...basePayload,
        status: 200,
        headers: {
          ...reservationHeaders,
          'x-chat-replay': 'true',
        },
        responseJson,
        responseText: replayText,
        text: replayText,
        replayToolEvents,
        replayMessageParts,
        clientTurnId,
        clientMessageId,
        reservationOutcome,
        replayed: true,
        reservationStubbed: true,
        persistenceWouldBeAttempted: true,
      };
    }
  }

  const albumArtCapability = buildEvalAlbumArtCapability(vars);
  if (
    reservedTurn &&
    albumArtCapability.availability !== 'available' &&
    detectAlbumArtGenerationIntent({ text: userText, toolIntent })
  ) {
    const replyText =
      buildAlbumArtUnavailableAssistantMessage(albumArtCapability);
    const responseJson = {
      message: replyText,
      errorCode: albumArtCapability.reasonCode ?? 'TOOL_UNAVAILABLE',
      reason: albumArtCapability.reason,
      requestId,
    };

    return {
      ...basePayload,
      status: 200,
      headers: {
        ...responseHeaders,
        'x-chat-preflight': 'album-art-unavailable',
        'x-conversation-id': reservedTurn.conversationId,
        'x-chat-turn-id': reservedTurn.turnId,
      },
      responseJson,
      responseText: replyText,
      text: replyText,
      clientTurnId,
      clientMessageId,
      reservationOutcome: 'created',
      reservationStubbed: true,
      persistenceStubbed: true,
      persistenceWouldBeAttempted: true,
      terminalPersistenceStatus: 'failed_tool_unavailable',
      terminalPersistenceErrorCode:
        albumArtCapability.reasonCode ?? 'TOOL_UNAVAILABLE',
      modelDispatchPrevented: true,
      albumArtCapability,
    };
  }

  if (toBoolean(vars.rateLimited, false)) {
    const billingUnavailable = vars.billingVerification === 'unavailable';
    const retryAfter = 60;
    const rateLimitMessage = billingUnavailable
      ? 'Jovie could not verify your billing status right now, so chat usage is temporarily limited. Please retry in a few minutes or open billing settings.'
      : 'You have reached your chat limit. Please try again later.';
    const responseJson = {
      error: 'Rate limit exceeded',
      message: rateLimitMessage,
      errorCode: 'RATE_LIMITED',
      retryAfter,
      requestId,
    };

    if (reservedTurn) {
      return {
        ...basePayload,
        status: 200,
        headers: {
          ...responseHeaders,
          ...buildRateLimitHeaders(retryAfter),
          'x-chat-terminal-failure': 'rate-limited',
          'x-conversation-id': reservedTurn.conversationId,
          'x-chat-turn-id': reservedTurn.turnId,
        },
        responseJson,
        responseText: rateLimitMessage,
        text: rateLimitMessage,
        clientTurnId,
        clientMessageId,
        reservationOutcome: 'created',
        reservationStubbed: true,
        persistenceStubbed: true,
        persistenceWouldBeAttempted: true,
        terminalPersistenceStatus: 'failed_model_error',
        terminalPersistenceErrorCode: 'RATE_LIMITED',
        modelDispatchPrevented: true,
      };
    }

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

  const detectedIntent = classifyIntent(userText);
  if (isDeterministicIntent(detectedIntent)) {
    const intentResult = buildStubbedIntentResult(detectedIntent);

    if (intentResult) {
      const responseJson = {
        message: intentResult.message,
        requestId,
        success: intentResult.success,
        clientAction: intentResult.clientAction,
        data: intentResult.data,
      };
      const intentPersistenceWouldBeAttempted =
        intentResult.persistenceWouldBeAttempted || Boolean(reservedTurn);

      return {
        ...basePayload,
        status: 200,
        headers: {
          ...responseHeaders,
          'x-intent-routed': 'true',
          'x-intent-category': detectedIntent.category,
          ...(reservedTurn
            ? {
                'x-conversation-id': reservedTurn.conversationId,
                'x-chat-turn-id': reservedTurn.turnId,
              }
            : {}),
        },
        responseJson,
        responseText: intentResult.message,
        text: intentResult.message,
        clientTurnId,
        clientMessageId,
        detectedIntent,
        intentResult,
        intentCategory: detectedIntent.category,
        modelDispatchPrevented: true,
        reservationOutcome: reservedTurn ? 'created' : null,
        reservationStubbed: Boolean(reservedTurn),
        persistenceStubbed: intentPersistenceWouldBeAttempted,
        persistenceWouldBeAttempted: intentPersistenceWouldBeAttempted,
        terminalPersistenceStatus: reservedTurn
          ? intentResult.success
            ? 'completed'
            : 'failed_model_error'
          : null,
      };
    }
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

type WelcomeMessage = {
  readonly role: 'assistant' | 'user';
  readonly content: string;
};

type WelcomeConversation = {
  readonly id: string;
  readonly userId: string;
  readonly creatorProfileId: string | null;
  readonly sessionId: string | null;
  readonly messages: readonly WelcomeMessage[];
};

function buildWelcomeChatRoute(conversationId: string): string {
  return `${APP_ROUTES.CHAT}/${conversationId}?panel=profile&from=onboarding`;
}

function defaultWelcomeInitialReply(welcomeCase: string): string {
  switch (welcomeCase) {
    case 'existing-conversation-reuses-and-appends-once':
    case 'existing-conversation-retry-does-not-duplicate-initial-reply':
      return 'Help me finish setting up Neon Reef.';
    case 'initial-reply-too-long-400':
      return 'x'.repeat(MAX_WELCOME_INITIAL_REPLY_LENGTH + 1);
    case 'creates-new-welcome-chat-with-route-panel-profile-from-onboarding':
      return 'I want to work on the Neon Reef release first.';
    default:
      return '';
  }
}

function welcomeExistingConversationForCase(
  welcomeCase: string,
  initialReply: string
): WelcomeConversation | null {
  if (welcomeCase === 'existing-conversation-reuses-and-appends-once') {
    return {
      id: 'conv_existing',
      userId: EVAL_USER_ID,
      creatorProfileId: EVAL_PROFILE_ID,
      sessionId: null,
      messages: [
        {
          role: 'assistant',
          content: 'Welcome to Jovie, Luna. What should we work on first?',
        },
      ],
    };
  }

  if (
    welcomeCase ===
    'existing-conversation-retry-does-not-duplicate-initial-reply'
  ) {
    return {
      id: 'conv_existing',
      userId: EVAL_USER_ID,
      creatorProfileId: EVAL_PROFILE_ID,
      sessionId: null,
      messages: [{ role: 'user', content: initialReply }],
    };
  }

  return null;
}

function welcomeOrphanCandidatesForCase(
  welcomeCase: string,
  onboardingSessionId: string | null
): WelcomeConversation[] {
  if (welcomeCase === 'claims-current-session-orphan-before-creating-new') {
    return [
      {
        id: 'conv_orphan_current',
        userId: EVAL_USER_ID,
        creatorProfileId: null,
        sessionId: onboardingSessionId,
        messages: [
          { role: 'user', content: 'I selected Luna Waves on Spotify.' },
        ],
      },
    ];
  }

  if (
    welcomeCase === 'does-not-claim-orphan-from-other-user-or-attached-profile'
  ) {
    return [
      {
        id: 'conv_other_user',
        userId: 'db_user_other',
        creatorProfileId: null,
        sessionId: onboardingSessionId,
        messages: [{ role: 'user', content: 'Other user setup.' }],
      },
      {
        id: 'conv_already_attached',
        userId: EVAL_USER_ID,
        creatorProfileId: 'profile_other',
        sessionId: onboardingSessionId,
        messages: [{ role: 'user', content: 'Already claimed setup.' }],
      },
    ];
  }

  return [];
}

function findEligibleWelcomeOrphan(
  candidates: readonly WelcomeConversation[],
  onboardingSessionId: string | null
): WelcomeConversation | null {
  return (
    candidates.find(candidate => {
      if (candidate.userId !== EVAL_USER_ID) return false;
      if (candidate.creatorProfileId !== null) return false;
      if (onboardingSessionId) {
        return candidate.sessionId === onboardingSessionId;
      }
      return candidate.sessionId !== null;
    }) ?? null
  );
}

function evaluateOnboardingWelcomeChatContract(vars: EvalVars) {
  const welcomeCase =
    typeof vars.welcomeCase === 'string'
      ? vars.welcomeCase
      : 'creates-new-welcome-chat-with-route-panel-profile-from-onboarding';
  const initialReply = (
    typeof vars.initialReply === 'string'
      ? vars.initialReply
      : defaultWelcomeInitialReply(welcomeCase)
  ).trim();
  const includeProfile = toBoolean(vars.includeProfile, true);
  const profileId = includeProfile ? EVAL_PROFILE_ID : null;
  const onboardingSessionId =
    typeof vars.onboardingSessionId === 'string'
      ? vars.onboardingSessionId
      : welcomeCase.includes('orphan')
        ? 'sess_eval_current'
        : null;
  const basePayload = {
    target: 'onboarding-welcome-chat-contract',
    adapter: 'route-contract',
    productionPath: ONBOARDING_WELCOME_CHAT_ROUTE_PATH,
    productionHandler: 'apps/web/app/api/onboarding/welcome-chat/route.ts',
    routeImportAvailable: false,
    routeImportGap:
      'Promptfoo runs outside the Next/Clerk/DB server context, so this eval mirrors checked-in /api/onboarding/welcome-chat decisions instead of importing POST directly.',
    request: {
      authenticated: true,
      userId: EVAL_USER_ID,
      profileId,
      initialReply,
      initialReplyLength: initialReply.length,
      onboardingSessionId,
    },
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
    welcomeCase,
    headers: NO_STORE_HEADERS,
  };
  const response = (
    status: number,
    responseJson: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ) => ({
    ...basePayload,
    status,
    responseJson,
    responseText: JSON.stringify(responseJson),
    ...extra,
  });

  if (!profileId) {
    return response(404, { error: 'Profile not found' });
  }

  if (initialReply.length > MAX_WELCOME_INITIAL_REPLY_LENGTH) {
    return response(400, {
      error: `Initial reply must be ${MAX_WELCOME_INITIAL_REPLY_LENGTH} characters or less.`,
    });
  }

  const existingConversation = welcomeExistingConversationForCase(
    welcomeCase,
    initialReply
  );
  if (existingConversation) {
    const lastMessage =
      existingConversation.messages[existingConversation.messages.length - 1] ??
      null;
    const shouldAppendInitialReply = Boolean(
      initialReply &&
        !(lastMessage?.role === 'user' && lastMessage.content === initialReply)
    );
    const insertedMessages = shouldAppendInitialReply
      ? [{ role: 'user', content: initialReply }]
      : [];
    const responseJson = {
      success: true,
      conversationId: existingConversation.id,
      route: buildWelcomeChatRoute(existingConversation.id),
      reused: true,
    };

    return response(200, responseJson, {
      reused: true,
      createdNew: false,
      existingConversationId: existingConversation.id,
      selectedConversationId: existingConversation.id,
      route: responseJson.route,
      appendedInitialReply: shouldAppendInitialReply,
      insertedMessages,
      updatedConversation: shouldAppendInitialReply,
      welcomeMessageBuilt: false,
      persistenceWouldBeAttempted: shouldAppendInitialReply,
    });
  }

  const orphanCandidates = welcomeOrphanCandidatesForCase(
    welcomeCase,
    onboardingSessionId
  );
  const eligibleOrphan = findEligibleWelcomeOrphan(
    orphanCandidates,
    onboardingSessionId
  );
  if (eligibleOrphan) {
    const responseJson = {
      success: true,
      conversationId: eligibleOrphan.id,
      route: buildWelcomeChatRoute(eligibleOrphan.id),
      reused: true,
    };

    return response(200, responseJson, {
      reused: true,
      createdNew: false,
      selectedConversationId: eligibleOrphan.id,
      claimedConversationId: eligibleOrphan.id,
      route: responseJson.route,
      orphanCandidateCount: orphanCandidates.length,
      eligibleOrphanCandidateCount: 1,
      unsafeOrphanCandidateCount: orphanCandidates.length - 1,
      claimFilter: {
        userId: EVAL_USER_ID,
        sessionId: onboardingSessionId,
        creatorProfileId: null,
      },
      insertedMessages: [],
      updatedConversation: true,
      welcomeMessageBuilt: false,
      persistenceWouldBeAttempted: true,
    });
  }

  const displayName =
    typeof vars.displayName === 'string' ? vars.displayName : 'Luna Waves';
  const releaseCount =
    typeof vars.releaseCount === 'number' ? vars.releaseCount : 3;
  const trackCount = typeof vars.trackCount === 'number' ? vars.trackCount : 12;
  const baseDspCount = typeof vars.dspCount === 'number' ? vars.dspCount : 1;
  const socialCount =
    typeof vars.socialCount === 'number' ? vars.socialCount : 2;
  const hasSpotifyIdentity = toBoolean(vars.hasSpotifyIdentity, true);
  const welcomeMessageParams = {
    displayName,
    releaseCount,
    trackCount,
    dspCount: baseDspCount + (hasSpotifyIdentity ? 1 : 0),
    socialCount,
    careerHighlights:
      typeof vars.careerHighlights === 'string' ? vars.careerHighlights : null,
  };
  const welcomeMessage = buildWelcomeMessage(welcomeMessageParams);
  const conversationId = 'conv_welcome_new';
  const insertedMessages = [
    { role: 'assistant', content: welcomeMessage },
    ...(initialReply ? [{ role: 'user', content: initialReply }] : []),
  ];
  const responseJson = {
    success: true,
    conversationId,
    route: buildWelcomeChatRoute(conversationId),
    reused: false,
  };

  return response(201, responseJson, {
    reused: false,
    createdNew: true,
    selectedConversationId: conversationId,
    claimedConversationId: null,
    route: responseJson.route,
    orphanCandidateCount: orphanCandidates.length,
    eligibleOrphanCandidateCount: 0,
    unsafeOrphanCandidateCount: orphanCandidates.length,
    insertedMessages,
    updatedConversation: true,
    welcomeMessageBuilt: true,
    welcomeMessage,
    welcomeMessageParams,
    persistenceWouldBeAttempted: true,
  });
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
  readonly body?: unknown;
  readonly rawBody?: string;
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
      body: input.rawBody ?? JSON.stringify(input.body),
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function readLiveHttpTurnStateEventually(input: {
  readonly dbUserId: string;
  readonly profileId: string;
  readonly clientTurnId: string;
}) {
  const terminalStatuses = new Set([
    'completed',
    'failed_model_error',
    'failed_tool_unavailable',
    'failed_timeout',
    'failed_network',
    'canceled',
  ]);
  const deadline = Date.now() + HTTP_EVAL_PERSISTENCE_WAIT_MS;
  let latest = await readLiveHttpTurnState(input);

  while (!terminalStatuses.has(latest?.status ?? '') && Date.now() < deadline) {
    await sleep(250);
    latest = await readLiveHttpTurnState(input);
  }

  return latest;
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

async function evaluateLiveHttpInvalidJson(baseUrl: URL, vars: EvalVars) {
  const persona =
    typeof vars.persona === 'string' && vars.persona.trim().length > 0
      ? vars.persona.trim()
      : HTTP_EVAL_DEFAULT_PERSONA;
  const session = await createLiveHttpSession(baseUrl, persona);
  const requestId = `promptfoo-http-invalid-json-${randomUUID()}`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId,
    session,
    rawBody: '{"messages":',
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'invalid-json',
    costTier: 'live-http',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    session: {
      persona: session.persona,
      userId: session.userId,
      dbUserId: session.dbUserId,
      profileId: session.profileId,
      profilePath: session.profilePath,
    },
    requestId,
    response,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpMissingContext(
  prompt: string,
  baseUrl: URL,
  vars: EvalVars
) {
  const persona =
    typeof vars.persona === 'string' && vars.persona.trim().length > 0
      ? vars.persona.trim()
      : HTTP_EVAL_DEFAULT_PERSONA;
  const session = await createLiveHttpSession(baseUrl, persona);
  const requestId = `promptfoo-http-missing-context-${randomUUID()}`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId,
    session,
    body: {
      messages: buildLiveHttpChatBody({ prompt }).messages,
    },
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'missing-context',
    costTier: 'live-http',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    session: {
      persona: session.persona,
      userId: session.userId,
      dbUserId: session.dbUserId,
      profileId: session.profileId,
      profilePath: session.profilePath,
    },
    requestId,
    response,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpClientTurnRequiresProfile(
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
      : `promptfoo-http-client-turn-${randomUUID()}`;
  const requestId = `${clientTurnId}-request`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId,
    session,
    body: {
      ...buildLiveHttpChatBody({
        prompt,
        clientTurnId,
        clientMessageId: `${clientTurnId}-message`,
      }),
      artistContext: buildTestArtistContext(),
    },
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'client-turn-requires-profile',
    costTier: 'live-http',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    session: {
      persona: session.persona,
      userId: session.userId,
      dbUserId: session.dbUserId,
      profileId: session.profileId,
      profilePath: session.profilePath,
    },
    clientTurnId,
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

async function evaluateLiveHttpOnboardingRateLimitUnavailable(
  prompt: string,
  baseUrl: URL
) {
  if (process.env.JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED !== '1') {
    throw new Error(
      'Set JOVIE_PROMPTFOO_EXPECT_REDIS_DISABLED=1 and start the local server with JOVIE_DISABLE_REDIS_FOR_EVALS=1 before running the live HTTP rate-limit eval.'
    );
  }

  const requestId = `promptfoo-http-onboarding-rate-limit-${randomUUID()}`;
  const response = await postLiveHttpChat({
    baseUrl,
    requestId,
    body: {
      mode: 'onboarding',
      messages: [
        {
          id: `${requestId}-message`,
          role: 'user',
          parts: [{ type: 'text', text: prompt }],
        },
      ],
    },
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'anonymous-onboarding-rate-limit-unavailable',
    costTier: 'live-rate-limit',
    text: response.responseText,
    selectedModel: null,
    modelCalled: false,
    modelDispatchPrevented: response.status === 429,
    persistenceAttempted: false,
    requestId,
    response,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

async function evaluateLiveHttpModelProviderTerminalError(
  prompt: string,
  baseUrl: URL,
  vars: EvalVars
) {
  if (process.env.JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED !== '1') {
    throw new Error(
      'Set JOVIE_PROMPTFOO_EXPECT_MODEL_KEYS_DISABLED=1 and start the local server with JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS=1 before running the live HTTP model-error eval.'
    );
  }

  const persona =
    typeof vars.persona === 'string' && vars.persona.trim().length > 0
      ? vars.persona.trim()
      : HTTP_EVAL_DEFAULT_PERSONA;
  const session = await createLiveHttpSession(baseUrl, persona);
  const clientTurnId =
    typeof vars.clientTurnId === 'string' && vars.clientTurnId.trim().length > 0
      ? vars.clientTurnId.trim()
      : `promptfoo-http-model-error-${randomUUID()}`;
  const body = buildLiveHttpChatBody({
    prompt,
    profileId: session.profileId,
    clientTurnId,
    clientMessageId: `${clientTurnId}-message`,
  });

  const first = await postLiveHttpChat({
    baseUrl,
    body,
    requestId: `${clientTurnId}-first`,
    session,
  });
  const stateAfterFirst = await readLiveHttpTurnStateEventually({
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
  const stateAfterReplay = await readLiveHttpTurnStateEventually({
    dbUserId: session.dbUserId,
    profileId: session.profileId,
    clientTurnId,
  });

  return {
    target: 'web-chat-http-route',
    adapter: 'live-http-route',
    productionPath: WEB_CHAT_ROUTE_PATH,
    httpCase: 'model-provider-terminal-error',
    costTier: 'live-model-error',
    text: first.responseText,
    selectedModel: null,
    modelCalled: false,
    modelDispatchAttempted: true,
    modelProviderKeysDisabled: true,
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

  if (httpCase === 'invalid-json') {
    return evaluateLiveHttpInvalidJson(baseUrl, vars);
  }

  if (httpCase === 'missing-context') {
    return evaluateLiveHttpMissingContext(prompt, baseUrl, vars);
  }

  if (httpCase === 'client-turn-requires-profile') {
    return evaluateLiveHttpClientTurnRequiresProfile(prompt, baseUrl, vars);
  }

  if (httpCase === 'deterministic-replay') {
    return evaluateLiveHttpDeterministicReplay(prompt, baseUrl, vars);
  }

  if (httpCase === 'album-art-unavailable') {
    return evaluateLiveHttpAlbumArtUnavailable(prompt, baseUrl, vars);
  }

  if (httpCase === 'anonymous-onboarding-rate-limit-unavailable') {
    return evaluateLiveHttpOnboardingRateLimitUnavailable(prompt, baseUrl);
  }

  if (httpCase === 'model-provider-terminal-error') {
    return evaluateLiveHttpModelProviderTerminalError(prompt, baseUrl, vars);
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

function stringArrayValue(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .sort();
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').sort()
    : [];
}

function userTextFromMessages(uiMessages: readonly UIMessage[]): string[] {
  return uiMessages
    .filter(message => message.role === 'user')
    .flatMap(message =>
      message.parts
        .filter(
          (part): part is { type: 'text'; text: string } =>
            part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => part.text)
    );
}

function selectedKnowledgeTopicIds(knowledgeContext: string): string[] {
  if (knowledgeContext.length === 0) return [];

  return KNOWLEDGE_TOPICS.filter(
    topic =>
      topic.content.length > 0 && knowledgeContext.includes(topic.content)
  )
    .map(topic => topic.id)
    .sort();
}

function evaluateKnowledgeContract(prompt: string, vars: EvalVars) {
  const knowledgeCase =
    typeof vars.knowledgeCase === 'string' ? vars.knowledgeCase : 'unspecified';
  const mode = toMode(vars.mode);
  const uiMessages = toUiMessages(prompt, vars);
  const userTexts = userTextFromMessages(uiMessages);
  const recentUserText = [...userTexts].reverse().slice(0, 3).join(' ');
  const knowledgeContext =
    mode === 'onboarding' ? '' : selectKnowledgeContextForTurn(uiMessages);
  const selectedTopicIds = selectedKnowledgeTopicIds(knowledgeContext);

  return {
    target: 'knowledge-contract',
    adapter: 'knowledge-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    mode,
    knowledgeCase,
    messageCount: uiMessages.length,
    userText: userTexts.join('\n'),
    recentUserText,
    knowledgeContextSelected: knowledgeContext.length > 0,
    knowledgeContextLength: knowledgeContext.length,
    selectedTopicIds,
    selectedTopicCount: selectedTopicIds.length,
    selectedTopicPreviews: KNOWLEDGE_TOPICS.filter(topic =>
      selectedTopicIds.includes(topic.id)
    ).map(topic => ({
      id: topic.id,
      preview: topic.content.slice(0, 180),
    })),
    expectedTopicIds: stringArrayValue(vars.expectedTopicIds),
    unexpectedTopicIds: stringArrayValue(vars.unexpectedTopicIds),
    expectedHasContext:
      typeof vars.expectedHasContext === 'boolean'
        ? vars.expectedHasContext
        : null,
    expectedMaxTopicCount:
      typeof vars.expectedMaxTopicCount === 'number'
        ? vars.expectedMaxTopicCount
        : 2,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
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

type SystemPromptOptions = NonNullable<Parameters<typeof buildSystemPrompt>[2]>;
type EvalAccountPromptContext = NonNullable<
  SystemPromptOptions['accountContext']
>;
type EvalSystemPromptReleases = Parameters<typeof buildSystemPrompt>[1];
type EvalBillingVerification = EvalAccountPromptContext['billingVerification'];

const SYSTEM_PROMPT_SECRET_PATTERN =
  /(AI_GATEWAY_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|VERCEL_OIDC_TOKEN|DATABASE_URL|CLERK_|UPSTASH_|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|postgres(?:ql)?:\/\/|stack trace|at\s+[A-Za-z0-9_.$]+\s*\()/gi;

function toPromptBillingVerification(value: unknown): EvalBillingVerification {
  if (
    value === 'verified' ||
    value === 'missing_user' ||
    value === 'unavailable'
  ) {
    return value;
  }

  return 'verified';
}

function displayPlanForPrompt(
  plan: PlanId,
  billingVerification: EvalBillingVerification
): string {
  if (billingVerification === 'unavailable') return 'Unverified';
  if (plan === 'trial') return 'Pro Trial';
  if (plan === 'max') return 'Max';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function buildEvalPromptAccountContext(
  vars: EvalVars
): EvalAccountPromptContext | undefined {
  if (vars.includeAccountContext === false) return undefined;

  const plan = toPlanId(vars.plan);
  const planLimits = getEntitlements(plan);
  const billingVerification = toPromptBillingVerification(
    vars.billingVerification
  );
  const dailyLimit = planLimits.limits.aiDailyMessageLimit;
  const used = typeof vars.usageUsed === 'number' ? vars.usageUsed : 7;
  const monthlyLimit =
    typeof vars.monthlyLimit === 'number' ? vars.monthlyLimit : dailyLimit * 30;
  const monthlyUsed =
    typeof vars.monthlyUsed === 'number' ? vars.monthlyUsed : used * 4;
  const planMismatch =
    vars.planMismatch === 'legacy-founding'
      ? {
          rawPlan: 'founding',
          normalizedPlan: 'pro',
          reason: 'legacy_alias',
        }
      : null;

  return {
    email:
      typeof vars.accountEmail === 'string'
        ? vars.accountEmail
        : 'luna.billing@example.test',
    plan,
    displayPlan: displayPlanForPrompt(plan, billingVerification),
    isPro: plan !== 'free',
    billingVerification,
    planMismatch,
    usage:
      billingVerification === 'unavailable'
        ? null
        : {
            dailyLimit,
            used,
            remaining: Math.max(dailyLimit - used, 0),
            resetAt: '2026-05-26T07:00:00.000Z',
            monthlyLimit,
            monthlyUsed,
            monthlyRemaining: Math.max(monthlyLimit - monthlyUsed, 0),
            monthlyResetAt: '2026-06-01T07:00:00.000Z',
          },
    entitlements: {
      aiCanUseTools:
        plan !== 'free' &&
        billingVerification === 'verified' &&
        toBoolean(vars.aiCanUseTools, planLimits.booleans.aiCanUseTools),
      canAccessMerchCreation: planLimits.booleans.canAccessMerchCreation,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: {
      merchMvp: true,
    },
    billing: {
      hasStripeCustomer: toBoolean(vars.hasStripeCustomer, plan !== 'free'),
      hasStripeSubscription: toBoolean(
        vars.hasStripeSubscription,
        plan !== 'free'
      ),
    },
  };
}

function buildSystemPromptContractReleases(
  promptCase: string,
  vars: EvalVars
): EvalSystemPromptReleases {
  if (promptCase !== 'release-overflow-cap') {
    return buildEvalReleases(vars);
  }

  return Array.from({ length: 30 }, (_, index) => ({
    title: `Overflow Release ${index + 1}`,
    releaseType: index % 3 === 0 ? 'album' : 'single',
    releaseDate: `2025-${String((index % 12) + 1).padStart(2, '0')}-15T00:00:00Z`,
    totalTracks: index % 3 === 0 ? 10 : 1,
  }));
}

function evaluateSystemPromptContract(prompt: string, vars: EvalVars) {
  const promptCase =
    typeof vars.promptCase === 'string' ? vars.promptCase : 'unspecified';
  const plan = toPlanId(vars.plan);
  const accountContext = buildEvalPromptAccountContext(vars);
  const planLimits = getEntitlements(plan);
  const aiCanUseTools =
    accountContext?.entitlements.aiCanUseTools ??
    (plan !== 'free' && planLimits.booleans.aiCanUseTools);
  const artistContext = buildTestArtistContext(
    toObject(vars.artistOverrides) as Parameters<
      typeof buildTestArtistContext
    >[0]
  );
  const releases = buildSystemPromptContractReleases(promptCase, vars);
  const uiMessages = toUiMessages(prompt, vars);
  const knowledgeContext =
    typeof vars.knowledgeContext === 'string' &&
    vars.knowledgeContext.trim().length > 0
      ? vars.knowledgeContext.trim()
      : toBoolean(vars.selectKnowledgeContext, false)
        ? selectKnowledgeContextForTurn(uiMessages)
        : undefined;
  const systemPrompt = buildSystemPrompt(artistContext, releases, {
    aiCanUseTools,
    aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
    insightsEnabled: toBoolean(vars.insightsEnabled, plan !== 'free'),
    knowledgeContext,
    accountContext,
  });
  const disallowedPromptText = stringArrayValue(vars.disallowedPromptText);
  const releaseTitles = releases.map(release => release.title);

  return {
    target: 'prompt-context-contract',
    adapter: 'prompt-context-contract',
    productionEntrypoint:
      'apps/web/lib/chat/system-prompt.ts:buildSystemPrompt',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    promptCase,
    mode: 'app',
    plan,
    billingVerification: accountContext?.billingVerification ?? null,
    aiCanUseTools,
    systemPrompt,
    systemPromptChars: systemPrompt.length,
    knowledgeContextSelected: Boolean(knowledgeContext),
    selectedTopicIds: selectedKnowledgeTopicIds(knowledgeContext ?? ''),
    hasAccountAccessSection: systemPrompt.includes('## Account & Access'),
    hasPlanLimitationsSection: systemPrompt.includes(
      '## Plan Limitations (Free Tier)'
    ),
    hasAnalyticsGuardrails:
      /Never invent downstream DSP performance or revenue figures/i.test(
        systemPrompt
      ) && /hidden internal scoring/i.test(systemPrompt),
    hasBillingUnavailableGuidance:
      /could not verify billing right now/i.test(systemPrompt) &&
      /Do not tell the artist they are on Free/i.test(systemPrompt),
    hasBillingDriftGuidance:
      /Billing row mismatch detected/i.test(systemPrompt) &&
      /Do not ask the artist to fix this manually/i.test(systemPrompt),
    hasSafeAccountActions:
      /Never change subscriptions, email, username, connected accounts, or OAuth providers from chat/i.test(
        systemPrompt
      ),
    releaseCount: releases.length,
    releaseTitles,
    releaseTitlesIncluded: releaseTitles.filter(title =>
      systemPrompt.includes(title)
    ),
    releaseOverflowLinePresent:
      /\.\.\.and 5 more releases in the catalog/i.test(systemPrompt),
    sensitiveDiagnosticMatches: [
      ...systemPrompt.matchAll(SYSTEM_PROMPT_SECRET_PATTERN),
    ].map(match => match[0]),
    disallowedPromptText,
    presentDisallowedPromptText: disallowedPromptText.filter(value =>
      systemPrompt.includes(value)
    ),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
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

type ToolAccessScenarioInput = {
  readonly name: string;
  readonly mode: 'app' | 'onboarding';
  readonly plan: PlanId;
  readonly billingVerification?: 'verified' | 'missing_user' | 'unavailable';
  readonly aiCanUseTools?: boolean;
  readonly expectedPaidToolAccess: boolean | null;
  readonly expectedTurnAiCanUseTools: boolean | null;
  readonly expectedToolNames: readonly string[];
};

function syntheticAccountContext(
  scenario: ToolAccessScenarioInput
): Parameters<typeof canUsePaidChatTools>[0] {
  const planLimits = getEntitlements(scenario.plan);

  return {
    billingVerification: scenario.billingVerification ?? 'verified',
    isPro: scenario.plan !== 'free',
    planLimits: {
      ...planLimits,
      booleans: {
        ...planLimits.booleans,
        aiCanUseTools:
          scenario.aiCanUseTools ?? planLimits.booleans.aiCanUseTools,
      },
    },
  } as Parameters<typeof canUsePaidChatTools>[0];
}

function buildToolAccessScenario(scenario: ToolAccessScenarioInput) {
  const expectedToolNames = [...scenario.expectedToolNames].sort();
  const accountContext =
    scenario.mode === 'app' ? syntheticAccountContext(scenario) : null;
  const paidToolAccess = accountContext
    ? canUsePaidChatTools(accountContext)
    : null;
  const turnPlanLimits = accountContext
    ? resolveChatTurnPlanLimits(accountContext)
    : null;
  const availableToolNames = [
    ...getToolNamesForTurn(scenario.mode, scenario.plan, {
      billingVerification: scenario.billingVerification,
      aiCanUseTools:
        turnPlanLimits?.booleans.aiCanUseTools ?? scenario.aiCanUseTools,
    }),
  ].sort();
  const availableSet = new Set(availableToolNames);
  const expectedSet = new Set(expectedToolNames);
  const missingToolNames = expectedToolNames.filter(
    toolName => !availableSet.has(toolName)
  );
  const unexpectedToolNames = availableToolNames.filter(
    toolName => !expectedSet.has(toolName)
  );

  return {
    name: scenario.name,
    mode: scenario.mode,
    plan: scenario.plan,
    billingVerification: scenario.billingVerification ?? 'verified',
    inputAiCanUseTools:
      scenario.aiCanUseTools ??
      getEntitlements(scenario.plan).booleans.aiCanUseTools,
    paidToolAccess,
    expectedPaidToolAccess: scenario.expectedPaidToolAccess,
    turnAiCanUseTools: turnPlanLimits?.booleans.aiCanUseTools ?? null,
    expectedTurnAiCanUseTools: scenario.expectedTurnAiCanUseTools,
    availableToolNames,
    expectedToolNames,
    missingToolNames,
    unexpectedToolNames,
  };
}

function evaluateToolAccessContract(vars: EvalVars) {
  const accessCase =
    typeof vars.accessCase === 'string' ? vars.accessCase : 'unspecified';
  const scenarios = [
    buildToolAccessScenario({
      name: 'app-free-verified',
      mode: 'app',
      plan: 'free',
      billingVerification: 'verified',
      expectedPaidToolAccess: false,
      expectedTurnAiCanUseTools: false,
      expectedToolNames: FREE_APP_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-pro-verified',
      mode: 'app',
      plan: 'pro',
      billingVerification: 'verified',
      expectedPaidToolAccess: true,
      expectedTurnAiCanUseTools: true,
      expectedToolNames: PAID_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-trial-verified',
      mode: 'app',
      plan: 'trial',
      billingVerification: 'verified',
      expectedPaidToolAccess: true,
      expectedTurnAiCanUseTools: true,
      expectedToolNames: PAID_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-max-verified',
      mode: 'app',
      plan: 'max',
      billingVerification: 'verified',
      expectedPaidToolAccess: true,
      expectedTurnAiCanUseTools: true,
      expectedToolNames: PAID_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-pro-billing-missing-user',
      mode: 'app',
      plan: 'pro',
      billingVerification: 'missing_user',
      expectedPaidToolAccess: false,
      expectedTurnAiCanUseTools: false,
      expectedToolNames: FREE_APP_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-pro-billing-unavailable',
      mode: 'app',
      plan: 'pro',
      billingVerification: 'unavailable',
      expectedPaidToolAccess: false,
      expectedTurnAiCanUseTools: false,
      expectedToolNames: FREE_APP_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'app-pro-ai-tools-disabled',
      mode: 'app',
      plan: 'pro',
      billingVerification: 'verified',
      aiCanUseTools: false,
      expectedPaidToolAccess: false,
      expectedTurnAiCanUseTools: false,
      expectedToolNames: FREE_APP_TOOL_NAMES,
    }),
    buildToolAccessScenario({
      name: 'onboarding-free',
      mode: 'onboarding',
      plan: 'free',
      expectedPaidToolAccess: null,
      expectedTurnAiCanUseTools: null,
      expectedToolNames: ONBOARDING_TOOLS,
    }),
  ];

  return {
    target: 'tool-access-contract',
    adapter: 'tool-access-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    accessCase,
    scenarioNames: scenarios.map(scenario => scenario.name),
    requiredScenarioNames: [
      'app-free-verified',
      'app-pro-verified',
      'app-trial-verified',
      'app-max-verified',
      'app-pro-billing-missing-user',
      'app-pro-billing-unavailable',
      'app-pro-ai-tools-disabled',
      'onboarding-free',
    ],
    scenarios,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
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
    case 'searchSpotifyArtist':
      return {
        action: 'spotify_artist_search',
        query: typeof args.query === 'string' ? args.query : 'Luna Waves',
        candidates: [
          {
            id: 'spotify-luna-123',
            name: 'Luna Waves',
            url: 'https://open.spotify.com/artist/spotify-luna-123',
            imageUrl: 'https://cdn.jov.ie/eval/luna-waves.jpg',
            followers: 12_500,
          },
        ],
        summary: 'Found one Spotify artist candidate.',
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
    case 'suggestRelatedArtists':
      return {
        success: true,
        action: 'related_artists_suggested',
        artists: [
          {
            name: 'Solar Tides',
            reason: 'Similar ambient electronic audience and playlist fit.',
          },
        ],
        summary: 'Related artists ready.',
      };
    case 'writeWorldClassBio':
      return {
        success: true,
        action: 'world_class_bio_written',
        bio: 'Luna Waves makes ambient electronic music built from field recordings, modular textures, and patient melodic loops.',
        summary: 'Bio ready.',
      };
    case 'generateCanvasPlan':
      return {
        success: true,
        action: 'canvas_plan_generated',
        releaseTitle: args.releaseTitle ?? 'Neon Reef',
        plan: {
          motion: args.motionPreference ?? 'ambient',
          steps: ['Loop the cover texture', 'Add slow light movement'],
        },
        summary: 'Canvas plan ready.',
      };
    case 'createPromoStrategy':
      return {
        success: true,
        action: 'promo_strategy_created',
        releaseTitle: args.releaseTitle ?? 'Neon Reef',
        strategy: {
          budget: args.budget ?? 'low',
          platforms: Array.isArray(args.platforms)
            ? args.platforms
            : ['instagram'],
          phases: ['announce', 'pre-save', 'release-week'],
        },
        summary: 'Promo strategy ready.',
      };
    case 'markCanvasUploaded':
      return {
        success: true,
        action: 'canvas_uploaded_marked',
        releaseTitle: args.releaseTitle ?? 'Neon Reef',
        summary: 'Canvas marked uploaded.',
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
    case 'createRelease':
      return {
        success: true,
        action: 'release_created',
        release: {
          title: args.title ?? 'Neon Reef',
          releaseType: args.releaseType ?? 'single',
          releaseDate: args.releaseDate ?? null,
          label: args.label ?? null,
        },
        summary: 'Release created.',
      };
    case 'formatLyrics':
      return {
        success: true,
        action: 'lyrics_formatted',
        formattedLyrics:
          typeof args.lyrics === 'string'
            ? args.lyrics
            : 'Verse one\n\nChorus one',
        summary: 'Lyrics formatted.',
      };
    case 'generateReleasePitch':
      return {
        success: true,
        action: 'release_pitch_generated',
        releaseTitle: args.releaseTitle ?? 'Neon Reef',
        pitch:
          'Luna Waves pairs ambient textures with a concise release story for editorial pitching.',
        summary: 'Pitch ready.',
      };
    default:
      return { success: true, action: toolName, input: args };
  }
}

type EvalInterviewSignal = z.infer<typeof interviewSignalSchema>;

type EvalOnboardingState = {
  sessionId: string;
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyImageUrl: string | null;
  spotifyGenres: string[];
  spotifyPopularity: number | null;
  spotifyFollowers: number | null;
  signals: EvalInterviewSignal[];
  turnCount: number;
};

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEvalOnboardingState(vars: EvalVars): EvalOnboardingState {
  const initialState = toObject(vars.initialState);
  const turnCount =
    typeof vars.turnCount === 'number' && Number.isInteger(vars.turnCount)
      ? vars.turnCount
      : 1;

  return {
    sessionId:
      typeof initialState.sessionId === 'string'
        ? initialState.sessionId
        : 'promptfoo-onboarding-state',
    spotifyArtistId:
      typeof initialState.spotifyArtistId === 'string'
        ? initialState.spotifyArtistId
        : null,
    spotifyArtistName:
      typeof initialState.spotifyArtistName === 'string'
        ? initialState.spotifyArtistName
        : null,
    spotifyImageUrl:
      typeof initialState.spotifyImageUrl === 'string'
        ? initialState.spotifyImageUrl
        : null,
    spotifyGenres: Array.isArray(initialState.spotifyGenres)
      ? initialState.spotifyGenres.filter(
          (genre): genre is string => typeof genre === 'string'
        )
      : [],
    spotifyPopularity: nullableNumber(initialState.spotifyPopularity),
    spotifyFollowers: nullableNumber(initialState.spotifyFollowers),
    signals: [],
    turnCount,
  };
}

function evaluateOnboardingStateContract(vars: EvalVars) {
  const stateCase =
    typeof vars.stateCase === 'string' ? vars.stateCase : 'unspecified';
  const state = createEvalOnboardingState(vars);
  const stateBefore = cloneJson(state);
  const rawSignals = Array.isArray(vars.signals) ? vars.signals : [];
  const errors: string[] = [];
  const toolExecutions: ToolExecution[] = [];

  for (const [index, rawSignal] of rawSignals.entries()) {
    const parsed = interviewSignalSchema.safeParse(rawSignal);
    if (!parsed.success) {
      errors.push(
        ...schemaErrorMessages(parsed).map(
          message => `signals.${index}: ${message}`
        )
      );
      continue;
    }

    state.signals.push(parsed.data);
    toolExecutions.push({
      name: 'recordInterviewSignal',
      input: parsed.data,
      output: {
        action: 'signal_recorded',
        signalCount: state.signals.length,
        summary: 'Signal noted.',
      },
    });
  }

  const timestampBase = WEB_CHAT_EVAL_EPOCH_SECONDS * 1000;
  const collapsedSignal = collapseInterviewSignals(
    state.signals.map((signal, index) => ({
      ...signal,
      recordedAt: new Date(timestampBase + index * 1000).toISOString(),
    }))
  );
  const nextStepDecision = evaluateAccessSignal({
    signal: collapsedSignal,
    spotifyFollowers: state.spotifyFollowers,
    turnCount: state.turnCount,
  });
  const nextStepOutput = {
    action: 'propose_next_step',
    decision: nextStepDecision,
    summary: `Next step: ${nextStepDecision.kind.replaceAll('_', ' ')}.`,
  };
  toolExecutions.push({
    name: 'proposeNextStep',
    input: {},
    output: nextStepOutput,
  });

  return {
    target: 'onboarding-state-contract',
    adapter: 'onboarding-state-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    stateCase,
    mode: 'onboarding',
    turnCount: state.turnCount,
    maxTurnCap: MAX_INTERVIEW_TURNS_BEFORE_FORCE,
    signalCount: state.signals.length,
    stateBefore,
    stateAfter: cloneJson(state),
    collapsedSignal,
    nextStepDecision,
    expectedDecision: toObject(vars.expectedDecision),
    expectedCollapsedSignal: toObject(vars.expectedCollapsedSignal),
    expectedSignalCount:
      typeof vars.expectedSignalCount === 'number'
        ? vars.expectedSignalCount
        : null,
    errors,
    steps: toolExecutions.map(execution => ({
      toolCalls: [{ toolName: execution.name, input: execution.input }],
      toolResults: [{ toolName: execution.name, output: execution.output }],
    })),
    toolCalls: toolExecutions.map(execution => ({
      toolName: execution.name,
      input: execution.input,
    })),
    toolResults: toolExecutions.map(execution => ({
      toolName: execution.name,
      output: execution.output,
    })),
    toolExecutions,
  };
}

function executeSequenceSpotifyConfirmation(
  state: EvalOnboardingState,
  spotifyArtistId = 'spotify-luna-123'
): ToolExecution {
  const input = { spotifyArtistId };
  const output = defaultToolResult('confirmSpotifyArtist', input);
  const artist = toObject(toObject(output).artist);

  state.spotifyArtistId = spotifyArtistId;
  state.spotifyArtistName =
    typeof artist.name === 'string' ? artist.name : 'Luna Waves';
  state.spotifyImageUrl =
    typeof artist.imageUrl === 'string' ? artist.imageUrl : null;
  state.spotifyGenres = Array.isArray(artist.genres)
    ? artist.genres.filter(
        (genre): genre is string => typeof genre === 'string'
      )
    : [];
  state.spotifyPopularity = nullableNumber(artist.popularity);
  state.spotifyFollowers = nullableNumber(artist.followers);

  return { name: 'confirmSpotifyArtist', input, output };
}

function executeSequenceHandleCheck(handle = 'lunawaves'): ToolExecution {
  const input = { handle };

  return {
    name: 'checkHandle',
    input,
    output: defaultToolResult('checkHandle', input),
  };
}

function executeSequenceSignal(
  state: EvalOnboardingState,
  signal: EvalInterviewSignal
): ToolExecution {
  const parsed = interviewSignalSchema.parse(signal);
  state.signals.push(parsed);

  return {
    name: 'recordInterviewSignal',
    input: parsed,
    output: {
      action: 'signal_recorded',
      signalCount: state.signals.length,
      summary: 'Signal noted.',
    },
  };
}

function sequenceNextStepDecision(state: EvalOnboardingState) {
  const timestampBase = WEB_CHAT_EVAL_EPOCH_SECONDS * 1000;
  const collapsedSignal = collapseInterviewSignals(
    state.signals.map((signal, index) => ({
      ...signal,
      recordedAt: new Date(timestampBase + index * 1000).toISOString(),
    }))
  );
  const nextStepDecision = evaluateAccessSignal({
    signal: collapsedSignal,
    spotifyFollowers: state.spotifyFollowers,
    turnCount: state.turnCount,
  });

  return { collapsedSignal, nextStepDecision };
}

function executeSequenceNextStep(state: EvalOnboardingState): {
  readonly execution: ToolExecution;
  readonly collapsedSignal: EvalInterviewSignal;
  readonly nextStepDecision: ReturnType<typeof evaluateAccessSignal>;
} {
  const { collapsedSignal, nextStepDecision } = sequenceNextStepDecision(state);
  const output = {
    action: 'propose_next_step',
    decision: nextStepDecision,
    summary: `Next step: ${nextStepDecision.kind.replaceAll('_', ' ')}.`,
  };

  return {
    execution: {
      name: 'proposeNextStep',
      input: {},
      output,
    },
    collapsedSignal,
    nextStepDecision,
  };
}

function executeSequenceCheckout(plan: 'pro' | 'max' | 'free' = 'pro') {
  const input = { plan };

  return {
    name: 'proposeCheckout',
    input,
    output: defaultToolResult('proposeCheckout', input),
  };
}

function evaluateOnboardingToolSequenceContract(vars: EvalVars) {
  const sequenceCase =
    typeof vars.sequenceCase === 'string'
      ? vars.sequenceCase
      : 'spotify-confirmation-observation-next-step';
  const state = createEvalOnboardingState(vars);
  const stateBefore = cloneJson(state);
  const toolExecutions: ToolExecution[] = [];
  const blockedSteps: Array<{
    readonly toolName: string;
    readonly reason: string;
  }> = [];
  let collapsedSignal: EvalInterviewSignal = {};
  let nextStepDecision: ReturnType<typeof evaluateAccessSignal> | null = null;

  if (sequenceCase === 'premature-next-step-blocked-before-identity') {
    blockedSteps.push({
      toolName: 'proposeNextStep',
      reason: 'spotify_identity_missing',
    });
    toolExecutions.push({
      name: 'searchSpotifyArtist',
      input: { query: 'Luna Waves' },
      output: defaultToolResult('searchSpotifyArtist', { query: 'Luna Waves' }),
    });
  } else if (sequenceCase === 'checkout-blocked-before-instant-access') {
    state.spotifyArtistId = 'spotify-luna-early';
    state.spotifyArtistName = 'Luna Waves';
    toolExecutions.push(
      executeSequenceSignal(state, {
        audienceBand: 'under_500',
        objection: {
          category: 'effort_to_set_up',
          text: 'not ready to commit yet',
        },
      })
    );
    const nextStep = executeSequenceNextStep(state);
    collapsedSignal = nextStep.collapsedSignal;
    nextStepDecision = nextStep.nextStepDecision;
    toolExecutions.push(nextStep.execution);
    blockedSteps.push({
      toolName: 'proposeCheckout',
      reason: `next_step_${nextStepDecision.kind}`,
    });
  } else if (sequenceCase === 'waitlist-outcome-no-checkout') {
    state.turnCount = MAX_INTERVIEW_TURNS_BEFORE_FORCE;
    toolExecutions.push(
      executeSequenceSignal(state, { audienceBand: 'under_500' })
    );
    const nextStep = executeSequenceNextStep(state);
    collapsedSignal = nextStep.collapsedSignal;
    nextStepDecision = nextStep.nextStepDecision;
    toolExecutions.push(nextStep.execution);
  } else {
    toolExecutions.push(executeSequenceSpotifyConfirmation(state));

    if (sequenceCase === 'instant-access-next-step-before-checkout') {
      toolExecutions.push(executeSequenceHandleCheck());
      toolExecutions.push(
        executeSequenceSignal(state, {
          releaseStage: 'announced_unreleased',
          audienceBand: '500_to_5k',
        })
      );
    } else {
      toolExecutions.push(
        executeSequenceSignal(state, {
          audienceBand: '5k_to_50k',
          freeNote: 'Spotify profile confirmed with 12500 followers.',
        })
      );
    }

    const nextStep = executeSequenceNextStep(state);
    collapsedSignal = nextStep.collapsedSignal;
    nextStepDecision = nextStep.nextStepDecision;
    toolExecutions.push(nextStep.execution);

    if (
      sequenceCase === 'instant-access-next-step-before-checkout' &&
      nextStepDecision.kind === 'instant_access'
    ) {
      toolExecutions.push(executeSequenceCheckout('pro'));
    }
  }

  const toolCallOrder = toolExecutions.map(execution => execution.name);

  return {
    target: 'onboarding-tool-sequence-contract',
    adapter: 'onboarding-tool-sequence-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    sequenceCase,
    mode: 'onboarding',
    availableToolNames: [...ONBOARDING_TOOLS],
    stateBefore,
    stateAfter: cloneJson(state),
    blockedSteps,
    toolCallOrder,
    collapsedSignal,
    nextStepDecision,
    checkoutCalled: toolCallOrder.includes('proposeCheckout'),
    toolCalls: toolExecutions.map(execution => ({
      toolName: execution.name,
      input: execution.input,
    })),
    toolResults: toolExecutions.map(execution => ({
      toolName: execution.name,
      output: execution.output,
    })),
    toolExecutions,
  };
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

function isBlockedBioImportHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    normalized
  );
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some(octet => !Number.isInteger(octet) || octet > 255)) {
    return true;
  }

  const [first = 0, second = 0] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
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

  if (toolName === 'importBioFromUrl') {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return ['url: Provide a public https URL'];
      }
      if (parsed.username || parsed.password) {
        return ['url: Userinfo is not allowed in bio import URLs'];
      }
      if (
        parsed.hostname.endsWith('.') ||
        isBlockedBioImportHostname(parsed.hostname)
      ) {
        return ['url: Provide a public https URL'];
      }
    } catch {
      return ['url: Provide a valid public https URL'];
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

function sampleToolInput(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case 'proposeAvatarUpload':
    case 'optimizeMerchCards':
    case 'showMerchSales':
    case 'showArtistPayouts':
    case 'showAccountStatus':
    case 'showUsage':
    case 'openBillingPortal':
    case 'showTopInsights':
    case 'proposeNextStep':
      return {};
    case 'generateAlbumArt':
      return {
        releaseTitle: 'Neon Reef',
        styleId: 'analog_dream',
        prompt: 'moonlit tide pool with soft modular synth textures',
      };
    case 'createMerch':
      return {
        prompt: 'premium tee for the Neon Reef release',
        itemType: 'tee',
        makeLive: false,
      };
    case 'previewMerchOptions':
      return {
        prompt: 'three quiet merch concepts for Luna Waves',
        itemType: 'hoodie',
      };
    case 'selectMerchDesign':
      return {
        generationId: '00000000-0000-4000-8000-000000000b01',
        optionNumber: 1,
      };
    case 'publishMerchCard':
    case 'pauseMerchCard':
    case 'unpauseMerchCard':
    case 'deleteOrArchiveMerchCard':
      return { merchCardId: '00000000-0000-4000-8000-000000000c01' };
    case 'reorderMerchCards':
      return {
        merchCardIds: [
          '00000000-0000-4000-8000-000000000c01',
          '00000000-0000-4000-8000-000000000c02',
        ],
      };
    case 'proposeSocialLink':
      return { url: 'https://instagram.com/lunawaves' };
    case 'proposeSocialLinkRemoval':
      return { platform: 'instagram' };
    case 'submitFeedback':
      return { message: 'Please make release planning easier to scan.' };
    case 'searchSpotifyArtist':
      return { query: 'Luna Waves' };
    case 'confirmSpotifyArtist':
      return { spotifyArtistId: 'spotify-luna-123' };
    case 'checkHandle':
      return { handle: 'lunawaves' };
    case 'recordInterviewSignal':
      return {
        releaseStage: 'announced_unreleased',
        audienceBand: '5k_to_50k',
      };
    case 'proposeCheckout':
      return { plan: 'pro' };
    case 'proposeProfileEdit':
      return {
        field: 'bio',
        newValue:
          'Luna Waves makes ambient electronic songs for late-night focus.',
      };
    case 'importBioFromUrl':
      return { url: 'https://lunawaves.example/press-kit' };
    case 'checkCanvasStatus':
      return { includeAll: true };
    case 'suggestRelatedArtists':
      return { purpose: 'playlist_pitching', count: 5 };
    case 'writeWorldClassBio':
      return { goal: 'spotify', tone: 'cinematic', maxWords: 120 };
    case 'generateCanvasPlan':
      return { releaseTitle: 'Neon Reef', motionPreference: 'ambient' };
    case 'createPromoStrategy':
      return {
        releaseTitle: 'Neon Reef',
        budget: 'low',
        platforms: ['instagram', 'spotify'],
      };
    case 'markCanvasUploaded':
      return { releaseTitle: 'Neon Reef' };
    case 'createRelease':
      return {
        title: 'Neon Reef',
        releaseType: 'single',
        releaseDate: '2026-06-19',
        label: 'Luna Waves Records',
      };
    case 'formatLyrics':
      return { lyrics: 'Neon reef\nSoft signal\nNeon reef\nHome' };
    case 'generateReleasePitch':
      return {
        releaseTitle: 'Neon Reef',
        target: 'playlist',
        platform: 'spotify',
      };
    default:
      return {};
  }
}

function failureToolResult(toolName: string) {
  return {
    success: false,
    error: `Synthetic ${toolName} failure.`,
  };
}

function sensitiveResultPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      sensitiveResultPaths(item, [...path, String(index)])
    );
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nestedValue]) => {
      const nestedPath = [...path, key];
      const keyPaths = SENSITIVE_RESULT_KEY_PATTERN.test(key)
        ? [nestedPath.join('.')]
        : [];

      return [...keyPaths, ...sensitiveResultPaths(nestedValue, nestedPath)];
    });
  }

  if (typeof value === 'string' && SENSITIVE_RESULT_VALUE_PATTERN.test(value)) {
    return [path.join('.') || 'value'];
  }

  return [];
}

function missingRequiredResultKeys(
  toolName: string,
  output: unknown
): string[] {
  const requiredKeys = TOOL_RESULT_REQUIRED_KEYS[toolName] ?? [
    'success',
    'action',
  ];
  const result = toObject(output);

  return requiredKeys.filter(key => !Object.hasOwn(result, key));
}

function resultShapeRecord(toolName: string) {
  const schema =
    ALL_EVAL_TOOL_SCHEMAS[toolName as keyof typeof ALL_EVAL_TOOL_SCHEMAS];
  const input = sampleToolInput(toolName);
  const schemaResult = schema.inputSchema.safeParse(input);
  const successOutput = schemaResult.success
    ? defaultToolResult(toolName, schemaResult.data)
    : null;
  const failureOutput = failureToolResult(toolName);
  const uiConfig = getToolUiConfig(toolName);
  const uiRegistryConfigured = Object.hasOwn(TOOL_UI_REGISTRY, toolName);
  const requiredKeys = TOOL_RESULT_REQUIRED_KEYS[toolName] ?? [
    'success',
    'action',
  ];
  const missingRequiredKeys = schemaResult.success
    ? missingRequiredResultKeys(toolName, successOutput)
    : [...requiredKeys];
  const successSensitivePaths = sensitiveResultPaths(successOutput);
  const failureSensitivePaths = sensitiveResultPaths(failureOutput);
  const failureResult = toObject(failureOutput);
  const failureSuccessFlag = failureResult.success;
  const failureError = failureResult.error;
  const uiHintValid =
    uiRegistryConfigured &&
    (uiConfig.uiHint === 'artifact' || uiConfig.uiHint === 'status') &&
    (uiConfig.renderer === 'artifact' || uiConfig.renderer === 'status');
  const successShapeValid =
    schemaResult.success &&
    missingRequiredKeys.length === 0 &&
    successSensitivePaths.length === 0 &&
    uiHintValid;
  const failureShapeValid =
    failureSuccessFlag === false &&
    typeof failureError === 'string' &&
    failureError.length > 0 &&
    failureSensitivePaths.length === 0 &&
    uiHintValid;

  return {
    toolName,
    input,
    parsedInput: schemaResult.success ? schemaResult.data : null,
    schemaValid: schemaResult.success,
    schemaErrors: schemaResult.success ? [] : schemaErrorMessages(schemaResult),
    uiRegistryConfigured,
    uiHint: uiConfig.uiHint,
    renderer: uiConfig.renderer,
    requiredKeys,
    successOutput,
    failureOutput,
    missingRequiredKeys,
    successSensitivePaths,
    failureSensitivePaths,
    failureSuccessFlag,
    failureError: typeof failureError === 'string' ? failureError : null,
    successShapeValid,
    failureShapeValid,
  };
}

function evaluateToolResultShapeContract(vars: EvalVars) {
  const resultShapeCase =
    typeof vars.resultShapeCase === 'string'
      ? vars.resultShapeCase
      : 'success-failure-matrix';
  const resultShapes = ALL_EVAL_TOOL_NAMES.map(resultShapeRecord);

  return {
    target: 'tool-result-shape-contract',
    adapter: 'tool-result-shape-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    resultShapeCase,
    requiredToolNames: ALL_EVAL_TOOL_NAMES,
    resultShapes,
    missingResultShapeToolNames: ALL_EVAL_TOOL_NAMES.filter(
      toolName => !resultShapes.some(shape => shape.toolName === toolName)
    ),
    schemaInvalidToolNames: resultShapes
      .filter(shape => shape.schemaValid !== true)
      .map(shape => shape.toolName),
    missingUiHintToolNames: resultShapes
      .filter(shape => shape.uiRegistryConfigured !== true)
      .map(shape => shape.toolName),
    invalidSuccessShapeNames: resultShapes
      .filter(shape => shape.successShapeValid !== true)
      .map(shape => shape.toolName),
    invalidFailureShapeNames: resultShapes
      .filter(shape => shape.failureShapeValid !== true)
      .map(shape => shape.toolName),
    sensitiveResultToolNames: resultShapes
      .filter(
        shape =>
          shape.successSensitivePaths.length > 0 ||
          shape.failureSensitivePaths.length > 0
      )
      .map(shape => shape.toolName),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
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

function registryPathExists(path: string | undefined): boolean {
  if (!path?.trim()) return false;

  return existsSync(resolve(REPO_ROOT, path));
}

function registryPathContent(path: string | undefined): string {
  if (!path?.trim() || !registryPathExists(path)) return '';

  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function evaluateSkillRegistryInventory(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedSkillIds = Array.isArray(coverage.expectedSkillIds)
    ? coverage.expectedSkillIds.filter(
        (skillId): skillId is string => typeof skillId === 'string'
      )
    : [];
  const expectedSkillIdSet = new Set(expectedSkillIds);
  const knownSkillIdSet = new Set(SKILL_REGISTRY_IDS);

  const skillSummaries = Object.entries(SKILL_REGISTRY)
    .map(([skillId, skill]) => {
      const inputSchemaZodPath =
        'inputSchemaZodPath' in skill ? skill.inputSchemaZodPath : undefined;
      const outputSchemaZodPath =
        'outputSchemaZodPath' in skill ? skill.outputSchemaZodPath : undefined;

      return {
        id: skillId,
        kind: skill.kind,
        entitlement: skill.entitlement,
        model: skill.model,
        version: skill.version,
        metadataSurface: skill.metadata.surface ?? null,
        metadataAction: skill.metadata.action ?? null,
        promptPath: skill.promptPath ?? null,
        promptPathExists: registryPathExists(skill.promptPath),
        inputSchemaZodPath: inputSchemaZodPath ?? null,
        inputSchemaZodPathExists: registryPathExists(inputSchemaZodPath),
        outputSchemaZodPath: outputSchemaZodPath ?? null,
        outputSchemaZodPathExists: registryPathExists(outputSchemaZodPath),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const missingExpectedSkillIds = expectedSkillIds
    .filter(skillId => !knownSkillIdSet.has(skillId))
    .sort();
  const unknownExpectedSkillIds = SKILL_REGISTRY_IDS.filter(
    skillId => !expectedSkillIdSet.has(skillId)
  );

  return {
    target: 'skill-registry-inventory',
    adapter: 'skill-registry-inventory',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    requiredSkillIds: SKILL_REGISTRY_IDS,
    expectedSkillIds: uniqueSorted(expectedSkillIds),
    missingExpectedSkillIds,
    unknownExpectedSkillIds,
    skillSummaries,
    missingEntitlementSkillIds: skillSummaries
      .filter(skill => !skill.entitlement.trim())
      .map(skill => skill.id),
    missingModelSkillIds: skillSummaries
      .filter(skill => !skill.model.trim())
      .map(skill => skill.id),
    missingVersionSkillIds: skillSummaries
      .filter(skill => !skill.version.trim())
      .map(skill => skill.id),
    missingMetadataSurfaceSkillIds: skillSummaries
      .filter(skill => !skill.metadataSurface)
      .map(skill => skill.id),
    missingMetadataActionSkillIds: skillSummaries
      .filter(skill => !skill.metadataAction)
      .map(skill => skill.id),
    missingPromptPathSkillIds: skillSummaries
      .filter(skill => skill.kind !== 'tool' && !skill.promptPath)
      .map(skill => skill.id),
    missingInputSchemaPathToolIds: skillSummaries
      .filter(skill => skill.kind === 'tool' && !skill.inputSchemaZodPath)
      .map(skill => skill.id),
    missingOutputSchemaPathToolIds: skillSummaries
      .filter(skill => skill.kind === 'tool' && !skill.outputSchemaZodPath)
      .map(skill => skill.id),
    missingPathFileSkillIds: skillSummaries
      .filter(skill => {
        if (skill.kind !== 'tool') {
          return !skill.promptPathExists;
        }

        return !(
          skill.inputSchemaZodPathExists && skill.outputSchemaZodPathExists
        );
      })
      .map(skill => skill.id),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

function evaluateSkillArtifactContract(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedSkillIds = toStringArray(coverage.expectedSkillIds);
  const expectedSkillIdSet = new Set(expectedSkillIds);
  const knownSkillIdSet = new Set(SKILL_REGISTRY_IDS);
  const promptGuardrails = toObject(coverage.promptGuardrails);
  const minimumPromptChars =
    typeof coverage.minimumPromptChars === 'number'
      ? coverage.minimumPromptChars
      : 200;

  const skillArtifacts = Object.entries(SKILL_REGISTRY)
    .map(([skillId, skill]) => {
      const isTool = skill.kind === 'tool';
      const promptContent = isTool ? '' : registryPathContent(skill.promptPath);
      const requiredPromptGuardrails = toStringArray(promptGuardrails[skillId]);
      const missingPromptGuardrails = requiredPromptGuardrails.filter(
        guardrail =>
          !promptContent.toLowerCase().includes(guardrail.toLowerCase())
      );

      return {
        id: skillId,
        kind: skill.kind,
        surface: skill.metadata.surface ?? null,
        action: skill.metadata.action ?? null,
        promptPath: skill.promptPath ?? null,
        promptLength: promptContent.length,
        minimumPromptChars,
        requiredPromptGuardrails,
        missingPromptGuardrails,
        toolSchemaCovered: isTool && ALL_EVAL_TOOL_NAME_SET.has(skillId),
        toolResultShapeCovered:
          isTool && Object.hasOwn(TOOL_RESULT_REQUIRED_KEYS, skillId),
        toolAvailabilityCovered: isTool && PAID_TOOL_NAME_SET.has(skillId),
        toolRenderCovered: isTool && TOOL_UI_REGISTRY_NAME_SET.has(skillId),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const missingExpectedSkillIds = expectedSkillIds
    .filter(skillId => !knownSkillIdSet.has(skillId))
    .sort();
  const unknownExpectedSkillIds = SKILL_REGISTRY_IDS.filter(
    skillId => !expectedSkillIdSet.has(skillId)
  );
  const promptArtifacts = skillArtifacts.filter(skill => skill.kind !== 'tool');

  return {
    target: 'skill-artifact-contract',
    adapter: 'skill-artifact-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    expectedSkillIds: uniqueSorted(expectedSkillIds),
    requiredSkillIds: SKILL_REGISTRY_IDS,
    missingExpectedSkillIds,
    unknownExpectedSkillIds,
    skillArtifacts,
    missingToolSchemaCoverageSkillIds: skillArtifacts
      .filter(skill => skill.kind === 'tool' && !skill.toolSchemaCovered)
      .map(skill => skill.id),
    missingToolResultCoverageSkillIds: skillArtifacts
      .filter(skill => skill.kind === 'tool' && !skill.toolResultShapeCovered)
      .map(skill => skill.id),
    missingToolAvailabilityCoverageSkillIds: skillArtifacts
      .filter(skill => skill.kind === 'tool' && !skill.toolAvailabilityCovered)
      .map(skill => skill.id),
    missingToolRenderCoverageSkillIds: skillArtifacts
      .filter(skill => skill.kind === 'tool' && !skill.toolRenderCovered)
      .map(skill => skill.id),
    missingPromptArtifactSkillIds: promptArtifacts
      .filter(skill => !skill.promptPath || skill.promptLength === 0)
      .map(skill => skill.id),
    shortPromptArtifactSkillIds: promptArtifacts
      .filter(skill => skill.promptLength < minimumPromptChars)
      .map(skill => skill.id),
    missingPromptGuardrailSkillIds: promptArtifacts
      .filter(skill => skill.missingPromptGuardrails.length > 0)
      .map(skill => skill.id),
    missingPromptGuardrailsBySkill: Object.fromEntries(
      promptArtifacts
        .filter(skill => skill.missingPromptGuardrails.length > 0)
        .map(skill => [skill.id, skill.missingPromptGuardrails])
    ),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

function buildEvalPitchInput(): PitchInput {
  return {
    artist: {
      displayName: 'Luna Waves',
      bio: 'Luna Waves builds ambient electronic songs around field recordings, soft modular textures, and patient melodies.',
      genres: ['ambient', 'electronic', 'downtempo'],
      location: 'Portland, OR',
      activeSinceYear: 2021,
      spotifyFollowers: 12_500,
      spotifyPopularity: 45,
      careerHighlights:
        'Sold out a 220-cap hometown release show and supported a regional ambient showcase.',
      targetPlaylists: ['Pollen', 'Electronic Rising'],
    },
    release: {
      title: 'Neon Reef',
      releaseDate: new Date('2026-06-19T00:00:00.000Z'),
      releaseType: 'single',
      genres: ['ambient electronic', 'downtempo'],
      totalTracks: 1,
      label: 'Luna Waves Records',
      distributor: 'DistroKid',
    },
    tracks: [
      {
        title: 'Neon Reef',
        durationMs: 205_000,
        creditNames: ['Luna Waves'],
      },
    ],
  };
}

function textIncludesAll(text: string, needles: readonly string[]): boolean {
  const normalizedText = text.toLowerCase();
  return needles.every(needle => normalizedText.includes(needle.toLowerCase()));
}

function promptLeakPatterns(text: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ['http-url', /https?:\/\//i],
    ['secret-token', /(?:sk-|bearer\s+|password|api[_-]?key)/i],
  ];

  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
}

function evaluateSkillPromptContract(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedSkillIds = toStringArray(coverage.expectedSkillIds);
  const expectedSkillIdSet = new Set(expectedSkillIds);
  const knownSkillIdSet = new Set(SKILL_REGISTRY_IDS);
  const promptCase =
    typeof vars.skillPromptCase === 'string'
      ? vars.skillPromptCase
      : 'release-pitch-retouch-prompts';
  const pitchInput = buildEvalPitchInput();
  const destination = resolvePitchDestination({
    target: 'playlist',
    platform: 'spotify',
  });
  const playlistSystemPrompt = buildPlaylistPitchSystemPrompt();
  const playlistUserPrompt = buildPlaylistPitchUserPrompt(
    pitchInput,
    'Pitch this for late-night focus and ambient editorial playlists.'
  );
  const draftSystemPrompt = buildPitchDraftSystemPrompt();
  const draftUserPrompt = destination
    ? buildPitchDraftUserPrompt({
        input: pitchInput,
        destination,
        instructions: 'Keep the ask useful for a Spotify playlist curator.',
      })
    : '';
  const retouchPrompt = registryPathContent(SKILL_REGISTRY.retouch.promptPath);
  const combinedPitchPrompt = [
    playlistSystemPrompt,
    playlistUserPrompt,
    draftSystemPrompt,
    draftUserPrompt,
  ].join('\n\n');
  const releasePitchPromptFacts = {
    systemBlocksFabrication: textIncludesAll(
      `${playlistSystemPrompt}\n${draftSystemPrompt}`,
      ['NEVER fabricate', 'Never fabricate']
    ),
    systemBlocksLinksAndHandles: textIncludesAll(
      `${playlistSystemPrompt}\n${draftSystemPrompt}`,
      ['NEVER include links, @handles', 'Do not include links, @handles']
    ),
    systemUsesArtistVoice: textIncludesAll(
      `${playlistSystemPrompt}\n${draftSystemPrompt}`,
      ['FIRST PERSON', 'first person as the artist']
    ),
    playlistSystemIncludesPlatformLimits: Object.values(PLATFORM_LIMITS).every(
      limit => playlistSystemPrompt.includes(String(limit))
    ),
    userPromptIncludesSyntheticArtist: textIncludesAll(playlistUserPrompt, [
      'Luna Waves',
      'Neon Reef',
      'Pollen',
      '2026-06-19',
    ]),
    draftPromptIncludesDestination: textIncludesAll(draftUserPrompt, [
      'Spotify playlist',
      'streaming editorial or independent playlist curator',
      'Character limit: 500',
    ]),
    promptAvoidsPrivateContactLeak:
      promptLeakPatterns(combinedPitchPrompt).length === 0,
  };
  const retouchGuardrails = [
    "Preserve the person's identity",
    'Do not change protected or sensitive attributes',
    'return a safe refusal',
    'same person',
  ];
  const missingRetouchGuardrails = retouchGuardrails.filter(
    guardrail => !retouchPrompt.toLowerCase().includes(guardrail.toLowerCase())
  );
  const missingReleasePitchPromptFacts = Object.entries(releasePitchPromptFacts)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const missingExpectedSkillIds = expectedSkillIds
    .filter(skillId => !knownSkillIdSet.has(skillId))
    .sort();
  const unknownExpectedSkillIds = SKILL_REGISTRY_IDS.filter(
    skillId => !expectedSkillIdSet.has(skillId)
  );

  return {
    target: 'skill-prompt-contract',
    adapter: 'skill-prompt-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    promptCase,
    expectedSkillIds: uniqueSorted(expectedSkillIds),
    requiredSkillIds: SKILL_REGISTRY_IDS,
    missingExpectedSkillIds,
    unknownExpectedSkillIds,
    releasePitch: {
      skillId: 'generateReleasePitch',
      promptLengths: {
        playlistSystem: playlistSystemPrompt.length,
        playlistUser: playlistUserPrompt.length,
        draftSystem: draftSystemPrompt.length,
        draftUser: draftUserPrompt.length,
      },
      destination: destination
        ? {
            target: destination.target,
            platform: destination.platform,
            label: destination.label,
            characterLimit: destination.characterLimit,
          }
        : null,
      platformLimits: PLATFORM_LIMITS,
      facts: releasePitchPromptFacts,
      missingFacts: missingReleasePitchPromptFacts,
      leakPatterns: promptLeakPatterns(combinedPitchPrompt),
    },
    retouch: {
      skillId: 'retouch',
      promptPath: SKILL_REGISTRY.retouch.promptPath,
      promptLength: retouchPrompt.length,
      requiredGuardrails: retouchGuardrails,
      missingGuardrails: missingRetouchGuardrails,
    },
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

function evaluateAiToolPromptContract(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedToolNames = toStringArray(coverage.expectedToolNames);
  const requiredToolNames = [...AI_TOOL_PROMPT_TOOL_NAMES];
  const requiredToolNameSet = new Set(requiredToolNames);
  const promptCase =
    typeof vars.aiToolPromptCase === 'string'
      ? vars.aiToolPromptCase
      : 'album-art-canvas-bio-prompts';

  const albumArtStyle = ALBUM_ART_STYLES.chrome_noir;
  const albumArtPrompt = buildAlbumArtBackgroundPrompt({
    releaseTitle: 'Neon Reef',
    artistName: 'Luna Waves',
    style: albumArtStyle,
    prompt: 'Bioluminescent reef reflections with polished chrome depth.',
  });
  const albumArtFacts = {
    includesSquareBackgroundInstruction: textIncludesAll(albumArtPrompt, [
      'square album cover background image',
    ]),
    includesSelectedStyle: textIncludesAll(albumArtPrompt, [
      albumArtStyle.backgroundPrompt,
    ]),
    includesSyntheticReleaseContext: textIncludesAll(albumArtPrompt, [
      'Neon Reef',
      'Luna Waves',
    ]),
    includesUserDirection: textIncludesAll(albumArtPrompt, [
      'Bioluminescent reef reflections',
    ]),
    blocksTextAndLogos: textIncludesAll(albumArtPrompt, [
      'Do not render any words',
      'typography',
      'logos',
      'watermarks',
      'UI elements',
    ]),
    leavesOverlaySpace: textIncludesAll(albumArtPrompt, [
      'Leave clean composition space',
      'overlay the artist name and release title',
    ]),
  };

  const canvasInput: CanvasGenerationInput = {
    releaseId: '00000000-0000-4000-8000-00000000cafe',
    artworkUrl: 'https://cdn.jov.ie/eval/neon-reef-cover.jpg',
    releaseTitle: 'Neon Reef',
    artistName: 'Luna Waves',
    style: {
      motionType: 'particles',
    },
  };
  const artworkProcessingPrompt = buildArtworkProcessingPrompt(canvasInput);
  const videoGenerationPrompt = buildVideoGenerationPrompt(canvasInput);
  const combinedCanvasPrompt = `${artworkProcessingPrompt}\n${videoGenerationPrompt}`;
  const canvasFacts = {
    processingRemovesTextAndMarks: textIncludesAll(artworkProcessingPrompt, [
      'Remove all text',
      'logos',
      'watermarks',
    ]),
    processingUsesCanvasDimensions: textIncludesAll(artworkProcessingPrompt, [
      '1080x1920',
      '9:16 portrait',
    ]),
    videoIncludesSyntheticReleaseContext: textIncludesAll(
      videoGenerationPrompt,
      ['Neon Reef', 'Luna Waves']
    ),
    videoUsesRequestedMotion: textIncludesAll(videoGenerationPrompt, [
      'subtle floating particles',
    ]),
    videoPreservesLoopAndSpecs: textIncludesAll(videoGenerationPrompt, [
      'looping video',
      'Seamless loop',
      '30 fps',
      'H.264 codec',
      'MP4 container',
    ]),
    videoBlocksTextAndUi: textIncludesAll(videoGenerationPrompt, [
      'No text or UI elements',
    ]),
  };

  const bioDraft = buildArtistBioDraft({
    artistName: 'Luna Waves',
    existingBio:
      'Luna Waves builds immersive ambient-pop pieces from modular synths, oceanic field recordings, and patient vocal fragments.',
    genres: ['ambient electronic', 'downtempo', 'left-field pop'],
    spotifyFollowers: 12_500,
    spotifyPopularity: 45,
    spotifyUrl: 'https://open.spotify.com/artist/synthetic-luna-waves',
    appleMusicUrl: 'https://music.apple.com/us/artist/synthetic-luna-waves',
    profileViews: 3420,
    releaseCount: 3,
    notableReleases: ['Neon Reef', 'Midnight Current', 'Solar Drift'],
  });
  const combinedBioText = [
    bioDraft.draft,
    ...bioDraft.facts,
    ...bioDraft.voiceDirectives,
  ].join('\n');
  const bioFacts = {
    draftUsesSyntheticArtist: textIncludesAll(bioDraft.draft, ['Luna Waves']),
    draftUsesMarketSignal: textIncludesAll(bioDraft.draft, [
      '12,500 Spotify followers',
    ]),
    draftUsesCatalogSignal: textIncludesAll(bioDraft.draft, [
      'Neon Reef',
      'Midnight Current',
      '3 releases',
    ]),
    draftUsesProfileSignal: textIncludesAll(bioDraft.draft, ['3,420 views']),
    factsAvoidInventingMissingMetrics: textIncludesAll(
      bioDraft.facts.join('\n'),
      [
        'Spotify followers: 12,500',
        'Spotify popularity: 45 / 100',
        'Spotify profile linked: yes',
        'Apple Music profile linked: yes',
      ]
    ),
    directivesRequireFactualGrounding: textIncludesAll(
      bioDraft.voiceDirectives.join('\n'),
      ['avoid fabricated achievements', 'verifiable data points']
    ),
  };

  return {
    target: 'ai-tool-prompt-contract',
    adapter: 'ai-tool-prompt-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    promptCase,
    expectedToolNames: uniqueSorted(expectedToolNames),
    requiredToolNames,
    missingExpectedToolNames: missingNames(
      requiredToolNames,
      expectedToolNames
    ),
    unknownExpectedToolNames: expectedToolNames
      .filter(toolName => !requiredToolNameSet.has(toolName))
      .sort(),
    albumArt: {
      toolName: 'generateAlbumArt',
      styleId: albumArtStyle.id,
      promptLength: albumArtPrompt.length,
      facts: albumArtFacts,
      missingFacts: Object.entries(albumArtFacts)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
      leakPatterns: promptLeakPatterns(albumArtPrompt),
    },
    canvas: {
      toolName: 'generateCanvasPlan',
      promptLengths: {
        artworkProcessing: artworkProcessingPrompt.length,
        videoGeneration: videoGenerationPrompt.length,
      },
      facts: canvasFacts,
      missingFacts: Object.entries(canvasFacts)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
      leakPatterns: promptLeakPatterns(combinedCanvasPrompt),
    },
    bio: {
      toolName: 'writeWorldClassBio',
      draftLength: bioDraft.draft.length,
      factCount: bioDraft.facts.length,
      voiceDirectiveCount: bioDraft.voiceDirectives.length,
      facts: bioFacts,
      missingFacts: Object.entries(bioFacts)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
      leakPatterns: promptLeakPatterns(combinedBioText),
    },
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.parse(JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function evaluateSkillCatalogSyncContract(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedSkillIds = toStringArray(coverage.expectedSkillIds);
  const expectedSkillIdSet = new Set(expectedSkillIds);
  const knownSkillIdSet = new Set(SKILL_REGISTRY_IDS);
  const syncScriptContent = registryPathContent(
    SKILLS_CATALOG_SYNC_SCRIPT_PATH
  );
  const webPackageJsonContent = registryPathContent(WEB_PACKAGE_JSON_PATH);
  const updatedAt = new Date('2026-01-01T00:00:00.000Z');

  const catalogRows = Object.entries(SKILL_REGISTRY)
    .map(([skillId, skill]) => {
      const isTool = skill.kind === 'tool';
      const row = isTool
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description ?? null,
            kind: 'tool' as const,
            version: skill.version,
            entitlementRequired: skill.entitlement ?? null,
            model: skill.model ?? null,
            promptPath: skill.promptPath ?? null,
            inputSchemaZodPath: skill.inputSchemaZodPath ?? null,
            outputSchemaZodPath: skill.outputSchemaZodPath ?? null,
            metadata: skill.metadata,
            updatedAt,
          }
        : {
            id: skill.id,
            name: skill.name,
            description: skill.description ?? null,
            kind: skill.kind,
            version: skill.version,
            entitlementRequired: skill.entitlement ?? null,
            model: skill.model ?? null,
            promptPath: skill.promptPath ?? null,
            metadata: skill.metadata,
            updatedAt,
          };
      const requiredFields = isTool
        ? [
            'id',
            'name',
            'kind',
            'version',
            'entitlementRequired',
            'model',
            'inputSchemaZodPath',
            'outputSchemaZodPath',
            'metadata',
          ]
        : [
            'id',
            'name',
            'kind',
            'version',
            'entitlementRequired',
            'model',
            'promptPath',
            'metadata',
          ];
      const missingRequiredFields = requiredFields.filter(field => {
        const value = (row as Record<string, unknown>)[field];
        return value === null || value === undefined || value === '';
      });
      const schemaResult = isTool
        ? insertToolsCatalogSchema.safeParse(row)
        : insertSkillsCatalogSchema.safeParse(row);
      const targetTable = isTool ? 'tools_catalog' : 'skills_catalog';

      return {
        id: skillId,
        kind: skill.kind,
        targetTable,
        schemaValid: schemaResult.success,
        schemaErrors: schemaResult.success
          ? []
          : schemaErrorMessages(schemaResult),
        metadataSerializable: isJsonSerializable(skill.metadata),
        missingRequiredFields,
        syncRowKeys: Object.keys(row).sort(),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const missingExpectedSkillIds = expectedSkillIds
    .filter(skillId => !knownSkillIdSet.has(skillId))
    .sort();
  const unknownExpectedSkillIds = SKILL_REGISTRY_IDS.filter(
    skillId => !expectedSkillIdSet.has(skillId)
  );
  const invalidCatalogRowSkillIds = catalogRows
    .filter(row => !row.schemaValid)
    .map(row => row.id);
  const schemaErrorsBySkill = Object.fromEntries(
    catalogRows
      .filter(row => row.schemaErrors.length > 0)
      .map(row => [row.id, row.schemaErrors])
  );

  return {
    target: 'skill-catalog-sync-contract',
    adapter: 'skill-catalog-sync-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    syncScriptPath: SKILLS_CATALOG_SYNC_SCRIPT_PATH,
    syncScriptPathExists: registryPathExists(SKILLS_CATALOG_SYNC_SCRIPT_PATH),
    syncScriptReferencesRegistry: syncScriptContent.includes('SKILL_REGISTRY'),
    syncScriptReferencesSkillsCatalog:
      syncScriptContent.includes('skillsCatalog'),
    syncScriptReferencesToolsCatalog:
      syncScriptContent.includes('toolsCatalog'),
    syncScriptUsesConflictUpsert:
      syncScriptContent.includes('onConflictDoUpdate'),
    syncScriptUsesSkipFlag: syncScriptContent.includes(
      'SKIP_SKILLS_CATALOG_SYNC'
    ),
    postbuildRunsCatalogSync:
      webPackageJsonContent.includes('"postbuild"') &&
      webPackageJsonContent.includes('scripts/sync-skills-catalog.ts'),
    expectedSkillIds: uniqueSorted(expectedSkillIds),
    requiredSkillIds: SKILL_REGISTRY_IDS,
    missingExpectedSkillIds,
    unknownExpectedSkillIds,
    catalogRows,
    catalogTableCounts: catalogRows.reduce<Record<string, number>>(
      (counts, row) => {
        counts[row.targetTable] = (counts[row.targetTable] ?? 0) + 1;
        return counts;
      },
      {}
    ),
    invalidCatalogRowSkillIds,
    schemaErrorsBySkill,
    nonSerializableMetadataSkillIds: catalogRows
      .filter(row => !row.metadataSerializable)
      .map(row => row.id),
    missingRequiredSyncFieldSkillIds: catalogRows
      .filter(row => row.missingRequiredFields.length > 0)
      .map(row => row.id),
    missingRequiredSyncFieldsBySkill: Object.fromEntries(
      catalogRows
        .filter(row => row.missingRequiredFields.length > 0)
        .map(row => [row.id, row.missingRequiredFields])
    ),
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
  };
}

function evaluateSkillCommandContract(vars: EvalVars) {
  const coverage = toObject(vars.coverage);
  const expectedVisibleSkillIds = toStringArray(
    coverage.expectedVisibleSkillIds
  );
  const expectedVisibleSkillIdSet = new Set(expectedVisibleSkillIds);
  const knownVisibleSkillIdSet = new Set(ALL_COMMAND_SKILL_NAMES);
  const commandIds = COMMANDS.map(command => command.id);
  const duplicateCommandIds = commandIds
    .filter((commandId, index) => commandIds.indexOf(commandId) !== index)
    .sort();
  const releaseId = '00000000-0000-4000-8000-000000009001';

  const commandSkills = COMMANDS.filter(command => command.kind === 'skill')
    .map(command => {
      const token = serializeSkill(command.id);
      const parsedTokens = parseTokens(`please ${token} now`);
      const parsedSkillIds = parsedTokens
        .filter(tokenPart => tokenPart.type === 'skill')
        .map(tokenPart => tokenPart.id);
      const extractedSkill = extractSkill(`please ${token} now`);
      const roundTrip = serializeTokens(parseTokens(token));
      const schema =
        ALL_EVAL_TOOL_SCHEMAS[command.id as keyof typeof ALL_EVAL_TOOL_SCHEMAS];
      const requiresRelease = command.entitySlots.some(
        slot => slot.kind === 'release' && slot.required
      );
      const releaseSchemaSupportsEntity =
        !requiresRelease ||
        schema?.inputSchema.safeParse({ releaseId }).success === true ||
        schema?.inputSchema.safeParse({ releaseTitle: 'Neon Reef' }).success ===
          true;

      return {
        id: command.id,
        label: command.label,
        description: command.description,
        iconName: command.iconName,
        surfaces: [...command.surfaces],
        entitySlots: command.entitySlots.map(slot => ({
          kind: slot.kind,
          required: slot.required,
        })),
        schemaExists: Boolean(schema),
        inChatSlash: CHAT_SLASH_SKILL_NAMES.includes(command.id),
        inCmdk: CMDK_SKILL_NAMES.includes(command.id),
        token,
        parsedSkillIds,
        extractedSkillId: extractedSkill?.id ?? null,
        roundTrip,
        tokenRoundTripValid: roundTrip === token,
        tokenParsedValid:
          parsedSkillIds.length === 1 && parsedSkillIds[0] === command.id,
        tokenExtractValid: extractedSkill?.id === command.id,
        requiresRelease,
        releaseSchemaSupportsEntity,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  const hiddenCommandCollisions = ALL_COMMAND_SKILL_NAMES.filter(toolName =>
    HIDDEN_TOOL_NAMES.includes(toolName)
  );

  return {
    target: 'skill-command-contract',
    adapter: 'skill-command-contract',
    costTier: 'deterministic',
    text: '',
    selectedModel: null,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    expectedVisibleSkillIds: uniqueSorted(expectedVisibleSkillIds),
    commandSkillNames: ALL_COMMAND_SKILL_NAMES,
    chatSlashSkillNames: CHAT_SLASH_SKILL_NAMES,
    cmdkSkillNames: CMDK_SKILL_NAMES,
    hiddenToolNames: HIDDEN_TOOL_NAMES,
    commandSkills,
    missingExpectedVisibleSkillIds: expectedVisibleSkillIds
      .filter(skillId => !knownVisibleSkillIdSet.has(skillId))
      .sort(),
    unknownExpectedVisibleSkillIds: ALL_COMMAND_SKILL_NAMES.filter(
      skillId => !expectedVisibleSkillIdSet.has(skillId)
    ),
    duplicateCommandIds: uniqueSorted(duplicateCommandIds),
    commandSkillSchemaMissingIds: commandSkills
      .filter(command => !command.schemaExists)
      .map(command => command.id),
    commandSkillMissingLabelIds: commandSkills
      .filter(
        command =>
          !command.label.trim() ||
          !command.description.trim() ||
          !command.iconName.trim()
      )
      .map(command => command.id),
    commandSkillInvalidIconIds: commandSkills
      .filter(command => !/^[A-Z][A-Za-z0-9]*$/.test(command.iconName))
      .map(command => command.id),
    commandSkillMissingChatSlashIds: commandSkills
      .filter(command => !command.inChatSlash)
      .map(command => command.id),
    commandSkillMissingCmdkIds: commandSkills
      .filter(command => !command.inCmdk)
      .map(command => command.id),
    commandSkillTokenRoundTripFailureIds: commandSkills
      .filter(command => !command.tokenRoundTripValid)
      .map(command => command.id),
    commandSkillTokenParseFailureIds: commandSkills
      .filter(command => !command.tokenParsedValid)
      .map(command => command.id),
    commandSkillTokenExtractFailureIds: commandSkills
      .filter(command => !command.tokenExtractValid)
      .map(command => command.id),
    commandSkillReleaseEntitySchemaMissingIds: commandSkills
      .filter(
        command =>
          command.requiresRelease && !command.releaseSchemaSupportsEntity
      )
      .map(command => command.id),
    hiddenCommandCollisions,
    toolCalls: [],
    toolResults: [],
    toolExecutions: [],
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
        destinationLabel: 'Spotify Playlist',
        target: 'playlist',
        pitch: {
          target: 'playlist',
          platform: 'spotify',
          destinationLabel: 'Spotify Playlist',
          audience: 'streaming editorial or independent playlist curator',
          subjectLine: 'Tidal Drift pitch',
          body: 'Synthetic Spotify playlist pitch for Tidal Drift.',
          generatedAt: '2026-05-25T00:00:00.000Z',
          modelUsed: 'eval',
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
  const pitch = toObject(output.pitch);

  return (
    output.success === true &&
    (output.releaseTitle === undefined ||
      typeof output.releaseTitle === 'string') &&
    typeof output.destinationLabel === 'string' &&
    typeof pitch.target === 'string' &&
    (typeof pitch.platform === 'string' || pitch.platform === null) &&
    typeof pitch.destinationLabel === 'string' &&
    typeof pitch.audience === 'string' &&
    (typeof pitch.subjectLine === 'string' || pitch.subjectLine === null) &&
    typeof pitch.body === 'string'
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
  readonly accessCase: string | null;
  readonly toolName: string | null;
  readonly modelScenario: string | null;
  readonly expectedModel: string | null;
  readonly eventCase: string | null;
  readonly aiToolPromptCase: string | null;
  readonly knowledgeCase: string | null;
  readonly promptCase: string | null;
  readonly renderCase: string | null;
  readonly resultShapeCase: string | null;
  readonly sequenceCase: string | null;
  readonly skillArtifactCase: string | null;
  readonly skillCatalogCase: string | null;
  readonly skillCommandCase: string | null;
  readonly skillPromptCase: string | null;
  readonly skillRegistryCase: string | null;
  readonly stateCase: string | null;
  readonly welcomeCase: string | null;
  readonly webRouteCase: string | null;
  readonly httpCase: string | null;
  readonly mode: string | null;
  readonly plan: string | null;
  readonly assertions: readonly string[];
  readonly confirmRouteCase: string | null;
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
    accessCase: scalarValue(block, 'accessCase'),
    toolName: scalarValue(block, 'toolName'),
    modelScenario: scalarValue(block, 'modelScenario'),
    expectedModel: scalarValue(block, 'expectedModel'),
    eventCase: scalarValue(block, 'eventCase'),
    aiToolPromptCase: scalarValue(block, 'aiToolPromptCase'),
    knowledgeCase: scalarValue(block, 'knowledgeCase'),
    promptCase: scalarValue(block, 'promptCase'),
    renderCase: scalarValue(block, 'renderCase'),
    resultShapeCase: scalarValue(block, 'resultShapeCase'),
    sequenceCase: scalarValue(block, 'sequenceCase'),
    skillArtifactCase: scalarValue(block, 'skillArtifactCase'),
    skillCatalogCase: scalarValue(block, 'skillCatalogCase'),
    skillCommandCase: scalarValue(block, 'skillCommandCase'),
    skillPromptCase: scalarValue(block, 'skillPromptCase'),
    skillRegistryCase: scalarValue(block, 'skillRegistryCase'),
    stateCase: scalarValue(block, 'stateCase'),
    welcomeCase: scalarValue(block, 'welcomeCase'),
    webRouteCase: scalarValue(block, 'webRouteCase'),
    httpCase: scalarValue(block, 'httpCase'),
    mode: scalarValue(block, 'mode') ?? 'app',
    plan: scalarValue(block, 'plan') ?? 'pro',
    assertions,
    confirmRouteCase: scalarValue(block, 'confirmRouteCase'),
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

function caseNamesForCases(cases: readonly EvalCaseSummary[]): string[] {
  return uniqueSorted(cases.map(testCase => testCase.description));
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
  const allowedCostTiers = new Set<string>(ALLOWED_EVAL_COST_TIERS);
  const liveModelCostTiers = new Set<string>(LIVE_MODEL_COST_TIERS);
  const liveHttpCostTiers = new Set<string>(LIVE_HTTP_COST_TIERS);
  const liveModelTargets = new Set<string>(LIVE_MODEL_TARGETS);
  const liveHttpTargets = new Set<string>(LIVE_HTTP_TARGETS);
  const liveTargetCases = cases.filter(
    testCase =>
      typeof testCase.target === 'string' &&
      (liveModelTargets.has(testCase.target) ||
        liveHttpTargets.has(testCase.target))
  );
  const liveModelCases = cases.filter(
    testCase =>
      typeof testCase.target === 'string' &&
      liveModelTargets.has(testCase.target)
  );
  const liveHttpCases = cases.filter(
    testCase =>
      typeof testCase.target === 'string' &&
      liveHttpTargets.has(testCase.target)
  );
  const liveHttpCaseNames = uniqueSorted(
    liveHttpCases
      .map(testCase => testCase.httpCase)
      .filter((httpCase): httpCase is string => typeof httpCase === 'string')
  );
  const missingCostTierCaseNames = caseNamesForCases(
    cases.filter(testCase => testCase.cost === null)
  );
  const unknownCostTierCaseNames = caseNamesForCases(
    cases.filter(
      testCase =>
        typeof testCase.cost === 'string' &&
        !allowedCostTiers.has(testCase.cost)
    )
  );
  const deterministicLiveTargetCaseNames = caseNamesForCases(
    deterministicCases.filter(
      testCase =>
        typeof testCase.target === 'string' &&
        (liveModelTargets.has(testCase.target) ||
          liveHttpTargets.has(testCase.target))
    )
  );
  const liveModelInvalidCostCaseNames = caseNamesForCases(
    liveModelCases.filter(
      testCase =>
        typeof testCase.cost !== 'string' ||
        !liveModelCostTiers.has(testCase.cost)
    )
  );
  const liveHttpInvalidCostCaseNames = caseNamesForCases(
    liveHttpCases.filter(
      testCase =>
        typeof testCase.cost !== 'string' ||
        !liveHttpCostTiers.has(testCase.cost)
    )
  );
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
  const modelContractCases = deterministicCases.filter(
    testCase => testCase.target === 'model-contract'
  );
  const modelRoutingScenarioNames = uniqueSorted(
    modelContractCases
      .map(testCase => testCase.modelScenario)
      .filter(
        (modelScenario): modelScenario is string =>
          typeof modelScenario === 'string'
      )
  );
  const modelRoutingBoundaryNames = uniqueSorted(
    modelContractCases
      .map(testCase => testCase.expectedModel)
      .filter(
        (expectedModel): expectedModel is string =>
          expectedModel === 'light' || expectedModel === 'primary'
      )
  );
  const knowledgeCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'knowledge-contract')
      .map(testCase => testCase.knowledgeCase)
      .filter(
        (knowledgeCase): knowledgeCase is string =>
          typeof knowledgeCase === 'string'
      )
  );
  const promptContextCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'prompt-context-contract')
      .map(testCase => testCase.promptCase)
      .filter(
        (promptCase): promptCase is string => typeof promptCase === 'string'
      )
  );
  const toolAccessCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'tool-access-contract')
      .map(testCase => testCase.accessCase)
      .filter(
        (accessCase): accessCase is string => typeof accessCase === 'string'
      )
  );
  const aiToolPromptCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'ai-tool-prompt-contract')
      .map(testCase => testCase.aiToolPromptCase)
      .filter(
        (aiToolPromptCase): aiToolPromptCase is string =>
          typeof aiToolPromptCase === 'string'
      )
  );
  const skillArtifactCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'skill-artifact-contract')
      .map(testCase => testCase.skillArtifactCase)
      .filter(
        (skillArtifactCase): skillArtifactCase is string =>
          typeof skillArtifactCase === 'string'
      )
  );
  const skillCatalogCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'skill-catalog-sync-contract')
      .map(testCase => testCase.skillCatalogCase)
      .filter(
        (skillCatalogCase): skillCatalogCase is string =>
          typeof skillCatalogCase === 'string'
      )
  );
  const skillCommandCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'skill-command-contract')
      .map(testCase => testCase.skillCommandCase)
      .filter(
        (skillCommandCase): skillCommandCase is string =>
          typeof skillCommandCase === 'string'
      )
  );
  const skillPromptCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'skill-prompt-contract')
      .map(testCase => testCase.skillPromptCase)
      .filter(
        (skillPromptCase): skillPromptCase is string =>
          typeof skillPromptCase === 'string'
      )
  );
  const skillRegistryCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'skill-registry-inventory')
      .map(testCase => testCase.skillRegistryCase)
      .filter(
        (skillRegistryCase): skillRegistryCase is string =>
          typeof skillRegistryCase === 'string'
      )
  );
  const onboardingStateCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'onboarding-state-contract')
      .map(testCase => testCase.stateCase)
      .filter((stateCase): stateCase is string => typeof stateCase === 'string')
  );
  const onboardingToolSequenceCaseNames = uniqueSorted(
    deterministicCases
      .filter(
        testCase => testCase.target === 'onboarding-tool-sequence-contract'
      )
      .map(testCase => testCase.sequenceCase)
      .filter(
        (sequenceCase): sequenceCase is string =>
          typeof sequenceCase === 'string'
      )
  );
  const toolResultShapeCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'tool-result-shape-contract')
      .map(testCase => testCase.resultShapeCase)
      .filter(
        (resultShapeCase): resultShapeCase is string =>
          typeof resultShapeCase === 'string'
      )
  );
  const welcomeChatCaseNames = uniqueSorted(
    deterministicCases
      .filter(
        testCase => testCase.target === 'onboarding-welcome-chat-contract'
      )
      .map(testCase => testCase.welcomeCase)
      .filter(
        (welcomeCase): welcomeCase is string => typeof welcomeCase === 'string'
      )
  );
  const webChatPremodelCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'web-chat-route')
      .map(testCase => testCase.webRouteCase)
      .filter(
        (webRouteCase): webRouteCase is string =>
          typeof webRouteCase === 'string'
      )
  );
  const onboardingRoutePremodelCaseNames = uniqueSorted(
    deterministicCases
      .filter(
        testCase =>
          testCase.target === 'web-chat-route' && testCase.mode === 'onboarding'
      )
      .map(testCase => testCase.webRouteCase)
      .filter(
        (webRouteCase): webRouteCase is string =>
          typeof webRouteCase === 'string'
      )
  );
  const chatConfirmRouteCaseNames = uniqueSorted(
    deterministicCases
      .filter(testCase => testCase.target === 'chat-confirm-route')
      .map(testCase => testCase.confirmRouteCase)
      .filter(
        (confirmRouteCase): confirmRouteCase is string =>
          typeof confirmRouteCase === 'string'
      )
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
    allowedCostTiers: [...ALLOWED_EVAL_COST_TIERS],
    liveModelCostTiers: [...LIVE_MODEL_COST_TIERS],
    liveHttpCostTiers: [...LIVE_HTTP_COST_TIERS],
    liveTargetCaseCount: liveTargetCases.length,
    liveModelCaseCount: liveModelCases.length,
    liveHttpCaseCount: liveHttpCases.length,
    liveHttpCaseNames,
    missingLiveHttpCaseNames: missingNames(
      REQUIRED_LIVE_HTTP_CASES,
      liveHttpCaseNames
    ),
    missingCostTierCaseNames,
    unknownCostTierCaseNames,
    deterministicLiveTargetCaseNames,
    liveModelInvalidCostCaseNames,
    liveHttpInvalidCostCaseNames,
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
    requiredModelRoutingScenarioNames: [...REQUIRED_MODEL_ROUTING_SCENARIOS],
    modelRoutingScenarioNames,
    missingModelRoutingScenarioNames: missingNames(
      REQUIRED_MODEL_ROUTING_SCENARIOS,
      modelRoutingScenarioNames
    ),
    requiredModelRoutingBoundaryNames: ['light', 'primary'],
    modelRoutingBoundaryNames,
    missingModelRoutingBoundaryNames: missingNames(
      ['light', 'primary'],
      modelRoutingBoundaryNames
    ),
    requiredKnowledgeCaseNames: [...REQUIRED_KNOWLEDGE_CASES],
    knowledgeCaseNames,
    missingKnowledgeCaseNames: missingNames(
      REQUIRED_KNOWLEDGE_CASES,
      knowledgeCaseNames
    ),
    requiredPromptContextCaseNames: [...REQUIRED_PROMPT_CONTEXT_CASES],
    promptContextCaseNames,
    missingPromptContextCaseNames: missingNames(
      REQUIRED_PROMPT_CONTEXT_CASES,
      promptContextCaseNames
    ),
    requiredToolAccessCaseNames: [...REQUIRED_TOOL_ACCESS_CASES],
    toolAccessCaseNames,
    missingToolAccessCaseNames: missingNames(
      REQUIRED_TOOL_ACCESS_CASES,
      toolAccessCaseNames
    ),
    requiredAiToolPromptCaseNames: [...REQUIRED_AI_TOOL_PROMPT_CASES],
    aiToolPromptCaseNames,
    missingAiToolPromptCaseNames: missingNames(
      REQUIRED_AI_TOOL_PROMPT_CASES,
      aiToolPromptCaseNames
    ),
    requiredSkillArtifactCaseNames: [...REQUIRED_SKILL_ARTIFACT_CASES],
    skillArtifactCaseNames,
    missingSkillArtifactCaseNames: missingNames(
      REQUIRED_SKILL_ARTIFACT_CASES,
      skillArtifactCaseNames
    ),
    requiredSkillCatalogCaseNames: [...REQUIRED_SKILL_CATALOG_CASES],
    skillCatalogCaseNames,
    missingSkillCatalogCaseNames: missingNames(
      REQUIRED_SKILL_CATALOG_CASES,
      skillCatalogCaseNames
    ),
    requiredSkillCommandCaseNames: [...REQUIRED_SKILL_COMMAND_CASES],
    skillCommandCaseNames,
    missingSkillCommandCaseNames: missingNames(
      REQUIRED_SKILL_COMMAND_CASES,
      skillCommandCaseNames
    ),
    requiredSkillPromptCaseNames: [...REQUIRED_SKILL_PROMPT_CASES],
    skillPromptCaseNames,
    missingSkillPromptCaseNames: missingNames(
      REQUIRED_SKILL_PROMPT_CASES,
      skillPromptCaseNames
    ),
    requiredSkillRegistryCaseNames: [...REQUIRED_SKILL_REGISTRY_CASES],
    skillRegistryCaseNames,
    missingSkillRegistryCaseNames: missingNames(
      REQUIRED_SKILL_REGISTRY_CASES,
      skillRegistryCaseNames
    ),
    requiredOnboardingStateCaseNames: [...REQUIRED_ONBOARDING_STATE_CASES],
    onboardingStateCaseNames,
    missingOnboardingStateCaseNames: missingNames(
      REQUIRED_ONBOARDING_STATE_CASES,
      onboardingStateCaseNames
    ),
    requiredOnboardingToolSequenceCaseNames: [
      ...REQUIRED_ONBOARDING_TOOL_SEQUENCE_CASES,
    ],
    onboardingToolSequenceCaseNames,
    missingOnboardingToolSequenceCaseNames: missingNames(
      REQUIRED_ONBOARDING_TOOL_SEQUENCE_CASES,
      onboardingToolSequenceCaseNames
    ),
    requiredToolResultShapeCaseNames: [...REQUIRED_TOOL_RESULT_SHAPE_CASES],
    toolResultShapeCaseNames,
    missingToolResultShapeCaseNames: missingNames(
      REQUIRED_TOOL_RESULT_SHAPE_CASES,
      toolResultShapeCaseNames
    ),
    requiredWelcomeChatCaseNames: [...REQUIRED_WELCOME_CHAT_CASES],
    welcomeChatCaseNames,
    missingWelcomeChatCaseNames: missingNames(
      REQUIRED_WELCOME_CHAT_CASES,
      welcomeChatCaseNames
    ),
    requiredWebChatPremodelCaseNames: [...REQUIRED_WEB_CHAT_PREMODEL_CASES],
    webChatPremodelCaseNames,
    missingWebChatPremodelCaseNames: missingNames(
      REQUIRED_WEB_CHAT_PREMODEL_CASES,
      webChatPremodelCaseNames
    ),
    requiredOnboardingRoutePremodelCaseNames: [
      ...REQUIRED_ONBOARDING_ROUTE_PREMODEL_CASES,
    ],
    onboardingRoutePremodelCaseNames,
    missingOnboardingRoutePremodelCaseNames: missingNames(
      REQUIRED_ONBOARDING_ROUTE_PREMODEL_CASES,
      onboardingRoutePremodelCaseNames
    ),
    requiredChatConfirmRouteCaseNames: [...REQUIRED_CHAT_CONFIRM_ROUTE_CASES],
    chatConfirmRouteCaseNames,
    missingChatConfirmRouteCaseNames: missingNames(
      REQUIRED_CHAT_CONFIRM_ROUTE_CASES,
      chatConfirmRouteCaseNames
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

    if (target === 'chat-confirm-route') {
      const payload = evaluateChatConfirmRouteContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'mobile-chat-route') {
      const payload = evaluateMobileChatRouteContract(prompt, vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'onboarding-welcome-chat-contract') {
      const payload = evaluateOnboardingWelcomeChatContract(vars);
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

    if (target === 'knowledge-contract') {
      const payload = evaluateKnowledgeContract(prompt, vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'onboarding-state-contract') {
      const payload = evaluateOnboardingStateContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'onboarding-tool-sequence-contract') {
      const payload = evaluateOnboardingToolSequenceContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'prompt-context-contract') {
      const payload = evaluateSystemPromptContract(prompt, vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'skill-artifact-contract') {
      const payload = evaluateSkillArtifactContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'skill-catalog-sync-contract') {
      const payload = evaluateSkillCatalogSyncContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'skill-command-contract') {
      const payload = evaluateSkillCommandContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'skill-prompt-contract') {
      const payload = evaluateSkillPromptContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'ai-tool-prompt-contract') {
      const payload = evaluateAiToolPromptContract(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'skill-registry-inventory') {
      const payload = evaluateSkillRegistryInventory(vars);
      return {
        output: JSON.stringify(payload),
        raw: payload,
        format: 'json',
        latencyMs: Date.now() - startedAt,
      };
    }

    if (target === 'tool-access-contract') {
      const payload = evaluateToolAccessContract(vars);
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

    if (target === 'tool-result-shape-contract') {
      const payload = evaluateToolResultShapeContract(vars);
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
