import type * as Sentry from '@sentry/nextjs';
import { publicEnv } from '@/lib/env-public';
import {
  parseWorktreeIdentity,
  worktreeAttributes,
} from './worktree-identity.mjs';

export function getWorktreeIdentity() {
  // Never expose local correlation or high-cardinality tags on deployed builds.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'production'
  )
    return null;
  return parseWorktreeIdentity(publicEnv.NEXT_PUBLIC_JOVIE_WORKTREE_IDENTITY);
}

export function getWorktreeAttributes() {
  return worktreeAttributes(getWorktreeIdentity());
}

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
export type WorktreeSentryOptions = Pick<
  SentryOptions,
  'initialScope' | 'beforeSendMetric' | 'beforeSendSpan'
>;

/** Compose SDK-supported callbacks; this does not enable a disabled exporter. */
export function getWorktreeSentryOptions(): WorktreeSentryOptions {
  const identity = getWorktreeIdentity();
  if (!identity) return {};
  const attributes = worktreeAttributes(identity);
  return {
    initialScope: { tags: attributes },
    beforeSendMetric: metric => ({
      ...metric,
      attributes: { ...metric.attributes, ...attributes },
    }),
    beforeSendSpan: span => ({
      ...span,
      data: { ...span.data, ...attributes },
    }),
  };
}
