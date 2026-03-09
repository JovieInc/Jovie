export interface RequiredProfileCompletionInput {
  displayName: string | null | undefined;
  avatarUrl: string | null | undefined;
  email: string | null | undefined;
  hasMusicLinks: boolean;
}

export interface RequiredProfileCompletionResult {
  hasName: boolean;
  hasAvatar: boolean;
  hasEmail: boolean;
  hasMusicLinks: boolean;
  completedCount: number;
  totalCount: number;
  percentage: number;
  isComplete: boolean;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Canonical profile completion calculation.
 *
 * Completion criteria (4 required fields):
 * - Name
 * - Profile photo
 * - Account email
 * - At least one DSP/music link
 */
export function calculateRequiredProfileCompletion(
  input: RequiredProfileCompletionInput
): RequiredProfileCompletionResult {
  const checks = {
    hasName: hasText(input.displayName),
    hasAvatar: hasText(input.avatarUrl),
    hasEmail: hasText(input.email),
    hasMusicLinks: input.hasMusicLinks,
  };

  const totalCount = 4;
  const completedCount = Object.values(checks).filter(Boolean).length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  return {
    ...checks,
    completedCount,
    totalCount,
    percentage,
    isComplete: completedCount === totalCount,
  };
}
