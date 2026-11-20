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

/**
 * Robots metadata for withheld hub pages whose leaf pages stay published:
 * keep the hub out of the index but let crawlers follow its links to leaves.
 */
export const NOINDEX_FOLLOW_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
  },
};
