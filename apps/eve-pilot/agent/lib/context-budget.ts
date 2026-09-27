/** zai/glm-5.3-flash advertises a 1,048,576-token window, so Eve's default compaction (90%)
 * would let one long session re-send ~900K tokens per request before compacting. Compact at
 * ~60K instead (summer-config#107): the checkpoint keeps decisions, open work and references,
 * and the last 10 messages stay verbatim. */
export const EVE_PILOT_CONTEXT_TARGET_TOKENS = 60_000;
export const EVE_PILOT_MODEL_CONTEXT_WINDOW_TOKENS = 1_048_576;
export const EVE_PILOT_COMPACTION_THRESHOLD_PERCENT =
  EVE_PILOT_CONTEXT_TARGET_TOKENS / EVE_PILOT_MODEL_CONTEXT_WINDOW_TOKENS;
