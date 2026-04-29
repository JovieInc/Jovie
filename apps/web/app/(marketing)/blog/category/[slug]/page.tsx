import { notFound } from 'next/navigation';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { getCategoryBySlug } from '@/lib/blog/categories';
import { getBlogPosts, slugifyCategory } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';
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
    title: `${category.name} — Blog`,
    description: category.description,
    alternates: {
      canonical: `${BASE_URL}/blog/category/${slug}`,
    },
    openGraph: {
      title: `${category.name} — Jovie Blog`,
      description: category.description,
      url: `${BASE_URL}/blog/category/${slug}`,
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

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: APP_NAME, url: BASE_URL },
    { name: 'Blog', url: `${BASE_URL}/blog` },
    { name: category.name, url: `${BASE_URL}/blog/category/${slug}` },
  ]);

  return (
    <>
      <script type='application/ld+json'>{breadcrumbSchema}</script>

      <div className='min-h-screen'>
        {/* Hero */}
        <MarketingHero variant='left'>
          <p className='marketing-kicker mb-0 text-tertiary-token'>Blog</p>
          <h1 className='marketing-h1-linear mb-6 mt-6 text-primary-token'>
            {category.name}
          </h1>
          <p className='marketing-lead-linear max-w-[34rem] text-secondary-token'>
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
                const author = resolveAuthor(post);
                return <BlogCard key={post.slug} post={post} author={author} />;
              })}
            </div>
          )}
        </MarketingContainer>
      </div>
    </>
  );
}
