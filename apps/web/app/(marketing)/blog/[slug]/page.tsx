import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/organisms/BlogPostPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getBlogPost, getBlogPostSlugs } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
} from '@/lib/constants/schemas';
import { getProfileByUsername } from '@/lib/services/profile';

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
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
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
    let profile = null;
    if (post.authorUsername) {
      try {
        profile = await getProfileByUsername(post.authorUsername);
      } catch {
        profile = null;
      }
    }
    const author = resolveAuthor(post, profile);

    const articleSchema = buildArticleSchema({
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      authorName: post.author,
      url: `${APP_URL}/blog/${post.slug}`,
    });

    const breadcrumbSchema = buildBreadcrumbSchema([
      { name: APP_NAME, url: APP_URL },
      { name: 'Blog', url: `${APP_URL}/blog` },
      { name: post.title, url: `${APP_URL}/blog/${post.slug}` },
    ]);

    return (
      <>
        <script type='application/ld+json'>{articleSchema}</script>
        <script type='application/ld+json'>{breadcrumbSchema}</script>
        <BlogPostPage post={post} author={author} />
      </>
    );
  } catch {
    notFound();
  }
}
