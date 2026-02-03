import { APP_ROUTES } from '@/constants/routes';
import { parseBulkVerifyPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { bulkSetCreatorsVerifiedAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'bulk verify creators',
  actionFn: bulkSetCreatorsVerifiedAction,
  parsePayload: parseBulkVerifyPayload,
  errorContext: {
    route: `${APP_ROUTES.ADMIN_CREATORS}/bulk-verify`,
    action: 'bulk_verify_creators',
  },
  errorMessage: 'Failed to update verification',
});
