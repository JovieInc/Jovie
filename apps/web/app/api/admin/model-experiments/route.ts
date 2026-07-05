import { NextResponse } from 'next/server';
import { z } from 'zod';

import { validateCandidates } from '@/lib/ai/experiments/select';
import {
  getExperimentDashboard,
  pauseExperiment,
  rollbackExperiment,
  upsertExperiment,
} from '@/lib/ai/experiments/service.server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { logger } from '@/lib/utils/logger';

/**
 * Admin surface for per-workflow model A/B bake-offs (GH #11462).
 *
 * GET  → dashboard: every experiment with per-arm vote/cost aggregates
 *        plus the recent promotions audit log.
 * POST → { action: 'create' | 'pause' | 'rollback', ... }.
 *        'create' with a ~20/80 split is also how a NEW model gets its
 *        auto-experiment traffic slice.
 */

type AdminCheck =
  | { readonly denied: NextResponse; readonly actor?: undefined }
  | { readonly denied: null; readonly actor: string };

async function requireAdmin(): Promise<AdminCheck> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return {
      denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!entitlements.isAdmin) {
    return {
      denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { denied: null, actor: entitlements.userId ?? 'admin' };
}

export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  try {
    const dashboard = await getExperimentDashboard();
    return NextResponse.json(dashboard);
  } catch (error) {
    logger.error('[api/admin/model-experiments] GET failed', error);
    return NextResponse.json(
      { error: 'Unable to load model experiments' },
      { status: 500 }
    );
  }
}

const candidateSchema = z.object({
  model: z.string().min(1).max(200),
  weight: z.number().nonnegative().finite(),
});

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    workflow: z.string().min(1).max(100),
    candidates: z.array(candidateSchema).min(2).max(10),
    feedbackToolName: z.string().min(1).max(200).nullish(),
    minVotesPerArm: z.number().int().min(1).max(100_000).optional(),
    costTolerance: z.number().min(0).max(10).optional(),
  }),
  z.object({
    action: z.literal('pause'),
    workflow: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal('rollback'),
    workflow: z.string().min(1).max(100),
  }),
]);

export async function POST(request: Request) {
  const { denied, actor } = await requireAdmin();
  if (denied) return denied;

  let parsed: z.infer<typeof postSchema>;
  try {
    parsed = postSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    switch (parsed.action) {
      case 'create': {
        const invalid = validateCandidates(parsed.candidates);
        if (invalid) {
          return NextResponse.json({ error: invalid }, { status: 400 });
        }
        await upsertExperiment({
          workflow: parsed.workflow,
          candidates: parsed.candidates,
          feedbackToolName: parsed.feedbackToolName ?? null,
          minVotesPerArm: parsed.minVotesPerArm,
          costTolerance: parsed.costTolerance,
          updatedBy: actor,
        });
        return NextResponse.json({ ok: true });
      }
      case 'pause': {
        const paused = await pauseExperiment(parsed.workflow, actor);
        if (!paused) {
          return NextResponse.json(
            { error: 'Experiment not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true });
      }
      case 'rollback': {
        const rolledBack = await rollbackExperiment(parsed.workflow, actor);
        if (!rolledBack) {
          return NextResponse.json(
            { error: 'Experiment not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    logger.error('[api/admin/model-experiments] POST failed', error);
    return NextResponse.json(
      { error: 'Model experiment action failed' },
      { status: 500 }
    );
  }
}
