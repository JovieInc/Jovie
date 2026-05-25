import { clerkClient } from '@clerk/nextjs/server';

export async function getMobileSessionUserId(
  request: Request
): Promise<string | null> {
  const clerk = await clerkClient();
  const requestState = await clerk.authenticateRequest(request, {
    acceptsToken: 'session_token',
  });

  if (!requestState.isAuthenticated) {
    return null;
  }

  const authObject = requestState.toAuth();
  return typeof authObject.userId === 'string' ? authObject.userId : null;
}
