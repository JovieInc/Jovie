import { APP_ROUTES } from '@/constants/routes';
import { parseDeletePayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';
import { deleteCreatorOrUserAction } from '../../actions';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'delete creator',
  actionFn: deleteCreatorOrUserAction,
  parsePayload: parseDeletePayload,
  errorContext: {
    route: `${APP_ROUTES.ADMIN_CREATORS}/delete`,
    action: 'delete_creator',
  },
  errorMessage: 'Failed to delete creator/user',
});
