import { parseToggleFeaturedPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { toggleCreatorFeaturedAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'toggle creator featured status',
  actionFn: toggleCreatorFeaturedAction,
  parsePayload: parseToggleFeaturedPayload,
  buildSuccessResponse: payload => ({
    success: true,
    isFeatured: payload.nextFeatured,
  }),
  errorContext: {
    route: '/app/admin/creators/toggle-featured',
    action: 'toggle_featured_creator',
  },
  errorMessage: 'Failed to update featured status',
});
