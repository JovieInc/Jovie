export const ONBOARDING_TOOL_FIELD_RAW_FOCUS_FIXTURE_TEST_ID =
  'onboarding-tool-field-raw-focus-fixture';

export const RETIRED_ONBOARDING_TOOL_FIELD_RAW_FOCUS =
  'focus-within:border-white/[0.16] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.035)]';

/**
 * Deliberate-red restoration of the retired local focus shadow.
 * Production onboarding tool fields must not match this recipe.
 */
export function OnboardingToolFieldRawFocusFixture() {
  return (
    <label
      htmlFor='onboarding-tool-field-raw-focus'
      data-testid={ONBOARDING_TOOL_FIELD_RAW_FOCUS_FIXTURE_TEST_ID}
      data-deliberate-red=''
      className={`mt-2 flex h-9 items-center rounded-lg border border-subtle bg-surface-0 px-2.5 ${RETIRED_ONBOARDING_TOOL_FIELD_RAW_FOCUS}`}
    >
      <span className='sr-only'>Retired Raw Focus</span>
      <input
        id='onboarding-tool-field-raw-focus'
        aria-label='Retired Raw Focus'
        className='min-w-0 flex-1 bg-transparent text-app leading-5 text-primary-token focus:outline-none'
      />
    </label>
  );
}
