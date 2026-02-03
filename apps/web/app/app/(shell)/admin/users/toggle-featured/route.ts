import { APP_ROUTES } from '@/constants/routes';
import { parseToggleFeaturedPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { toggleCreatorFeaturedAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'toggle user featured status',
  actionFn: toggleCreatorFeaturedAction,
  parsePayload: parseToggleFeaturedPayload,
  buildSuccessResponse: payload => ({
    success: true,
    isFeatured: payload.nextFeatured,
  }),
  errorContext: {
    route: `${APP_ROUTES.ADMIN_USERS}/toggle-featured`,
    action: 'toggle_featured_user',
  },
  errorMessage: 'Failed to update featured status',
});
