import 'server-only';

export const AVATAR_ALLOWED_HOSTS: readonly string[] = [
  'res.cloudinary.com',
  'images.clerk.dev',
  'img.clerk.com',
  'images.unsplash.com',
  'blob.vercel-storage.com',
];

export interface AvatarUrlValidationOptions {
  allowedHosts?: readonly string[];
  enforceHttps?: boolean;
}

export function isAllowedAvatarHost(
  hostname: string,
  allowedHosts: readonly string[] = AVATAR_ALLOWED_HOSTS
): boolean {
  const normalized = hostname.toLowerCase();
  return allowedHosts.some(host => host.toLowerCase() === normalized);
}

export function validateAvatarUrl(
  url: string,
  options?: AvatarUrlValidationOptions
): string {
  const enforceHttps = options?.enforceHttps ?? true;
  const allowedHosts = options?.allowedHosts ?? AVATAR_ALLOWED_HOSTS;

  try {
    const parsed = new URL(url);

    if (enforceHttps && parsed.protocol !== 'https:') {
      throw new Error('Avatar URL must use https');
    }

    if (!isAllowedAvatarHost(parsed.hostname, allowedHosts)) {
      throw new Error('Avatar URL host is not allowed');
    }

    return parsed.toString();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid avatar URL provided';
    throw new Error(message);
  }
}
