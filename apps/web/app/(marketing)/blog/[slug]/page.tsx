import { notFound } from 'next/navigation';
import { BlogPostPage } from '@/components/organisms/BlogPostPage';
import { APP_URL } from '@/constants/app';
import { getBlogPost, getBlogPostSlugs } from '@/lib/blog/getBlogPosts';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
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
    return <BlogPostPage post={post} />;
  } catch {
    notFound();
  }
}
