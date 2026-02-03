import { APP_ROUTES } from '@/constants/routes';
import { parseBulkFeaturePayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { bulkSetCreatorsFeaturedAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'bulk feature creators',
  actionFn: bulkSetCreatorsFeaturedAction,
  parsePayload: parseBulkFeaturePayload,
  errorContext: {
    route: `${APP_ROUTES.ADMIN_CREATORS}/bulk-feature`,
    action: 'bulk_feature_creators',
  },
  errorMessage: 'Failed to update featured status',
});
