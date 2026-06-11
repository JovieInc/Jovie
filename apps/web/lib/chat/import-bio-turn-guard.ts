import type { StepResult, ToolSet } from 'ai';

function stepHadSuccessfulBioImport(step: StepResult<ToolSet>): boolean {
  for (const toolResult of step.toolResults) {
    if (toolResult.toolName !== 'importBioFromUrl') continue;
    const output = toolResult.output as { ok?: boolean } | undefined;
    if (output?.ok === true) return true;
  }
  return false;
}

export function resolveImportBioRestrictedTools(
  steps: readonly StepResult<ToolSet>[],
  stepNumber: number
): Array<keyof ToolSet> | undefined {
  if (stepNumber === 0) return undefined;

  const hadSuccessfulImport = steps.some(stepHadSuccessfulBioImport);
  if (!hadSuccessfulImport) return undefined;

  return ['proposeProfileEdit'];
}
