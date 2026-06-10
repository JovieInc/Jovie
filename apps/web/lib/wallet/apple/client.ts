'use client';

export const APPLE_WALLET_PROFILE_PASS_DOWNLOAD_URL =
  '/api/wallet/apple/profile-pass';

export function isAppleWalletPassSupportedClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function openAppleWalletProfilePass(): void {
  globalThis.location.assign(APPLE_WALLET_PROFILE_PASS_DOWNLOAD_URL);
}
