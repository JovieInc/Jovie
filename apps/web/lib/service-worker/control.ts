export const SW_ENABLED_KEY = '__dev_sw_enabled';

/**
 * Whether the service worker should be active.
 * Always true in production; in non-production environments (dev, preview),
 * requires explicit opt-in via localStorage.
 */
export function isSwEnabled(): boolean {
  // On Vercel, NODE_ENV is 'production' even for preview deploys.
  // Use NEXT_PUBLIC_VERCEL_ENV to distinguish real production from preview.
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const isRealProduction =
    vercelEnv === 'production' ||
    (process.env.NODE_ENV === 'production' && !vercelEnv);
  if (isRealProduction) return true;
  try {
    return localStorage.getItem(SW_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function registerServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export async function unregisterServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
  }
}
