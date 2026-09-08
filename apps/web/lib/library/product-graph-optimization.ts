/** Library product-graph optimization contract (JOV-INV-012). */
export const LIBRARY_PRODUCT_GRAPH_OPTIMIZATION_CONTRACT = {
  variantIdentity: 'library.product-graph.catalog.v1',
  exposure:
    'Authenticated Library catalog projection for a selected creator profile. Exposure is one catalog load per signed-in artist session, attributed through audience-event source links when a catalog item is opened or shared.',
  outcome:
    'Primary artist-business outcome is release-to-revenue GMV on catalog items that already have attested promo or merch paths. Intermediate engagement (opens, YouTube CTR) is a guardrail input, not the promotion metric.',
  attribution:
    'Writebacks land on analytics catalog events, audience-event source links, optimization_experiments.decision_evidence, YouTube thumbnail experiment promotions, model-experiment promotions for packaging copy, and release-to-revenue GMV rows keyed by release id.',
  contextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'genre-or-cohort',
    'artist-plus-career-era-or-lifecycle',
    'content-variant',
    'consented-audience-segment',
  ],
  hypothesis:
    'Loading releases, documents, connected YouTube videos, artist rules, relationships, and post-release evidence together lets the one-card catalog choose a packaging variant (thumbnail, merch attach, promo download) that increases attributed GMV without increasing complaints.',
  primaryMetric:
    'release-to-revenue GMV per exposed catalog item over a 28-day window, sourced from the canonical analytics metrics layer plus release-to-revenue attribution.',
  guardrails: [
    'complaint rate',
    'trust / rights-control attestation',
    'brand identity permanence',
    'YouTube thumbnail experiment locked-metrics requirement',
  ],
  privacy:
    'Exact-profile reads stay server-side. Audience-event and YouTube experiment arms only use consented profile and channel data already stored for the owning creator. Fan-level identifiers are not loaded into the catalog projection.',
  optimizerOwner: 'Library product graph (JOV-5362 / JOV-5726)',
  cadence:
    'Evaluate running optimization_experiments and YouTube thumbnail windows daily; auto-promote only bounded reversible packaging variants after locked metrics. Identity, legal, and spend changes stay gated.',
  decisionWriteback:
    'Winners write optimization_experiments.winner_variant_key + decision_evidence, YouTube thumbnail promotions (append-only versions), and model-experiment promotions when packaging copy is in bake-off.',
  rollback:
    'Clear winnerVariantKey and set status to paused, restore the previous YouTube thumbnail kind=current from append-only history, or roll back the model-experiment promotedModel to control.',
} as const;
