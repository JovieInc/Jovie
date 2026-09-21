import { BlogCard } from '@/app/(marketing)/blog/components/BlogCard';
import type { StoryBlogPost } from './fixtures';

/** Deterministic data adapter for the production card; no duplicate markup. */
export function StoryBlogCard({
  post,
  variant = 'default',
}: Readonly<{
  post: StoryBlogPost;
  variant?: 'featured' | 'default';
}>) {
  return (
    <BlogCard
      post={{ ...post, tags: [], wordCount: 0 }}
      author={{ name: post.author, avatarUrl: null, isVerified: false }}
      variant={variant}
    />
  );
}
