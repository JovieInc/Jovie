import type { Metadata } from 'next';

/** Shared robots metadata for routes that should never be indexed. */
export const NOINDEX_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};
