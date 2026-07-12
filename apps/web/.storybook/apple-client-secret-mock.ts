// Mock for @/lib/auth/apple-client-secret in Storybook.
// The real module calls node:crypto.createPrivateKey at import time, which
// vite externalizes for the browser — any story whose transitive graph
// reaches lib/auth/better-auth.ts would fail to import otherwise.

export function generateAppleClientSecret(): string {
  console.log('[Storybook Mock] generateAppleClientSecret called');
  return 'storybook-mock-apple-client-secret';
}
