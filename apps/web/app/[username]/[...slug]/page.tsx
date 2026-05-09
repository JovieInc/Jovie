import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { REDIRECT_SINK_METADATA } from '@/lib/profile/metadata';

interface Props {
  readonly params: Promise<{
    readonly username: string;
    readonly slug: string[];
  }>;
}

// Catch-all for unknown sub-paths — redirects to the profile root.
// Marked noindex to avoid indexing transient or unknown paths.
export function generateMetadata(): Metadata {
  return REDIRECT_SINK_METADATA;
}

export default async function CatchAllPage({ params }: Props) {
  const { username } = await params;
  // Redirect unknown paths to the main profile
  redirect(`/${username}`);
}
