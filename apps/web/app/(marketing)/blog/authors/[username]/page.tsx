import { notFound } from 'next/navigation';
import { MarketingContainer } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import {
  buildBreadcrumbSchema,
  buildPersonSchema,
} from '@/lib/constants/schemas';

/** Normalize a relative URL to absolute, or return undefined if empty. */
function toAbsoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${BASE_URL}${url}`;
}

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

  const firstPost = authorPosts[0];
  if (!firstPost) {
    return { title: 'Author' };
  }

  const authorName = firstPost.author;

  return {
    title: `${authorName} — Blog`,
    description: `Articles by ${authorName} on the Jovie blog.`,
    alternates: {
      canonical: `${BASE_URL}/blog/authors/${username}`,
    },
    openGraph: {
      title: `${authorName} — Jovie Blog`,
      description: `Articles by ${authorName} on the Jovie blog.`,
      url: `${BASE_URL}/blog/authors/${username}`,
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

  const firstPost = authorPosts[0];
  if (!firstPost) {
    notFound();
  }

  const author = resolveAuthor(firstPost);

  // Normalize profile URL to absolute
  const absoluteProfileUrl = toAbsoluteUrl(author.profileUrl);

  // Build schemas
  const personSchema = buildPersonSchema({
    name: author.name,
    url: `${BASE_URL}/blog/authors/${username}`,
    image: author.avatarUrl ?? undefined,
    description: author.bio,
    sameAs: absoluteProfileUrl ? [absoluteProfileUrl] : [],
  });

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: BASE_URL },
    { name: 'Blog', url: `${BASE_URL}/blog` },
    { name: author.name, url: `${BASE_URL}/blog/authors/${username}` },
  ]);

  return (
    <>
      <script type='application/ld+json'>{personSchema}</script>
      <script type='application/ld+json'>{breadcrumbSchema}</script>

      <div className='min-h-screen'>
        {/* Author Hero */}
        <MarketingContainer width='page' className='pb-12 pt-16 sm:pt-24'>
          <div className='mx-auto max-w-3xl'>
            <BlogAuthorCard author={author} variant='hero' />
          </div>
        </MarketingContainer>

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
