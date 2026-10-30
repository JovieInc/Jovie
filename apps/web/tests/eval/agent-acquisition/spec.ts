/**
 * Over-trigger eval spec for the ChatGPT artist-app listing (JOV-9688).
 *
 * Two hard requirements from the listing issue:
 *   - 20 artist-intent prompts must drive the acquisition tools;
 *   - 20 listener prompts must never create drafts.
 *
 * A transcript is the ordered list of acquisition tool names an assistant
 * called for one prompt. The scorer is model-free so the deterministic CI
 * lane can prove the case set and the checks stay sound; a live lane can
 * reuse both against a real client transcript.
 */

/** Tools that create or change agent drafts. Listener prompts may never call these. */
export const DRAFT_CREATING_TOOLS = [
  'workspace.create_draft',
  'release.prepare_launch',
] as const;

/** Every artist-intent chain must resolve an exact identity before drafting. */
export const ARTIST_CHAIN_ENTRY_TOOL = 'artist.search_or_import';

export interface ArtistIntentCase {
  readonly id: string;
  readonly prompt: string;
  /** Acquisition tools the assistant must call, in call order. */
  readonly requiredToolCalls: readonly string[];
}

export interface ListenerCase {
  readonly id: string;
  readonly prompt: string;
}

export interface OverTriggerVerdict {
  readonly passed: boolean;
  readonly reason: string;
}

function isSubsequence(
  required: readonly string[],
  calls: readonly string[]
): boolean {
  let cursor = 0;
  for (const call of calls) {
    if (cursor < required.length && call === required[cursor]) cursor += 1;
  }
  return cursor === required.length;
}

/** True when the assistant called every required tool, in order. */
export function scoreArtistIntentCase(
  testCase: ArtistIntentCase,
  calls: readonly string[]
): OverTriggerVerdict {
  if (calls.length === 0)
    return {
      passed: false,
      reason: 'artist prompt answered with no acquisition tool call',
    };
  if (!isSubsequence(testCase.requiredToolCalls, calls))
    return {
      passed: false,
      reason: `required tool chain ${testCase.requiredToolCalls.join(' -> ')} not called in order (saw: ${calls.join(', ') || 'none'})`,
    };
  return { passed: true, reason: 'required tool chain called in order' };
}

/** True when a listener prompt produced no draft-creating call. */
export function scoreListenerCase(
  calls: readonly string[]
): OverTriggerVerdict {
  const offending = calls.filter(call =>
    (DRAFT_CREATING_TOOLS as readonly string[]).includes(call)
  );
  if (offending.length > 0)
    return {
      passed: false,
      reason: `listener prompt created a draft via ${offending.join(', ')}`,
    };
  return { passed: true, reason: 'no draft-creating tool called' };
}
