import type { BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { BlogCard } from './BlogCard';

export interface BlogRelatedPostsProps {
  readonly posts: BlogPostSummary[];
  readonly authors: Map<string, ResolvedAuthor>;
}

export function BlogRelatedPosts({ posts, authors }: BlogRelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section aria-label='Related posts'>
      <h2 className='text-xl font-semibold tracking-tight text-primary-token mb-6'>
        Keep reading
      </h2>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {posts.map(post => {
          const author = authors.get(post.slug);
          if (!author) return null;
          return <BlogCard key={post.slug} post={post} author={author} />;
        })}
      </div>
    </section>
  );
}
