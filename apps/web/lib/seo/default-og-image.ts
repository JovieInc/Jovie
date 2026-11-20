import { BASE_URL } from '@/constants/app';

/**
 * The site-wide Open Graph card. A page that sets its own `openGraph` or
 * `twitter` metadata replaces the root layout defaults wholesale, so every
 * such page must restate an image; spread these to do it.
 */
export const DEFAULT_OG_IMAGE_URL = `${BASE_URL}/og/default.png`;

export function defaultOpenGraphImages(alt: string) {
  return [{ url: DEFAULT_OG_IMAGE_URL, width: 1200, height: 630, alt }];
}

export function defaultTwitterImages() {
  return [DEFAULT_OG_IMAGE_URL];
}
