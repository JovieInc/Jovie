import { BlogEditorialRow } from '@/app/(marketing)/blog/components/BlogEditorialRow';
import type { BlogPostSummary } from '@/lib/blog/presentation-contracts';
import { isBlogPostIndexable } from '@/lib/blog/publication';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';

export interface HomepageLatestNewsProps {
  readonly posts: readonly BlogPostSummary[];
}

/** The route supplies build-time content; this presenter performs no fetch. */
export function HomepageLatestNews({ posts }: HomepageLatestNewsProps) {
  const latestPosts = posts
    .filter(post => isBlogPostIndexable(post.slug))
    .slice(0, 4);

  return (
    <BlogEditorialRow
      entries={latestPosts.map(post => ({ post, author: resolveAuthor(post) }))}
    />
  );
}
