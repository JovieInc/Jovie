import { BlogEditorialRow } from '@/app/(marketing)/blog/components/BlogEditorialRow';
import { getBlogPosts, isBlogPostIndexable } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';

/** Build-time filesystem content; no request-time author or article fetch. */
export async function HomepageLatestNews() {
  const posts = (await getBlogPosts())
    .filter(post => isBlogPostIndexable(post.slug))
    .slice(0, 4);

  return (
    <BlogEditorialRow
      entries={posts.map(post => ({ post, author: resolveAuthor(post) }))}
    />
  );
}
