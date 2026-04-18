import { z } from 'zod';

export const manualLeadSubmitSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(500),
});

export const leadListQuerySchema = z.object({
  status: z
    .enum([
      'discovered',
      'qualified',
      'disqualified',
      'approved',
      'ingested',
      'rejected',
    ])
    .optional(),
  search: z.string().max(200).optional(),
  sortBy: z
    .enum(['fitScore', 'priorityScore', 'createdAt', 'displayName'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadStatusUpdateSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const outreachListQuerySchema = z.object({
  queue: z.enum(['email', 'dm', 'manual_review', 'all']).default('all'),
  sort: z.enum(['priorityScore', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ManualLeadSubmitInput = z.infer<typeof manualLeadSubmitSchema>;
export type LeadListQueryInput = z.infer<typeof leadListQuerySchema>;
export type LeadStatusUpdateInput = z.infer<typeof leadStatusUpdateSchema>;
export type OutreachListQueryInput = z.infer<typeof outreachListQuerySchema>;
