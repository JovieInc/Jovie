import { createHash } from 'node:crypto';
import { getCanonCorpusSha } from '@/lib/chat/knowledge/canon-loader';
import { DEFAULT_EMBEDDING_MODEL } from '@/lib/chat/knowledge/embed';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';

/**
 * Hash-derived `RETRIEVAL_VERSION`.
 *
 * Stamps every chat-answer trace with a 12-char hash of the inputs that
 * shape the answer: system prompt fragment, retrieval config, model ids,
 * embedding model, canon corpus SHAs, and tool schemas (passed in by the
 * caller because `tools` is composed at request time).
 *
 * Computed deterministically from inputs — two pods on the same deploy
 * with the same canon files produce the same hash. `git_sha` is stored
 * alongside on the trace row so the hash can be reverse-looked-up to a
 * commit.
 */
export interface VersionInputs {
  systemPromptShape: string;
  retrievalConfig: Record<string, unknown>;
  toolSchemasFingerprint: string;
}

export const PROMPT_VERSION_PREFIX = 'v1';

/**
 * Reads `VERCEL_GIT_COMMIT_SHA` (set automatically on Vercel) so traces
 * can map a hash back to a specific deploy. Empty in local/dev.
 */
export function getGitSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
}

export function computeRetrievalVersion(inputs: VersionInputs): string {
  const hash = createHash('sha256');
  hash.update(`${PROMPT_VERSION_PREFIX}|`);
  hash.update(`${inputs.systemPromptShape}|`);
  hash.update(JSON.stringify(inputs.retrievalConfig));
  hash.update('|');
  hash.update(inputs.toolSchemasFingerprint);
  hash.update('|');
  hash.update(`${CHAT_MODEL}|${CHAT_MODEL_LIGHT}|${DEFAULT_EMBEDDING_MODEL}`);
  hash.update('|');
  hash.update(getCanonCorpusSha());
  return hash.digest('hex').slice(0, 12);
}

/**
 * Stable fingerprint of a tool set. Order-independent (sorted keys),
 * so reordering tool registration doesn't bump the version.
 */
export function fingerprintToolSchemas(toolNames: readonly string[]): string {
  return createHash('sha256')
    .update([...toolNames].sort().join('|'))
    .digest('hex')
    .slice(0, 12);
}
