import 'server-only';

import { z } from 'zod';
import { registerTool, type Tool } from './registry';

/**
 * album-art.v1 — wraps the existing xAI grok-imagine path.
 *
 * NOTE: this v1 tool only exposes the generate+apply contract to the
 * runtime. The actual call to `generateAlbumArtBackgrounds` +
 * blob-upload + discog release metadata write lives in the release-launch
 * agent's step; this file defines the registered contract so the runtime
 * can schedule, meter, and audit calls uniformly.
 */

const InputSchema = z.object({
  releaseId: z.string().uuid(),
  stylePreset: z.string().min(1).max(64).default('default'),
  customPrompt: z.string().max(500).optional(),
});

const OutputSchema = z.object({
  candidateIds: z.array(z.string()).max(3),
  appliedSizeKeys: z.array(z.string()),
  generationId: z.string(),
});

export const albumArtTool: Tool<typeof InputSchema, typeof OutputSchema> =
  registerTool({
    slug: 'album-art.v1',
    version: '1.0.0',
    description:
      'Generate a square album-art background for a release. Produces 3 candidates, applies the top pick, returns image metadata.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    // xAI grok-imagine standard ~$0.02/image × 3 candidates = ~$0.06.
    // Round up to $0.08 to include overhead + Sharp resize compute.
    costEstimateCents: () => 8,
    retryPolicy: { maxAttempts: 2, backoffMs: 4_000 },
    safetyClass: 'spends-money',
    timeoutMs: 90_000,
    handler: async () => {
      // TODO(release-launch): wire up actual xAI call + blob upload + metadata write.
      // Stubbed so the registry compiles and the runtime + Trigger wiring can be exercised end-to-end.
      throw new Error(
        'album-art.v1 handler not yet wired (expected in follow-up PR)'
      );
    },
  });
