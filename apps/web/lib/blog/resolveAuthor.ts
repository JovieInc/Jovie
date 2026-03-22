import type { ProfileData } from '@/lib/services/profile';
import type { BlogPostMetadata } from './getBlogPosts';

export interface ResolvedAuthor {
  name: string;
  title?: string;
  avatarUrl: string | null;
  profileUrl?: string;
  isVerified: boolean;
}

export function resolveAuthor(
  post: BlogPostMetadata,
  profile?: ProfileData | null
): ResolvedAuthor {
  return {
    name: profile?.displayName || post.author,
    title: post.authorTitle,
    avatarUrl: profile?.avatarUrl ?? null,
    profileUrl: profile ? `/${profile.username}` : post.authorProfile,
    isVerified: profile?.isVerified ?? false,
  };
}
