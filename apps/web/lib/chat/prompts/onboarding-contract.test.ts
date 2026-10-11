import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_SYSTEM_PROMPT } from './onboarding';
import { checkOnboardingPromptContract } from './onboarding-contract';

const { assertOnboardingSystemPromptContractCovered } = createRequire(
  import.meta.url
)('../../../tests/eval/promptfoo/assertions.cjs');

function evaluatePrompt(
  prompt: string,
  overrides: Record<string, unknown> = {}
) {
  const promptFacts = checkOnboardingPromptContract(prompt);
  return assertOnboardingSystemPromptContractCovered({
    target: 'onboarding-system-prompt-contract',
    promptCase: 'prompt-rules',
    costTier: 'deterministic',
    productionEntrypoint:
      'apps/web/lib/chat/prompts/onboarding.ts:ONBOARDING_SYSTEM_PROMPT',
    promptLength: prompt.length,
    modelCalled: false,
    persistenceAttempted: false,
    dbAttempted: false,
    networkAttempted: false,
    missingPromptFacts: Object.entries(promptFacts)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    toolPrerequisitesValid: promptFacts.preservesToolPrerequisites,
    toolOrder: [
      'searchSpotifyArtist',
      'confirmSpotifyArtist',
      'checkHandle',
      'proposeSocialLink',
      'recordInterviewSignal',
      'proposeNextStep',
      'proposeCheckout',
    ].map(name => ({ name, index: prompt.indexOf(`\`${name}\``) })),
    promptLeakPatterns: [],
    ...overrides,
  });
}

describe('deterministic onboarding prompt contract', () => {
  it('accepts the production policy without a musician-only intake or fixed textual tool order', () => {
    expect(
      Object.values(checkOnboardingPromptContract(ONBOARDING_SYSTEM_PROMPT))
    ).not.toContain(false);
    expect(evaluatePrompt(ONBOARDING_SYSTEM_PROMPT).pass).toBe(true);
    expect(ONBOARDING_SYSTEM_PROMPT.indexOf('`proposeNextStep`')).toBeLessThan(
      ONBOARDING_SYSTEM_PROMPT.indexOf('`checkHandle`')
    );
  });

  it.each([
    [
      'identifiesUnauthenticatedVisitor',
      'not an authenticated account session',
    ],
    ['preservesFirstBubblePrivacyDisclosure', 'FIRST chat bubble'],
    ['keepsOnboardingVoiceConstraints', 'normal sentence case'],
    [
      'requiresShortConcreteReplies',
      'No numbered plans, bullet lists, headings',
    ],
    ['enforcesOneQuestionPerTurn', 'One question per turn'],
    [
      'requiresRoleAppropriateIdentityBeforeSetup',
      'For other roles, skip Spotify',
    ],
    [
      'requiresDataObservationAfterSpotifyConfirmation',
      'actual returned data BEFORE asking the next question',
    ],
    [
      'gatesAccessThroughNextStepDecision',
      'Only its server result decides instant_access, waitlist, or needs_more_info',
    ],
    [
      'blocksCheckoutUntilInstantAccess',
      'instant_access: use `proposeCheckout` only if the current result allows it',
    ],
    ['keepsPricingLate', 'Do NOT lead with pricing'],
    [
      'forbidsInventedStatsAndPrematureLiveClaims',
      'Do not claim live, claimed, owned, published, paid, or entitled status without its persisted server receipt',
    ],
    [
      'recordsSignalsSilently',
      'Record each stated objection through `recordInterviewSignal`',
    ],
    [
      'redirectsGeneralSupportIntoIntake',
      'For general support, redirect to the intake',
    ],
    [
      'requiresCurrentServerAuthority',
      'Use only current server-confirmed action availability and destinations',
    ],
    [
      'blocksConflictedAndUnauthorizedActions',
      'Never offer Claim, a new handle, or checkout after an ownership conflict',
    ],
    [
      'waitsForPersistedOutcomes',
      'Wait for the completed server result before stating an outcome',
    ],
    [
      'gatesHandleSelectionOnIdentity',
      'never for an already-owned or conflicted identity',
    ],
    [
      'preservesToolPrerequisites',
      'Use `proposeNextStep` once identity and a useful signal are known',
    ],
  ] as const)('rejects a prompt missing %s', (fact, requiredRule) => {
    expect(ONBOARDING_SYSTEM_PROMPT).toContain(requiredRule);
    const unsafePrompt = ONBOARDING_SYSTEM_PROMPT.replace(requiredRule, '');
    expect(checkOnboardingPromptContract(unsafePrompt)[fact]).toBe(false);
    const result = evaluatePrompt(unsafePrompt);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain(fact);
  });

  it('fails closed for an empty prompt', () => {
    expect(Object.values(checkOnboardingPromptContract(''))).not.toContain(
      true
    );
    expect(evaluatePrompt('').pass).toBe(false);
  });

  it('rejects invalid tool prerequisites even when the missing-fact list is empty', () => {
    const result = evaluatePrompt(ONBOARDING_SYSTEM_PROMPT, {
      missingPromptFacts: [],
      toolPrerequisitesValid: false,
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('tool prerequisites are invalid');
  });
});
