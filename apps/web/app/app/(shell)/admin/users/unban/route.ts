import { APP_ROUTES } from '@/constants/routes';
import { parseUnbanPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { unbanUserAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'unban user',
  actionFn: unbanUserAction,
  parsePayload: parseUnbanPayload,
  errorContext: {
    route: APP_ROUTES.ADMIN_USERS_UNBAN,
    action: 'unban_user',
  },
  errorMessage: 'Failed to restore user',
});
