import { APP_ROUTES } from '@/constants/routes';
import { parseToggleMarketingPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { toggleCreatorMarketingAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'toggle user marketing preferences',
  actionFn: toggleCreatorMarketingAction,
  parsePayload: parseToggleMarketingPayload,
  buildSuccessResponse: payload => ({
    success: true,
    marketingOptOut: payload.nextMarketingOptOut,
  }),
  errorContext: {
    route: `${APP_ROUTES.ADMIN_USERS}/toggle-marketing`,
    action: 'toggle_marketing_user',
  },
  errorMessage: 'Failed to update marketing preferences',
});
