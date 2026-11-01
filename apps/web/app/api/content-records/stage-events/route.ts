/**
 * /api/content-records/stage-events
 *
 * Public NDJSON stage feed for the `marketing-change` entity
 * (`docs/metrics/stage-manifest.json`): rolling 28 days of data-edit and
 * data-live rows, so the shipping SLO collector reports edit-to-live for
 * data changes next to code changes. Rows carry only kind/key@version and
 * timestamps. Actors and version ids are stripped; no record content is
 * exposed.
 */

import { buildContentStageEvents } from '@/lib/content-records/stage-events';
import { getContentStageRows } from '@/lib/content-records/store.server';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const { versions, events } = await getContentStageRows(
      new Date(Date.now() - WINDOW_MS)
    );
    const rows = buildContentStageEvents(versions, events).map(row => ({
      ...row,
      actor: null,
      sourceReceipt: `content-record:${row.entityId}`,
    }));
    return new Response(rows.map(row => JSON.stringify(row)).join('\n'), {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    await captureError('Content stage feed failed', error, {
      route: '/api/content-records/stage-events',
    });
    return new Response('stage feed unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
