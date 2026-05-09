import type { Metadata } from 'next';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';
import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

// Redirect sink — issues HTTP 307 to /{username}?mode=pay before any HTML
// renders. Marked noindex so crawlers follow the canonical URL instead.
export function generateMetadata(): Metadata {
  return REDIRECT_SINK_METADATA;
}

export default async function PayPage({ params }: Readonly<Props>) {
  return redirectToProfileMode(params, 'pay');
}
