import { z } from 'zod';

/**
 * Help Center analytics contract (JOV-5905).
 *
 * Strict allowlist: queries arrive only as truncated SHA-256 hashes emitted by
 * the docs client, never as raw text. There is no field that can carry DOM
 * text, auth payloads, payment details, free-form paths, or identity.
 */
export const HELP_CENTER_SCHEMA_VERSION = 1 as const;
export const HELP_CENTER_ENDPOINT = '/api/analytics/help-center' as const;
export const HELP_CENTER_MAX_BATCH_SIZE = 8;

/** Origins allowed to beacon events cross-origin. */
export const HELP_CENTER_ALLOWED_ORIGINS = [
  'https://docs.jov.ie',
  'https://jov.ie',
  'https://www.jov.ie',
] as const;

export const HELP_CENTER_EVENTS = [
  'help_center_viewed',
  'category_opened',
  'article_viewed',
  'search_opened',
  'search_query_submitted',
  'search_result_selected',
  'search_zero_results',
  'article_feedback',
  'related_guide_selected',
  'contact_support_opened',
  'support_request_submitted',
  'support_request_failed',
  'support_escalation',
] as const;
export type HelpCenterEvent = (typeof HELP_CENTER_EVENTS)[number];

export const HELP_CENTER_SOURCE_SURFACES = [
  'help_center_home',
  'article',
  'search_dialog',
  'search_zero_results',
  'search_error',
  'related_guides',
  'support_page',
  'unknown',
] as const;
export type HelpCenterSourceSurface =
  (typeof HELP_CENTER_SOURCE_SURFACES)[number];

export const HELP_CENTER_FEEDBACK = ['helpful', 'not_helpful'] as const;
export const HELP_CENTER_FEEDBACK_REASONS = [
  'outdated',
  'missing_info',
  'did_not_answer',
  'confusing',
] as const;

const articleIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9/_-]*$/);

/** Truncated SHA-256 (16 hex) or the documented FNV-1a fallback. */
const queryHashSchema = z
  .string()
  .min(8)
  .max(24)
  .regex(/^(?:[0-9a-f]{16}|fnv1a-[0-9a-f]{8})$/);

const opaqueIdSchema = z
  .string()
  .min(16)
  .max(96)
  .regex(/^[a-zA-Z0-9:_-]+$/);

export const helpCenterEventSchema = z
  .object({
    schema_version: z.literal(HELP_CENTER_SCHEMA_VERSION),
    event_id: opaqueIdSchema,
    event: z.enum(HELP_CENTER_EVENTS),
    client_ts: z.number().int().positive().optional(),
    article_id: articleIdSchema.optional(),
    category_id: articleIdSchema.optional(),
    query_hash: queryHashSchema.optional(),
    query_length_bucket: z
      .enum(['na', 'le_8', 'le_24', 'le_64', 'gt_64'])
      .optional(),
    result_id: articleIdSchema.optional(),
    result_rank: z.number().int().min(0).max(50).optional(),
    source_article_id: articleIdSchema.optional(),
    feedback: z.enum(HELP_CENTER_FEEDBACK).optional(),
    feedback_reason: z.enum(HELP_CENTER_FEEDBACK_REASONS).optional(),
    source_surface: z.enum(HELP_CENTER_SOURCE_SURFACES).optional(),
    referrer_class: z
      .enum(['internal', 'external', 'direct', 'unknown'])
      .optional(),
    signed_in: z.enum(['signed_in', 'signed_out', 'unknown']).optional(),
    viewport_class: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
    build_id: z.string().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    const require = (
      path: 'article_id' | 'query_hash' | 'result_id' | 'feedback',
      message: string
    ) => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message,
      });
    };

    if (!payload.event_id.endsWith(`:${payload.event}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['event_id'],
        message: 'Event id suffix must match the event type',
      });
    }

    switch (payload.event) {
      case 'article_viewed':
      case 'article_feedback':
      case 'related_guide_selected':
        if (!payload.article_id) require('article_id', 'Required');
        break;
      case 'search_query_submitted':
      case 'search_zero_results':
        if (!payload.query_hash) require('query_hash', 'Required');
        break;
      case 'search_result_selected':
        if (!payload.result_id) require('result_id', 'Required');
        break;
      default:
        break;
    }
    if (payload.event === 'article_feedback' && !payload.feedback) {
      require('feedback', 'Required');
    }
  });

export const helpCenterBatchSchema = z
  .object({
    events: z.array(helpCenterEventSchema).max(HELP_CENTER_MAX_BATCH_SIZE),
  })
  .strict();

export type HelpCenterEventPayload = z.infer<typeof helpCenterEventSchema>;
