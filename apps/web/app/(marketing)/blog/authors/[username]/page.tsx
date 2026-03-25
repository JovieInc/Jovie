import { notFound } from 'next/navigation';
import { MarketingContainer } from '@/components/marketing';
import { Container } from '@/components/site/Container';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import {
  buildBreadcrumbSchema,
  buildPersonSchema,
} from '@/lib/constants/schemas';
import type { ProfileData } from '@/lib/services/profile';
import { getProfileByUsername } from '@/lib/services/profile';
import { BlogAuthorCard } from '../../components/BlogAuthorCard';
import { BlogCard } from '../../components/BlogCard';

interface AuthorPageProps {
  readonly params: Promise<{ username: string }>;
}

export const revalidate = false;

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  const usernames = [
    ...new Set(
      posts.map(p => p.authorUsername).filter((u): u is string => u != null)
    ),
  ];
  return usernames.map(username => ({ username }));
}

export async function generateMetadata({ params }: AuthorPageProps) {
  const { username } = await params;
  const posts = await getBlogPosts();
  const authorPosts = posts.filter(
    p => p.authorUsername?.toLowerCase() === username.toLowerCase()
  );

  if (authorPosts.length === 0) {
    return { title: 'Author' };
  }

  let profile: ProfileData | null = null;
  try {
    profile = await getProfileByUsername(username);
  } catch {
    profile = null;
  }

  const authorName = profile?.displayName ?? authorPosts[0].author;

  return {
    title: `${authorName} — Jovie Blog`,
    description: `Articles by ${authorName} on the Jovie blog.`,
    alternates: {
      canonical: `${APP_URL}/blog/authors/${username}`,
    },
    openGraph: {
      title: `${authorName} — Jovie Blog`,
      description: `Articles by ${authorName} on the Jovie blog.`,
      url: `${APP_URL}/blog/authors/${username}`,
      type: 'profile' as const,
    },
  };
}

export default async function AuthorPage({
  params,
}: Readonly<AuthorPageProps>) {
  const { username } = await params;
  const posts = await getBlogPosts();
  const authorPosts = posts.filter(
    p => p.authorUsername?.toLowerCase() === username.toLowerCase()
  );

  if (authorPosts.length === 0) {
    notFound();
  }

  let profile: ProfileData | null = null;
  try {
    profile = await getProfileByUsername(username);
  } catch {
    profile = null;
  }

  const author = resolveAuthor(authorPosts[0], profile);

  // Normalize profile URL to absolute
  let absoluteProfileUrl: string | undefined;
  if (author.profileUrl) {
    absoluteProfileUrl = author.profileUrl.startsWith('http')
      ? author.profileUrl
      : `${APP_URL}${author.profileUrl}`;
  }

  // Build schemas
  const personSchema = buildPersonSchema({
    name: author.name,
    url: `${APP_URL}/blog/authors/${username}`,
    image: author.avatarUrl ?? undefined,
    description: author.bio,
    sameAs: absoluteProfileUrl ? [absoluteProfileUrl] : [],
  });

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: APP_URL },
    { name: 'Blog', url: `${APP_URL}/blog` },
    { name: author.name, url: `${APP_URL}/blog/authors/${username}` },
  ]);

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: personSchema }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: breadcrumbSchema }}
      />

      <div className='min-h-screen'>
        {/* Author Hero */}
        <Container size='lg' className='pt-16 sm:pt-24 pb-12'>
          <div className='mx-auto max-w-3xl'>
            <BlogAuthorCard author={author} variant='hero' />
          </div>
        </Container>

        {/* Author Posts */}
        <MarketingContainer width='page' className='pb-20 sm:pb-28'>
          <div className='marketing-divider mb-10' />
          <h2 className='text-xl font-semibold tracking-tight text-primary-token mb-8'>
            {authorPosts.length === 1
              ? '1 article'
              : `${authorPosts.length} articles`}
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
            {authorPosts.map(post => (
              <BlogCard key={post.slug} post={post} author={author} />
            ))}
          </div>
        </MarketingContainer>
      </div>
    </>
  );
}
