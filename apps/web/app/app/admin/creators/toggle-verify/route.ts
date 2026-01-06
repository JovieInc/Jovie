import { toggleCreatorVerifiedAction } from '@/app/admin/actions';
import { parseToggleVerifyPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'toggle creator verification',
  actionFn: toggleCreatorVerifiedAction,
  parsePayload: parseToggleVerifyPayload,
  buildSuccessResponse: payload => ({
    success: true,
    isVerified: payload.nextVerified,
  }),
  errorContext: {
    route: '/api/admin/creators/toggle-verify',
    action: 'toggle_verify_creator',
  },
  errorMessage: 'Failed to update verification',
});
