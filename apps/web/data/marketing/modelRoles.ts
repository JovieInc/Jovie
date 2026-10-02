/**
 * Typed projection of `marketing_roles` in
 * scripts/backlog-orchestrator/config/model-registry.json (JOV-7248).
 *
 * The registry JSON is the source of truth; this file exists so app and
 * script code can read roles without bundling the whole engineering router
 * config. `tests/unit/marketing/model-roles.test.ts` fails on any drift.
 *
 * Marketing roles carry the one scoped exception to the registry's
 * `no_claude` rule (Tim White, 2026-09-29). Engineering routes are unchanged.
 */

export const MARKETING_MODEL_ROLES = [
  'strategist',
  'copywriter',
  'layout-chooser',
  'art-director',
  'image-gen',
  'video-gen',
  'judge-flagship',
  'judge-bulk',
  'vision-judge',
] as const;

export type MarketingModelRole = (typeof MARKETING_MODEL_ROLES)[number];

/** Preference order: included subscriptions first, paid API last. */
export const MARKETING_MODEL_CHANNEL_ORDER = [
  'subscription',
  'local',
  'gateway',
  'api',
] as const;

export type MarketingModelChannel =
  (typeof MARKETING_MODEL_CHANNEL_ORDER)[number];

export type MarketingModelModality = 'text' | 'vision' | 'image' | 'video';

export interface MarketingRoleModelCandidate {
  /** Route id, `family/model`, as the subscription CLIs and gateway expect. */
  readonly id: string;
  readonly family: string;
  readonly channel: MarketingModelChannel;
  readonly pool: string;
  /** 0-100, comparable only within a role. */
  readonly quality: number;
  readonly modalities: readonly MarketingModelModality[];
}

export const MARKETING_ROLE_MODEL_CANDIDATES: Readonly<
  Record<MarketingModelRole, readonly MarketingRoleModelCandidate[]>
> = {
  strategist: [
    {
      id: 'anthropic/claude-opus-5.5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 96,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-sol',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 88,
      modalities: ['text', 'vision'],
    },
    {
      id: 'zai/glm-5.3',
      family: 'zai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 80,
      modalities: ['text'],
    },
  ],
  copywriter: [
    {
      id: 'anthropic/claude-opus-5.5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 96,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-sol',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 88,
      modalities: ['text', 'vision'],
    },
    {
      id: 'zai/glm-5.3',
      family: 'zai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 80,
      modalities: ['text'],
    },
  ],
  'layout-chooser': [
    {
      id: 'anthropic/claude-sonnet-5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 86,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-terra',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 82,
      modalities: ['text', 'vision'],
    },
    {
      id: 'zai/glm-5.3-flash',
      family: 'zai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 65,
      modalities: ['text'],
    },
  ],
  'art-director': [
    {
      id: 'anthropic/claude-opus-5.5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 96,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-sol',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 88,
      modalities: ['text', 'vision'],
    },
  ],
  'image-gen': [
    {
      id: 'openai/gpt-image-1.5',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 88,
      modalities: ['image'],
    },
    {
      id: 'recraft/recraft-v3',
      family: 'recraft',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 74,
      modalities: ['image'],
    },
  ],
  'video-gen': [
    {
      id: 'hyperframes/composition',
      family: 'hyperframes',
      channel: 'local',
      pool: 'local',
      quality: 70,
      modalities: ['video'],
    },
  ],
  'judge-flagship': [
    {
      id: 'anthropic/claude-opus-5.5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 96,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-sol',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 88,
      modalities: ['text', 'vision'],
    },
    {
      id: 'zai/glm-5.3',
      family: 'zai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 82,
      modalities: ['text'],
    },
  ],
  'judge-bulk': [
    {
      id: 'openai/gpt-5.6-luna',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 74,
      modalities: ['text'],
    },
    {
      id: 'typesafe-ai/jev',
      family: 'typesafe-ai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 70,
      modalities: ['text'],
    },
    {
      id: 'zai/glm-5.3-flash',
      family: 'zai',
      channel: 'gateway',
      pool: 'vercel-gateway',
      quality: 65,
      modalities: ['text'],
    },
  ],
  'vision-judge': [
    {
      id: 'anthropic/claude-sonnet-5',
      family: 'anthropic',
      channel: 'subscription',
      pool: 'claude-code',
      quality: 86,
      modalities: ['text', 'vision'],
    },
    {
      id: 'openai/gpt-5.6-luna',
      family: 'openai',
      channel: 'subscription',
      pool: 'codex',
      quality: 74,
      modalities: ['text', 'vision'],
    },
  ],
};
