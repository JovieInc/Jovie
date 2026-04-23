import 'server-only';

import { z } from 'zod';
import { registerTool, type Tool } from './registry';

/**
 * bio-refresh.v1 — wraps lib/ai/artist-bio-writer.ts.
 *
 * Today the bio writer is rule-based; v2+ will likely move to Sonnet.
 * Cost estimate is generous to cover either path.
 */

const InputSchema = z.object({
  profileId: z.string().uuid(),
  forceRefresh: z.boolean().default(false),
});

const OutputSchema = z.object({
  bio: z.string(),
  changed: z.boolean(),
});

export const bioRefreshTool: Tool<typeof InputSchema, typeof OutputSchema> =
  registerTool({
    slug: 'bio-refresh.v1',
    version: '1.0.0',
    description:
      'Refresh the artist bio from catalog signal. Returns the new bio and whether it changed.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    // Rule-based today (0 cents). Budget 3 cents to cover Sonnet path when we migrate.
    costEstimateCents: () => 3,
    retryPolicy: { maxAttempts: 2, backoffMs: 2_000 },
    safetyClass: 'writes-user-data',
    timeoutMs: 30_000,
    handler: async () => {
      // TODO(release-launch): call artist-bio-writer.ts + update profile row.
      throw new Error(
        'bio-refresh.v1 handler not yet wired (expected in follow-up PR)'
      );
    },
  });
