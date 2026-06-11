/** Max in-turn tool-loop steps for paid plans (aiCanUseTools). */
export const CHAT_TOOL_STEP_LIMIT_PAID = 8;

/** Max in-turn tool-loop steps for free plans (no advanced tools). */
export const CHAT_TOOL_STEP_LIMIT_FREE = 3;

export function resolveChatToolStepLimit(aiCanUseTools: boolean): number {
  return aiCanUseTools ? CHAT_TOOL_STEP_LIMIT_PAID : CHAT_TOOL_STEP_LIMIT_FREE;
}

type StepWithToolCalls = {
  readonly toolCalls?: ReadonlyArray<unknown>;
};

/**
 * True when the turn hit the configured step cap while the model still
 * wanted another tool round (last step issued tool calls).
 */
export function isChatToolStepCapExhausted(
  steps: ReadonlyArray<StepWithToolCalls>,
  stepLimit: number
): boolean {
  if (steps.length < stepLimit) {
    return false;
  }

  const lastStep = steps[steps.length - 1];
  return (lastStep?.toolCalls?.length ?? 0) > 0;
}
