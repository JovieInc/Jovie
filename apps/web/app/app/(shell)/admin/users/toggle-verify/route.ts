import { APP_ROUTES } from '@/constants/routes';
import { parseToggleVerifyPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { toggleCreatorVerifiedAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'toggle user verification',
  actionFn: toggleCreatorVerifiedAction,
  parsePayload: parseToggleVerifyPayload,
  buildSuccessResponse: payload => ({
    success: true,
    isVerified: payload.nextVerified,
  }),
  errorContext: {
    route: `${APP_ROUTES.ADMIN_USERS}/toggle-verify`,
    action: 'toggle_verify_user',
  },
  errorMessage: 'Failed to update verification',
});
