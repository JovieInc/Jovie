import type { ComponentPropsWithoutRef } from 'react';

/** Canonical native CTA section boundary. Bodies and behavior remain caller-owned. */
export function MarketingCtaSection(
  props: ComponentPropsWithoutRef<'section'>
) {
  return <section {...props} />;
}
