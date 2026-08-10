import type { ProfileData } from '@/lib/services/profile';
import type {
  BlogPostMetadata,
  ResolvedAuthor,
} from './presentation-contracts';

export type { ResolvedAuthor } from './presentation-contracts';

export function resolveAuthor(
  post: BlogPostMetadata,
  profile?: ProfileData | null
): ResolvedAuthor {
  return {
    name: profile?.displayName || post.author,
    title: post.authorTitle,
    avatarUrl: profile?.avatarUrl ?? null,
    profileUrl: profile ? `/${profile.usernameNormalized}` : post.authorProfile,
    isVerified: profile?.isVerified ?? false,
    bio: profile?.bio ?? undefined,
    username: profile?.usernameNormalized ?? post.authorUsername,
  };
}
