import { cn } from '@/lib/utils';

export const ONBOARDING_STAGE_DRIFT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

export const ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_TEST_ID =
  'onboarding-stage-duplicate-recipe-fixture';

export const ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_SOURCE = `
const STAGE_VARIANT_CLASSNAME = {
  framed:
    'rounded-3xl border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-8 sm:py-8',
};

const v1StageClass =
  'rounded-3xl border border-white/[0.07] bg-(--color-bg-surface-0)/72 px-5 py-6 shadow-[0_28px_100px_rgba(0,0,0,0.34)] sm:px-8';
`;

export function OnboardingStageDuplicateRecipeFixture() {
  return (
    <div
      data-testid={ONBOARDING_STAGE_DUPLICATE_RECIPE_FIXTURE_TEST_ID}
      data-deliberate-red=''
      className={cn(
        'rounded-3xl border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-8 sm:py-8',
        'rounded-3xl border border-white/[0.07] bg-(--color-bg-surface-0)/72 px-5 py-6 shadow-[0_28px_100px_rgba(0,0,0,0.34)] sm:px-8'
      )}
      style={ONBOARDING_STAGE_DRIFT_FIXTURE_RED_STYLE}
    >
      Deliberate-red duplicate onboarding stage recipe.
    </div>
  );
}
