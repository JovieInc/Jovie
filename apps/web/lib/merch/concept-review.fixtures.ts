/**
 * Synthetic, reference-only examples of founder feedback for concept review.
 * These records contain no artwork, lyrics, customer assets, or production
 * permission. Phrase preference never authorizes a design or its commercial use.
 */
export const founderFeedbackFixtures = [
  {
    candidatePhrase: 'Never Say A Word',
    disposition: 'reject',
    reasons: [
      'standalone_phrase_not_wearable',
      'weak_design',
      'taylor_swift_like_imagery',
      'brand_color_mismatch',
    ],
    sourceLabel: 'Synthetic reference-only founder feedback',
    note: 'Reject this concept: the standalone phrase is not wearable, the design is weak, the imagery feels Taylor Swift-like, and the colors do not fit the artist brand. This fixture contains no actual design.',
    authorization: 'reference_only',
  },
  {
    candidatePhrase: 'Seaside Heights',
    disposition: 'defer_first_demo',
    reasons: ['deferred_from_first_demo'],
    sourceLabel: 'Synthetic reference-only founder feedback',
    note: 'Defer this phrase for the first demo. This is not a permanent rejection of the phrase or permission to use any associated recording, lyrics, or artwork.',
    authorization: 'reference_only',
  },
  {
    candidatePhrase: 'Save the Night',
    disposition: 'preferred_phrase_only',
    reasons: ['phrase_preference_only'],
    sourceLabel: 'Synthetic reference-only founder feedback',
    note: 'Preferred phrase to explore. This preference approves neither a design nor any rights, lyrics, likeness, artwork, or commercial use.',
    authorization: 'reference_only',
  },
] as const;

export const authorizedReferenceStudy = {
  sourceId: 'synthetic:instant-merch-reference-study',
  sourceKind: 'synthetic_reference_study',
  licensedUse: 'reference_only',
  note: 'Synthetic reference study only. No downloading, training on, or copying third-party material is authorized; no production or commercial-use rights are granted.',
} as const;
