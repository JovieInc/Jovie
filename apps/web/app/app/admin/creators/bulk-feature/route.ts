import { bulkSetCreatorsFeaturedAction } from '@/app/admin/actions';
import { parseBulkFeaturePayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'bulk feature creators',
  actionFn: bulkSetCreatorsFeaturedAction,
  parsePayload: parseBulkFeaturePayload,
  errorContext: {
    route: '/api/admin/creators/bulk-feature',
    action: 'bulk_feature_creators',
  },
  errorMessage: 'Failed to update featured status',
});
