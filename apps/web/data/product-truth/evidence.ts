/**
 * Evidence classes for persuasive claims (JOV-7750, epic JOV-7244).
 *
 * The proof registry (`proof.ts`) records *what* a proof item is (logo,
 * quote, metric, product capture, third-party). Buyers ask a different
 * question: does this show that Jovie gets results? Every outcome claim on
 * the golden path must answer it with one of three admissible classes:
 *
 * - computed: derived live from the visitor's own public data at claim time.
 *   Rendered through a slot that hides itself when the data is absent.
 * - dogfood: a real receipt from Jovie using itself (Tim's profiles, Jovie's
 *   own launches), measured with a reproducing read-only query.
 * - pilot: a measured outcome from a real user, with consent.
 *
 * `none` is never admissible for an outcome claim. A gap becomes a
 * ProofRequest that names the generator able to fill it, in Tim's order:
 * computed first, dogfood second, pilots later.
 */

export const EVIDENCE_CLASSES = [
  'computed',
  'dogfood',
  'pilot',
  'none',
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export type AdmissibleEvidenceClass = Exclude<EvidenceClass, 'none'>;

/**
 * Generators that can fill a proof gap. `research` fills market facts with a
 * third-party citation; it never proves that Jovie gets results.
 */
export const PROOF_GENERATORS = [
  'computed',
  'dogfood',
  'pilot',
  'research',
] as const;

export type ProofGeneratorId = (typeof PROOF_GENERATORS)[number];

/** What each generator produces and where its receipts live. */
export const PROOF_GENERATOR_CONTRACTS: Readonly<
  Record<
    ProofGeneratorId,
    { readonly produces: string; readonly owner: string }
  >
> = {
  computed: {
    produces:
      'Claim-time findings from the visitor’s own public presence, hidden when absent',
    owner: 'apps/web/lib/proof/claim-time-proof.ts',
  },
  dogfood: {
    produces:
      'Measured receipts from Jovie’s own profiles and launches (read-only prod queries)',
    owner: 'apps/web/scripts/proof-dogfood-receipts.ts',
  },
  pilot: {
    produces:
      'Consented before/after outcomes from 5-10 measured users (docs/marketing/proof-pilot-harness.md)',
    owner: 'docs/marketing/proof-pilot-harness.md',
  },
  research: {
    produces: 'Dated third-party citations for market facts',
    owner: 'apps/web/data/product-truth/claims.ts EVIDENCED_CLAIMS',
  },
};

export function isAdmissibleEvidence(
  evidence: EvidenceClass
): evidence is AdmissibleEvidenceClass {
  return evidence !== 'none';
}

/** Routes of Jovie's own profiles; product captures of them are dogfood. */
export const DOGFOOD_PROFILE_ROUTES: readonly string[] = ['/tim'];
