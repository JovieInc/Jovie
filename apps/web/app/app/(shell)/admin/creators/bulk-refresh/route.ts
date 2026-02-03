import { APP_ROUTES } from '@/constants/routes';
import { parseBulkRefreshPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { bulkRerunCreatorIngestionAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'bulk refresh creators',
  actionFn: bulkRerunCreatorIngestionAction,
  parsePayload: parseBulkRefreshPayload,
  buildSuccessResponse: (_payload, result) => ({
    success: true,
    queuedCount: result.queuedCount,
  }),
  errorContext: {
    route: `${APP_ROUTES.ADMIN_CREATORS}/bulk-refresh`,
    action: 'bulk_refresh_creators',
  },
  errorMessage: 'Failed to queue ingestion jobs',
});
