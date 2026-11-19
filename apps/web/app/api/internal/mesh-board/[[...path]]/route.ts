/**
 * Audit watcher for the Vercel Board shadow mirror (one-week pilot;
 * workers/mesh-board/BOARD-PILOT.md → workers/mesh-hub/BOARD-PILOT.md).
 * Registers watcher `mesh_tasks_audit` with `tail: 'mesh/tasks'` on first use
 * and writes NOTHING to the board: `run` only logs one structured line per
 * event, whose `wakeAt − eventAt` is Board's wake latency and whose
 * `eventAt − hubAt` is the hub→Board end-to-end lag. The compare script
 * (scripts/mesh/board-pilot-compare.mjs) and Vercel logs read these lines.
 *
 * `[[...path]]` keeps the route mounted at /api/internal/mesh-board (and any
 * subpath) so the SDK's watcher transport can wake it; the proxy matcher
 * excludes exactly these paths.
 */
import { board } from '@vercel/board';
import {
  auditLine,
  MESH_CHANNEL,
} from '@/app/api/internal/mesh-board-mirror/mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WATCHER_ID = 'mesh_tasks_audit';

const team = board({
  watch: {
    [WATCHER_ID]: {
      tail: MESH_CHANNEL,
      // Audit only: never write here (not even a reaction) — the pilot's
      // board stays a pure mirror of the hub's stages.
      run: ({ event }) => {
        console.log(auditLine(event));
      },
    },
  },
});

const notFound = () =>
  new Response(JSON.stringify({ ok: false, code: 'not_found' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

// Production only: a preview deployment must never register the watcher.
const handler = (request: Request) =>
  process.env.VERCEL_ENV === 'production' ? team.fetch(request) : notFound();

export const GET = handler;
export const POST = handler;
