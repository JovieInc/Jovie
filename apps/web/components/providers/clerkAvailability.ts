export function isMockPublishableKey(publishableKey: string): boolean {
  const lower = publishableKey.toLowerCase();
  return (
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('placeholder') ||
    lower.includes('test-key')
  );
}

export function shouldBypassClerk(
  publishableKey: string | undefined,
  clerkMockFlag: string | undefined
): boolean {
  return (
    !publishableKey ||
    clerkMockFlag === '1' ||
    isMockPublishableKey(publishableKey)
  );
}

export function getClerkProxyUrl(): string | undefined {
  const browserWindow = globalThis.window;
  if (!browserWindow) return undefined;

  const { hostname } = browserWindow.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }

  return '/clerk';
}
