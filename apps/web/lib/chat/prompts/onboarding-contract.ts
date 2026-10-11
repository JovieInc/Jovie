/** Deterministic prompt policy checks shared by Promptfoo and regression tests. */
export function checkOnboardingPromptContract(prompt: string) {
  const normalized = prompt.toLowerCase();
  const includesAll = (...needles: string[]) =>
    needles.every(needle => normalized.includes(needle.toLowerCase()));

  return {
    identifiesUnauthenticatedVisitor: includesAll(
      'Do not assume their role or account permissions',
      'access intake',
      'not an authenticated account session'
    ),
    preservesFirstBubblePrivacyDisclosure: includesAll(
      'FIRST chat bubble',
      'conversation is remembered if they sign up',
      'Do not delay disclosure until after tools, signup, or a later turn'
    ),
    keepsOnboardingVoiceConstraints: includesAll(
      'Warm, direct, casual, normal sentence case',
      'No emoji, em dashes, ALL CAPS, corporate language, hype',
      'Never tell a visitor what they should have done'
    ),
    requiresShortConcreteReplies: includesAll(
      'One supportable observation',
      "why it matters to the visitor's chosen job",
      'one contextual question OR one currently available action',
      'Use 1–2 short sentences',
      'No numbered plans, bullet lists, headings'
    ),
    enforcesOneQuestionPerTurn: includesAll('One question per turn'),
    requiresRoleAppropriateIdentityBeforeSetup: includesAll(
      'For an explicitly music-related job',
      'use `searchSpotifyArtist` when identity is missing',
      'never call that tool with a guessed id',
      'For other roles, skip Spotify',
      'Ask one missing identity/job question'
    ),
    requiresDataObservationAfterSpotifyConfirmation: includesAll(
      'After `confirmSpotifyArtist` completes successfully',
      'actual returned data BEFORE asking the next question',
      'unavailable data stays unknown and zero stays zero',
      'Keep source provenance in the inspectable reference chip'
    ),
    gatesAccessThroughNextStepDecision: includesAll(
      'Use `proposeNextStep` once identity and a useful signal are known',
      'Only its server result decides instant_access, waitlist, or needs_more_info',
      'never promise instant access or extend access policy to a new role'
    ),
    blocksCheckoutUntilInstantAccess: includesAll(
      'instant_access: use `proposeCheckout` only if the current result allows it',
      'there is no ownership conflict',
      'Do not imply that proposing checkout has completed payment'
    ),
    keepsPricingLate: includesAll(
      'Do NOT lead with pricing',
      'Quote only these facts',
      'Never promise an unavailable offer',
      'the free profile stays free'
    ),
    forbidsInventedStatsAndPrematureLiveClaims: includesAll(
      'do not fabricate an observation',
      'No fabricated company, book, audience, expertise, biography, or availability',
      'Never promise more reach, conversion, revenue, or an entire DSP audience',
      'Do not claim live, claimed, owned, published, paid, or entitled status without its persisted server receipt'
    ),
    recordsSignalsSilently: includesAll(
      'Record known interview evidence silently with `recordInterviewSignal`',
      'Do not invent a signal or ask the same answered question again',
      'Record each stated objection through `recordInterviewSignal`'
    ),
    redirectsGeneralSupportIntoIntake: includesAll(
      'For general support, redirect to the intake',
      'one question about their identity or desired job',
      'do not promise authenticated account support'
    ),
    requiresCurrentServerAuthority: includesAll(
      'Use only current server-confirmed action availability and destinations',
      'The model cannot authorize an action or revive one from conversation history'
    ),
    blocksConflictedAndUnauthorizedActions: includesAll(
      'Never offer Claim, a new handle, or checkout after an ownership conflict',
      'original-account sign-in or verified recovery path',
      'Never offer Publish without verified ownership and publish permission',
      'Edit without verified ownership and edit permission',
      'Upgrade when the server offer is unavailable or unknown'
    ),
    waitsForPersistedOutcomes: includesAll(
      'Wait for the completed server result before stating an outcome',
      'without its persisted server receipt',
      'not a duplicate text button plus multiple competing cards',
      'without a CTA'
    ),
    gatesHandleSelectionOnIdentity: includesAll(
      'Use `checkHandle` only when the current identity state permits a new handle',
      'never for an already-owned or conflicted identity'
    ),
    preservesToolPrerequisites: includesAll(
      'use `searchSpotifyArtist` when identity is missing',
      'After `confirmSpotifyArtist` completes successfully',
      'Use `proposeNextStep` once identity and a useful signal are known',
      'instant_access: use `proposeCheckout` only if the current result allows it'
    ),
  };
}
