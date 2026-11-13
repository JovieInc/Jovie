import type { uploadPresigned as UploadPresigned } from '@vercel/blob/client';

/**
 * `uploadPresigned` from `@vercel/blob/client`, loaded on the first upload.
 *
 * The client SDK pulls in `jose` and `@vercel/oidc` (about 94 KB), which the
 * chat composer only needs once someone attaches a file, so it stays out of
 * the chat page's first-load bundle.
 */
export const uploadPresignedLazy: typeof UploadPresigned = async (...args) => {
  const { uploadPresigned } = await import('@vercel/blob/client');
  return uploadPresigned(...args);
};
