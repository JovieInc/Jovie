import 'server-only';

import { z } from 'zod';
import { env } from '@/lib/env-server';
import { normalizeHermesAllowedPaths } from '@/lib/hermes/allowed-paths';
import { serverFetch } from '@/lib/http/server-fetch';
import type {
  HermesCliRuntime,
  HermesDispatchAvailability,
  HermesDispatchPayload,
  HermesDispatchResult,
} from '@/types/ai-ops';

const DISPATCH_TIMEOUT_MS = 5000;
const HERMES_DISPATCH_EVENT = 'hermes_cli_worker' as const;
const HERMES_RUNTIMES: readonly HermesCliRuntime[] = [
  'codex-cli',
  'claude-code',
  'ruflo',
];
const DEFAULT_SKILLS = ['autoplan'] as const;
const DEFAULT_ALLOWED_PATHS = ['apps/web', 'scripts', '.github/workflows'];
const DEFAULT_VERIFICATION = [
  'pnpm --filter @jovie/web run typecheck -- --pretty false',
] as const;

const SAFE_PATH_REGEX = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/@-]+$/;
const SAFE_SKILL_REGEX = /^\/?[a-z][a-z0-9-]{1,48}$/;
const SAFE_VERIFICATION_PREFIXES = [
  'pnpm ',
  'pnpm --filter ',
  'bash scripts/automation-verify.sh ',
] as const;

export class HermesDispatchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HermesDispatchConfigurationError';
  }
}

export class HermesDispatchGitHubError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'HermesDispatchGitHubError';
  }
}

const HermesDispatchRequestSchema = z.object({
  source: z.enum(['github', 'linear', 'sentry', 'hermes', 'hermes-air', 'ci']),
  sourceId: z.string().trim().min(1).max(160).optional(),
  sourceUrl: z
    .union([z.string().trim().url(), z.literal(''), z.null()])
    .optional(),
  kind: z.enum([
    'triage',
    'bug_patch',
    'code_review',
    'qa',
    'investigation',
    'support_draft',
  ]),
  runtime: z.enum(HERMES_RUNTIMES),
  priority: z.number().int().min(0).max(100).optional(),
  skills: z.array(z.string().trim().regex(SAFE_SKILL_REGEX)).max(8).optional(),
  allowedPaths: z
    .array(z.string().trim().regex(SAFE_PATH_REGEX))
    .max(20)
    .optional(),
  verification: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(180)
        .refine(
          command =>
            SAFE_VERIFICATION_PREFIXES.some(prefix =>
              command.startsWith(prefix)
            ),
          'Verification commands must use pnpm or scripts/automation-verify.sh'
        )
    )
    .max(8)
    .optional(),
  dryRun: z.boolean().optional(),
  prompt: z.string().trim().max(4000).optional(),
  owner: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
});

function normalizeSkill(skill: string): string {
  return skill.trim().replace(/^\//, '');
}

function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '-') {
    start += 1;
  }

  while (end > start && value[end - 1] === '-') {
    end -= 1;
  }

  return value.slice(start, end);
}

function slugify(value: string): string {
  const slug = trimHyphens(
    value
      .toLowerCase()
      .replace(/[^a-z0-9._/-]+/g, '-')
      .replace(/\/+/g, '-')
      .slice(0, 64)
  );

  return slug.length > 0 ? slug : 'manual';
}

function getDispatchRepoConfig():
  | { configured: true; owner: string; repo: string; token: string }
  | { configured: false; reason: string } {
  const token = env.GH_DISPATCH_TOKEN;
  const owner = env.HUD_GITHUB_OWNER ?? env.VERCEL_GIT_REPO_OWNER;
  const repo = env.HUD_GITHUB_REPO ?? env.VERCEL_GIT_REPO_SLUG;

  if (!token) {
    return {
      configured: false,
      reason: 'GH_DISPATCH_TOKEN is not configured.',
    };
  }
  if (!owner || !repo) {
    return {
      configured: false,
      reason:
        'HUD_GITHUB_OWNER/HUD_GITHUB_REPO or VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG must be configured.',
    };
  }

  return { configured: true, owner, repo, token };
}

export function getHermesDispatchAvailability(): HermesDispatchAvailability {
  const config = getDispatchRepoConfig();

  return {
    available: config.configured,
    unavailableReason: config.configured ? null : config.reason,
    runtimes: HERMES_RUNTIMES,
  };
}

export function normalizeHermesDispatchRequest(
  input: unknown,
  requestedAt = new Date()
): HermesDispatchPayload {
  const parsed = HermesDispatchRequestSchema.parse(input);
  const dispatchId = crypto.randomUUID();
  const sourceId =
    parsed.sourceId ??
    (parsed.sourceUrl && parsed.sourceUrl.length > 0
      ? parsed.sourceUrl
      : dispatchId);
  const branchSlug = slugify(`${parsed.kind}-${sourceId}`);

  return {
    source: parsed.source,
    sourceId,
    sourceUrl:
      typeof parsed.sourceUrl === 'string' && parsed.sourceUrl.length > 0
        ? parsed.sourceUrl
        : null,
    kind: parsed.kind,
    runtime: parsed.runtime,
    priority: parsed.priority ?? 50,
    skills:
      parsed.skills && parsed.skills.length > 0
        ? parsed.skills.map(normalizeSkill)
        : [...DEFAULT_SKILLS],
    allowedPaths:
      parsed.allowedPaths && parsed.allowedPaths.length > 0
        ? normalizeHermesAllowedPaths(parsed.allowedPaths)
        : [...DEFAULT_ALLOWED_PATHS],
    verification:
      parsed.verification && parsed.verification.length > 0
        ? parsed.verification
        : [...DEFAULT_VERIFICATION],
    dryRun: parsed.dryRun ?? false,
    prompt: parsed.prompt ?? '',
    owner: parsed.owner ?? null,
    dispatchId,
    branchName: `codex/hermes-${branchSlug}-${dispatchId.slice(0, 8)}`,
    requestedAt: requestedAt.toISOString(),
  };
}

export async function dispatchHermesWorker(
  request: unknown
): Promise<HermesDispatchResult> {
  const config = getDispatchRepoConfig();
  if (!config.configured) {
    throw new HermesDispatchConfigurationError(config.reason);
  }

  const payload = normalizeHermesDispatchRequest(request);
  const response = await serverFetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: HERMES_DISPATCH_EVENT,
        client_payload: payload,
      }),
      timeoutMs: DISPATCH_TIMEOUT_MS,
      context: 'GitHub repository dispatch for Hermes CLI worker',
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new HermesDispatchGitHubError(
      `GitHub dispatch failed (${response.status}): ${errorText}`,
      response.status
    );
  }

  return {
    dispatchId: payload.dispatchId,
    branchName: payload.branchName,
    eventType: HERMES_DISPATCH_EVENT,
    dryRun: payload.dryRun,
  };
}
