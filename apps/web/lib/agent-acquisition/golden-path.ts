import { z } from 'zod';
import type { OnboardingCatalogPreview } from '@/lib/onboarding/catalog-preview';
import { PROMO_SPEND_BANDS } from '@/lib/waitlist/role-qualification';

/**
 * Golden-path agent tools (founder order 2026-11-09): expose the /start flow —
 * claim, Mom Test, qualification, setup, publish, share, upgrade — as MCP
 * tools with the SAME server logic as the web flow. No parallel business
 * logic: every decision reuses the onboarding/waitlist canon.
 *
 * Pure module: schemas, locked copy, question text, and the verdict mapping.
 * I/O lives in golden-path.server.ts.
 */

/**
 * The locked not-qualified copy (founder order 2026-11-09). Never reword it:
 * the chat gate, the join route, and these tools all show this exact line.
 */
export const GOLDEN_PATH_WAITLIST_COPY =
  'Your handle is reserved. You’re on the waitlist.';

/** Tool names, shared by the descriptors and the dispatch table. */
export const GOLDEN_PATH_TOOL_NAMES = [
  'claim_handle',
  'answer_onboarding_question',
  'get_qualification',
  'build_profile',
  'publish_profile',
  'share_profile',
  'start_upgrade',
] as const;

export type GoldenPathToolName = (typeof GOLDEN_PATH_TOOL_NAMES)[number];

/**
 * The onboarding Mom Test questions, verbatim from the qualifying steps
 * (WaitlistQualifyingSteps). The Spotify-artist question is answered by
 * claim/qualification itself (the server resolves the identity), so only
 * growth and spend are asked here — the same two answers the join route
 * stores (momTestAnswersSchema).
 */
export const GOLDEN_PATH_QUESTIONS = [
  {
    id: 'lastGrowthAttempt' as const,
    question:
      "What's the last thing you did to grow your fans, and how did it go?",
    answerKind: 'text' as const,
  },
  {
    id: 'promoSpend' as const,
    question: 'What do you pay each month to promote your music?',
    answerKind: 'band' as const,
  },
] as const;

export type GoldenPathQuestionId = (typeof GOLDEN_PATH_QUESTIONS)[number]['id'];

const bandSchema = z.enum(PROMO_SPEND_BANDS);
const answerTextSchema = z.string().trim().min(1).max(600);

export const draftRefSchema = z
  .object({
    draft_id: z.uuid(),
    draft_token: z.string().min(1).max(8192),
  })
  .strict();

export type DraftRef = z.infer<typeof draftRefSchema>;

/** The golden-path state accumulated on a draft across the flow. */
export interface GoldenPathDraftState {
  readonly handle?: string;
  readonly answers?: {
    readonly lastGrowthAttempt?: string;
    readonly promoSpend?: (typeof PROMO_SPEND_BANDS)[number];
  };
  readonly catalog?: OnboardingCatalogPreview | null;
}

export const claimHandleSchema = draftRefSchema.extend({
  handle: z.string().trim().min(1).max(100),
});

/** One Mom Test answer, keyed by question id. */
export const answerQuestionSchema = z.discriminatedUnion('question', [
  draftRefSchema.extend({
    question: z.literal('lastGrowthAttempt'),
    answer: answerTextSchema,
  }),
  draftRefSchema.extend({
    question: z.literal('promoSpend'),
    answer: bandSchema,
  }),
]);

export type GoldenPathAnswerInput = z.infer<typeof answerQuestionSchema>;

export const shareProfileSchema = z
  .object({ username: z.string().trim().min(1).max(100) })
  .strict();

export const publishProfileSchema = draftRefSchema.extend({
  confirmed: z.boolean().optional(),
});

export type GoldenPathQualificationStatus = 'qualified' | 'queued';

export interface GoldenPathQualificationView {
  readonly status: GoldenPathQualificationStatus;
  /** The admission reason behind the verdict (GoldenPathAdmissionReason). */
  readonly reason: string;
  /** Locked user-facing line; set for queued (waitlist) verdicts. */
  readonly message: string | null;
  /** True when the artist must finish the existing claim-verification path. */
  readonly requiresVerification: boolean;
}

/**
 * Map the shared admission decision to the golden-path verdict. SEAM: the
 * parallel qualification PR (`decideQualification` + capability_wants)
 * replaces the body of the server's `decideGoldenPathQualificationForDraft`;
 * until it lands this composes the shared admission decision and adds no
 * opinion of its own. Disqualification is intentionally unreachable until
 * that PR lands: the shared decision only admits or holds.
 */
export function presentGoldenPathQualification(input: {
  readonly admit: boolean;
  readonly reason: string;
}): GoldenPathQualificationView {
  if (input.admit) {
    return {
      status: 'qualified',
      reason: input.reason,
      message: null,
      requiresVerification: false,
    };
  }
  return {
    status: 'queued',
    reason: input.reason,
    message: GOLDEN_PATH_WAITLIST_COPY,
    requiresVerification: false,
  };
}

/**
 * Factual share line for a public profile: the display name and the URL, and
 * nothing else — no invented claims, hashtags or CTAs.
 */
export function shareTextFor(displayName: string, url: string): string {
  const name = displayName.trim() || 'This artist';
  return `${name} on Jovie: ${url}`;
}

/**
 * The handle requested through claim_handle, read from a stored draft
 * preview. Lives here so the person-side claim (draft-claim.server) can
 * honor it without importing the server tool module.
 */
export function goldenPathHandleFromPreview(preview: unknown): string | null {
  const goldenPath = (preview as { golden_path?: { readonly handle?: string } })
    .golden_path;
  return goldenPath?.handle ?? null;
}
