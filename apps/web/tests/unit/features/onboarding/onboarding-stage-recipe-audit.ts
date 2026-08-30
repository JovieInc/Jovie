import { ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS } from '@/components/features/onboarding/onboarding-experience-shell-stage-contract';

export const ONBOARDING_STAGE_DRIFT_CLASSES = [
  'duplicate-raw-stage-recipe',
] as const;

export type OnboardingStageDriftClass =
  (typeof ONBOARDING_STAGE_DRIFT_CLASSES)[number];

export interface OnboardingStageDriftFinding {
  readonly code: OnboardingStageDriftClass;
}

const RAW_STAGE_GEOMETRY_TOKENS = [
  'rounded-3xl',
  'px-5',
  'py-6',
  'sm:px-8',
] as const;

function quotedClassStrings(source: string): readonly string[] {
  return [
    ...source.matchAll(/'([^']+)'/g),
    ...source.matchAll(/"([^"]+)"/g),
    ...source.matchAll(/`([^`${]+)`/g),
  ].map(match => match[1]);
}

export function isRawStageGeometryRecipe(className: string): boolean {
  return RAW_STAGE_GEOMETRY_TOKENS.every(token =>
    className.split(/\s+/).includes(token)
  );
}

export function auditOnboardingStageRecipes(
  source: string,
  options: { readonly owner?: boolean } = {}
): readonly OnboardingStageDriftFinding[] {
  const rawRecipes = quotedClassStrings(source).filter(
    isRawStageGeometryRecipe
  );
  const allowed = options.owner ? 1 : 0;

  if (rawRecipes.length > allowed) {
    return [{ code: 'duplicate-raw-stage-recipe' }];
  }

  if (
    options.owner &&
    (rawRecipes.length !== 1 ||
      rawRecipes[0] !== ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS)
  ) {
    return [{ code: 'duplicate-raw-stage-recipe' }];
  }

  return [];
}

export function codesOf(
  findings: readonly OnboardingStageDriftFinding[]
): readonly OnboardingStageDriftClass[] {
  return findings.map(finding => finding.code);
}
