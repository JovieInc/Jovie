'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { trackHomepageEvent } from './homepage-analytics';

type HomepageTrackedLinkProps = ComponentProps<typeof Link> & {
  readonly eventName: string;
  readonly eventProperties?: Record<string, unknown>;
};

export function HomepageTrackedLink({
  children,
  eventName,
  eventProperties,
  onClick,
  ...props
}: HomepageTrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={event => {
        trackHomepageEvent(eventName, eventProperties);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
