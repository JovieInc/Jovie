import { z } from 'zod';

/**
 * Public abuse/security report intake (JOV-6599). Shared by the /report
 * form, POST /api/report, and the admin takedown route.
 */
export const reportTargetTypes = [
  'profile',
  'smart_link',
  'wrapped_link',
  'page',
] as const;
export const reportCategories = [
  'phishing',
  'impersonation',
  'abuse',
  'security',
  'other',
] as const;
export type ReportTargetType = (typeof reportTargetTypes)[number];
export type ReportCategory = (typeof reportCategories)[number];

export const reportPostSchema = z.object({
  targetType: z.enum(reportTargetTypes),
  target: z.string().trim().min(1, 'A target is required').max(500),
  category: z.enum(reportCategories),
  details: z.string().trim().max(2000).optional(),
  reporterEmail: z.string().email('Must be a valid email').max(320).optional(),
});
