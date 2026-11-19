/**
 * Receiver for the mesh hub's Vercel Board shadow mirror (one-week pilot;
 * workers/mesh-hub/BOARD-PILOT.md). The Cloudflare hub POSTs HMAC-signed
 * batches of task-board stage rows here; this route writes them into the
 * team's Board channel `mesh/tasks` with `@vercel/board`, authenticating with
 * this deployment's own OIDC token — no Vercel credential is ever stored on
 * the hub. All gates live in ./access (production + secret, HMAC timing-safe,
 * ±300 s window, row shape); rows are applied in stage-id order and a row that
 * fails is logged and skipped so one bad row can never wedge the pipeline.
 */
import { board } from '@vercel/board';
import { defineRoute } from '@/lib/api/route-pipeline';
import { logMirrorRowError, mirrorAccess } from './access';
import { HUB_PROFILE, MirrorWriter } from './mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { route: '/api/internal/mesh-board-mirror', access: mirrorAccess },
  async ({ auth }) => {
    const writer = new MirrorWriter(board().as(HUB_PROFILE));
    let processedThrough = 0;
    for (const row of auth.rows) {
      try {
        await writer.apply(row, process.env.BOARD_MIRROR_BODY === '1');
        processedThrough = row.stageId;
      } catch (error) {
        // Skip-and-log: a transient Board error loses one shadow update; a
        // wedged cursor would lose everything after it.
        processedThrough = row.stageId;
        logMirrorRowError(error, row);
      }
    }
    return Response.json({ ok: true, processedThrough });
  }
);
