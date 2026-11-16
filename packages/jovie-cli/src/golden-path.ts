import {
  JovieInputError,
  JovieRequestError,
  normalizeBaseUrl,
  type ResourceOptions,
  requestJson,
} from './client.js';

// Re-exported for command ergonomics.
export type { ResourceOptions };

/**
 * Golden-path commands (founder order 2026-11-09): the same seven MCP tools
 * the /start flow serves, called through the same /api/mcp transport the
 * drafts use. The CLI holds no state: the caller keeps the draft_id and
 * draft_token from `artist.search_or_import` / `workspace.create_draft` and
 * passes them on every step (the draft capability is the only write auth).
 */

const GOLDEN_PATH_MCP_PATH = '/api/mcp';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DraftRefInput {
  readonly 'draft-id': string;
  readonly 'draft-token': string;
}

/** Validate and shape the draft reference every golden-path step needs. */
export function draftRef(flags: Readonly<Record<string, string | undefined>>) {
  const draftId = flags['draft-id']?.trim() ?? '';
  const draftToken = flags['draft-token']?.trim() ?? '';
  if (!UUID.test(draftId)) {
    throw new JovieInputError(
      'A valid --draft-id (uuid) from workspace.create_draft is required.'
    );
  }
  if (!draftToken || draftToken.length > 8192) {
    throw new JovieInputError(
      'A --draft-token from artist.search_or_import is required (kept private; never share it).'
    );
  }
  return { draft_id: draftId, draft_token: draftToken };
}

interface McpToolResponse {
  readonly jsonrpc?: string;
  readonly id?: string;
  readonly error?: unknown;
  readonly result?: {
    readonly isError?: boolean;
    readonly structuredContent?: unknown;
  } | null;
}

async function runGoldenPathTool(
  tool: string,
  args: Record<string, unknown>,
  options: ResourceOptions
): Promise<unknown> {
  const id = 'jovie-golden-path';
  const url = `${normalizeBaseUrl(options.baseUrl)}${GOLDEN_PATH_MCP_PATH}`;
  const response = (await requestJson(GOLDEN_PATH_MCP_PATH, options, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: tool, arguments: args },
  })) as McpToolResponse | null;
  const result = response?.result;
  if (
    response?.jsonrpc !== '2.0' ||
    response.id !== id ||
    response.error ||
    !result ||
    typeof result.structuredContent !== 'object' ||
    result.structuredContent === null ||
    Array.isArray(result.structuredContent)
  ) {
    throw new JovieRequestError(
      'Golden path returned an invalid MCP response.',
      url,
      undefined,
      undefined,
      undefined,
      'INVALID_RESPONSE',
      false
    );
  }
  const content = result.structuredContent as Record<string, unknown>;
  if (result.isError || content.status === 'error') {
    const code =
      typeof content.code === 'string' && /^[A-Z_]{1,64}$/.test(content.code)
        ? content.code
        : 'GOLDEN_PATH_FAILED';
    throw new JovieRequestError(
      `Golden path step failed: ${code}`,
      url,
      undefined,
      undefined,
      undefined,
      code,
      content.retryable === true
    );
  }
  return content;
}

/** Check and reserve jov.ie/<handle> for the draft artist. */
export function claimHandle(
  handle: string,
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('claim_handle', { ...ref, handle }, options);
}

export const GOLDEN_PATH_QUESTIONS = [
  {
    id: 'lastGrowthAttempt' as const,
    question:
      "What's the last thing you did to grow your fans, and how did it go?",
  },
  {
    id: 'promoSpend' as const,
    question: 'What do you pay each month to promote your music?',
    answers: ['none', 'under_50', '50_plus'] as const,
  },
] as const;

/** Record one Mom Test answer on the draft. */
export function answerOnboardingQuestion(
  question: string,
  answer: string,
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool(
    'answer_onboarding_question',
    { ...ref, question, answer },
    options
  );
}

/** Run the shared qualification decision for the draft artist. */
export function getQualification(
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('get_qualification', ref, options);
}

/** Build the draft profile from public data (value before paywall). */
export function buildProfile(
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('build_profile', ref, options);
}

/** Publish step: routes the person to claim_url; never publishes agent-side. */
export function publishProfile(
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('publish_profile', ref, options);
}

/** Share an already-public profile: URL plus a factual share line. */
export function shareProfile(
  username: string,
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('share_profile', { username }, options);
}

/** Return the existing checkout entry for the draft artist. */
export function startUpgrade(
  ref: { draft_id: string; draft_token: string },
  options: ResourceOptions = {}
): Promise<unknown> {
  return runGoldenPathTool('start_upgrade', ref, options);
}
