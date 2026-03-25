import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/organisms/BlogPostPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import {
  getBlogPost,
  getBlogPostSlugs,
  getRelatedPosts,
} from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
} from '@/lib/constants/schemas';
import type { ProfileData } from '@/lib/services/profile';
import {
  getProfileByUsername,
  getProfilesByUsernames,
} from '@/lib/services/profile';

interface BlogPostPageProps {
  readonly params: Promise<{ slug: string }>;
}

// Fully static - blog posts are pre-generated at build time
export const revalidate = false;

export async function generateStaticParams() {
  const slugs = await getBlogPostSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;

  try {
    const post = await getBlogPost(slug);

    return {
      title: post.title,
      description: post.excerpt,
      alternates: {
        canonical: `${APP_URL}/blog/${post.slug}`,
      },
      openGraph: {
        title: post.title,
        description: post.excerpt,
        url: `${APP_URL}/blog/${post.slug}`,
        type: 'article' as const,
        publishedTime: post.date,
        modifiedTime: post.updatedDate ?? post.date,
        authors: [post.author],
        section: post.category,
        tags: post.tags,
      },
      twitter: {
        card: 'summary_large_image' as const,
        title: post.title,
        description: post.excerpt,
      },
    };
  } catch {
    return {
      title: 'Blog Post',
    };
  }
}

export default async function BlogPostRoute({
  params,
}: Readonly<BlogPostPageProps>) {
  const { slug } = await params;

  try {
    const post = await getBlogPost(slug);

    // Resolve author profile
    let profile: ProfileData | null = null;
    if (post.authorUsername) {
      try {
        profile = await getProfileByUsername(post.authorUsername);
      } catch {
        profile = null;
      }
    }
    const author = resolveAuthor(post, profile);

    // Get related posts with author data
    const relatedPosts = await getRelatedPosts(slug, post.category);
    const relatedUsernames = [
      ...new Set(
        relatedPosts
          .map(p => p.authorUsername)
          .filter((u): u is string => u != null)
      ),
    ];
    let relatedProfileMap: Map<string, ProfileData> = new Map();
    try {
      relatedProfileMap = await getProfilesByUsernames(relatedUsernames);
    } catch {
      // Fallback to frontmatter-only
    }
    const relatedAuthors = new Map(
      relatedPosts.map(p => [
        p.slug,
        resolveAuthor(
          p,
          p.authorUsername
            ? relatedProfileMap.get(p.authorUsername.toLowerCase())
            : null
        ),
      ])
    );

    // Build schemas
    // Normalize author URL to absolute
    let authorUrl: string | undefined;
    if (author.profileUrl) {
      authorUrl = author.profileUrl.startsWith('http')
        ? author.profileUrl
        : `${APP_URL}${author.profileUrl}`;
    }

    const articleSchema = buildArticleSchema({
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.updatedDate ?? post.date,
      authorName: post.author,
      authorUrl,
      authorImageUrl: author.avatarUrl ?? undefined,
      url: `${APP_URL}/blog/${post.slug}`,
      keywords: post.tags,
      wordCount: post.wordCount,
    });

    const breadcrumbSchema = buildBreadcrumbSchema([
      { name: APP_NAME, url: APP_URL },
      { name: 'Blog', url: `${APP_URL}/blog` },
      { name: post.title, url: `${APP_URL}/blog/${post.slug}` },
    ]);

    return (
      <>
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{ __html: articleSchema }}
        />
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{ __html: breadcrumbSchema }}
        />
        <BlogPostPage
          post={post}
          author={author}
          toc={post.toc}
          relatedPosts={relatedPosts}
          relatedAuthors={relatedAuthors}
        />
      </>
    );
  } catch {
    notFound();
  }
}
