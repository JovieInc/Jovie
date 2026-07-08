import 'server-only';

import { captureWarning } from '@/lib/error-tracking';

export async function syncAllClerkMetadata(_userId: string): Promise<void> {}

export async function syncAdminRoleChange(
  _targetUserId: string,
  _isAdmin: boolean,
  _actorUserId?: string,
  _ipAddress?: string,
  _userAgent?: string
): Promise<void> {
  captureWarning('[auth] Skipped legacy Clerk metadata sync after BA cutover', {
    targetUserId: _targetUserId,
    actorUserId: _actorUserId,
  });
}
