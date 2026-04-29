import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/organisms/BlogPostPage';
import { APP_NAME, BASE_URL } from '@/constants/app';
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

/** Normalize a relative URL to absolute, or return undefined if empty. */
function toAbsoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${BASE_URL}${url}`;
}

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
        canonical: `${BASE_URL}/blog/${post.slug}`,
      },
      openGraph: {
        title: post.title,
        description: post.excerpt,
        url: `${BASE_URL}/blog/${post.slug}`,
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

    const author = resolveAuthor(post);

    const relatedPosts = await getRelatedPosts(slug, post.category);
    const relatedAuthors = new Map(
      relatedPosts.map(p => [p.slug, resolveAuthor(p)])
    );

    // Build schemas
    // Normalize author URL to absolute
    const authorUrl = toAbsoluteUrl(author.profileUrl);

    const articleSchema = buildArticleSchema({
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.updatedDate ?? post.date,
      authorName: post.author,
      authorUrl,
      authorImageUrl: author.avatarUrl ?? undefined,
      url: `${BASE_URL}/blog/${post.slug}`,
      keywords: post.tags,
      wordCount: post.wordCount,
    });

    const breadcrumbSchema = buildBreadcrumbSchema([
      { name: APP_NAME, url: BASE_URL },
      { name: 'Blog', url: `${BASE_URL}/blog` },
      { name: post.title, url: `${BASE_URL}/blog/${post.slug}` },
    ]);

    return (
      <>
        <script type='application/ld+json'>{articleSchema}</script>
        <script type='application/ld+json'>{breadcrumbSchema}</script>
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
