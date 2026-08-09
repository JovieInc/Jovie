import { BASE_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import type { ProfileData } from '@/lib/services/profile';
import { getProfilesByUsernames } from '@/lib/services/profile';
import { BlogFeed } from './BlogFeed';

// Fully static - blog posts are read from filesystem at build time
export const revalidate = false;

export const metadata = {
  title: 'Blog',
  description:
    'Signals, playbooks, and product notes for building lasting momentum as an independent artist.',
  alternates: {
    canonical: `${BASE_URL}/blog`,
  },
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();
  const usernames = [
    ...new Set(
      posts.map(p => p.authorUsername).filter((u): u is string => u != null)
    ),
  ];
  let profileMap: Map<string, ProfileData> = new Map();
  try {
    profileMap = await getProfilesByUsernames(usernames);
  } catch {
    // Fallback to frontmatter-only author data if profile fetch fails
  }

  const entries = posts.map(post => ({
    post,
    author: resolveAuthor(
      post,
      post.authorUsername
        ? profileMap.get(post.authorUsername.toLowerCase())
        : null
    ),
  }));

  return <BlogFeed entries={entries} />;
}
