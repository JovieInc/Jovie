import type { Metadata } from 'next';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';
import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams: Promise<{
    readonly source?: string | string[];
  }>;
}

// Legacy redirect sink — issues HTTP 307 to /{username}?mode=pay before any
// HTML renders. Marked noindex; /pay is the canonical URL.
export function generateMetadata(): Metadata {
  return REDIRECT_SINK_METADATA;
}

/** Legacy /tip route — permanently redirects to /pay, preserving query params */
export default async function TipRedirectPage({
  params,
  searchParams,
}: Readonly<Props>) {
  return redirectToProfileMode(params, searchParams, 'pay');
}
