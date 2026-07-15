export async function requireAuth() {
  return { userId: null, error: new Response(null, { status: 401 }) };
}

export async function getAuthUserId(): Promise<null> {
  return null;
}

export function isAuthSuccess(): boolean {
  return false;
}
