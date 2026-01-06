import { bulkSetCreatorsVerifiedAction } from '@/app/admin/actions';
import { parseBulkVerifyPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'bulk verify creators',
  actionFn: bulkSetCreatorsVerifiedAction,
  parsePayload: parseBulkVerifyPayload,
  errorContext: {
    route: '/api/admin/creators/bulk-verify',
    action: 'bulk_verify_creators',
  },
  errorMessage: 'Failed to update verification',
});
