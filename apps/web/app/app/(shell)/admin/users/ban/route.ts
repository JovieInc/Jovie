import { APP_ROUTES } from '@/constants/routes';
import { parseBanPayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { banUserAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'ban user',
  actionFn: banUserAction,
  parsePayload: parseBanPayload,
  errorContext: {
    route: APP_ROUTES.ADMIN_USERS_BAN,
    action: 'ban_user',
  },
  errorMessage: 'Failed to ban user',
});
