import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';

// Catch-all for unknown sub-paths — returns a context-aware 404.
// Marked noindex to avoid indexing transient or unknown paths.
export function generateMetadata(): Metadata {
  return REDIRECT_SINK_METADATA;
}

export default async function CatchAllPage() {
  notFound();
}
