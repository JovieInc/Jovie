import { APP_ROUTES } from '@/constants/routes';
import { parseDeletePayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { deleteCreatorOrUserAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'delete user',
  actionFn: deleteCreatorOrUserAction,
  parsePayload: parseDeletePayload,
  errorContext: {
    route: `${APP_ROUTES.ADMIN_USERS}/delete`,
    action: 'delete_user',
  },
  errorMessage: 'Failed to delete creator/user',
});
