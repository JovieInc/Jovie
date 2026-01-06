import { deleteCreatorOrUserAction } from '@/app/admin/actions';
import { parseDeletePayload } from '@/lib/admin/payload-parsers';
import { createAdminRouteHandler } from '@/lib/admin/route-factory';

export const runtime = 'nodejs';

export const POST = createAdminRouteHandler({
  actionName: 'delete creator',
  actionFn: deleteCreatorOrUserAction,
  parsePayload: parseDeletePayload,
  errorContext: {
    route: '/api/admin/creators/delete',
    action: 'delete_creator',
  },
  errorMessage: 'Failed to delete creator/user',
});
