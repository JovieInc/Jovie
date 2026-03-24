import { notFound } from 'next/navigation';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getCategoryBySlug } from '@/lib/blog/categories';
import { getBlogPosts, slugifyCategory } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';
import type { ProfileData } from '@/lib/services/profile';
import { getProfilesByUsernames } from '@/lib/services/profile';
import { BlogCard } from '../../components/BlogCard';

interface CategoryPageProps {
  readonly params: Promise<{ slug: string }>;
}

export const revalidate = false;

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  const categories = [
    ...new Set(
      posts.map(p => p.category).filter((c): c is string => c != null)
    ),
  ];
  return categories.map(category => ({
    slug: slugifyCategory(category),
  }));
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { slug } = await params;
  const posts = await getBlogPosts();
  const allCategories = [
    ...new Set(
      posts.map(p => p.category).filter((c): c is string => c != null)
    ),
  ];
  const category = getCategoryBySlug(slug, allCategories);

  if (!category) {
    return { title: 'Category' };
  }

  return {
    title: `${category.name} — Jovie Blog`,
    description: category.description,
    alternates: {
      canonical: `${APP_URL}/blog/category/${slug}`,
    },
    openGraph: {
      title: `${category.name} — Jovie Blog`,
      description: category.description,
      url: `${APP_URL}/blog/category/${slug}`,
    },
  };
}

export default async function CategoryPage({
  params,
}: Readonly<CategoryPageProps>) {
  const { slug } = await params;
  const posts = await getBlogPosts();
  const allCategories = [
    ...new Set(
      posts.map(p => p.category).filter((c): c is string => c != null)
    ),
  ];
  const category = getCategoryBySlug(slug, allCategories);

  if (!category) {
    notFound();
  }

  const categoryPosts = posts.filter(
    p => p.category && slugifyCategory(p.category) === slug
  );

  // Resolve author profiles
  const usernames = [
    ...new Set(
      categoryPosts
        .map(p => p.authorUsername)
        .filter((u): u is string => u != null)
    ),
  ];
  let profileMap: Map<string, ProfileData> = new Map();
  try {
    profileMap = await getProfilesByUsernames(usernames);
  } catch {
    // Fallback
  }

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: APP_URL },
    { name: 'Blog', url: `${APP_URL}/blog` },
    { name: category.name, url: `${APP_URL}/blog/category/${slug}` },
  ]);

  return (
    <>
      <script type='application/ld+json'>{breadcrumbSchema}</script>

      <div className='min-h-screen'>
        {/* Hero */}
        <MarketingHero variant='left'>
          <p
            className='marketing-kicker mb-0'
            style={{ color: 'var(--linear-text-tertiary)' }}
          >
            Blog
          </p>
          <h1
            className='marketing-h1-linear mb-6 mt-6'
            style={{ color: 'var(--linear-text-primary)' }}
          >
            {category.name}
          </h1>
          <p
            className='marketing-lead-linear max-w-[34rem]'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            {category.description}
          </p>
        </MarketingHero>

        {/* Posts Grid */}
        <MarketingContainer width='page' className='pb-20 sm:pb-28'>
          <div className='marketing-divider mb-10' />
          {categoryPosts.length === 0 ? (
            <p className='text-secondary-token'>
              No posts in this category yet.
            </p>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
              {categoryPosts.map(post => {
                const author = resolveAuthor(
                  post,
                  post.authorUsername
                    ? profileMap.get(post.authorUsername.toLowerCase())
                    : null
                );
                return <BlogCard key={post.slug} post={post} author={author} />;
              })}
            </div>
          )}
        </MarketingContainer>
      </div>
    </>
  );
}
