/** Browser-safe test-auth boundary for Storybook's provider decorator. */
export async function getClientAuthBootstrap(): Promise<null> {
  return null;
}

export async function getCachedDevTestAuthSession(): Promise<null> {
  return null;
}

export function buildDevTestAuthCurrentUser(): never {
  throw new Error('Storybook has no dev test auth session');
}
