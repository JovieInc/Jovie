import { getRequestClerkClient } from '@/lib/auth/request-clerk-client';

export async function getMobileSessionUserId(
  request: Request
): Promise<string | null> {
  const clerk = await getRequestClerkClient(request);
  const requestState = await clerk.authenticateRequest(request, {
    acceptsToken: 'session_token',
  });

  if (!requestState.isAuthenticated) {
    return null;
  }

  const authObject = requestState.toAuth();
  return typeof authObject.userId === 'string' ? authObject.userId : null;
}
