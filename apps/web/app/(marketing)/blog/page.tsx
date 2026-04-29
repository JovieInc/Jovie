import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { BASE_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import { BlogCard } from './components/BlogCard';

// Fully static - blog posts are read from filesystem at build time
export const revalidate = false;

export const metadata = {
  title: 'Blog',
  description:
    'Signals, playbooks, and product notes for building lasting momentum as an independent artist.',
  alternates: {
    canonical: `${BASE_URL}/blog`,
  },
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();
  const [featured, ...remaining] = posts;

  if (!featured) {
    return (
      <div className='min-h-screen'>
        <MarketingHero variant='left'>
          <p className='marketing-kicker mb-0 text-tertiary-token'>Blog</p>
          <h1 className='marketing-h1-linear mb-6 mt-6 max-w-[8ch] text-primary-token'>
            Blog
          </h1>
          <p className='marketing-lead-linear max-w-[34rem] text-secondary-token'>
            Posts coming soon.
          </p>
        </MarketingHero>
      </div>
    );
  }

  const featuredAuthor = resolveAuthor(featured);

  return (
    <div className='min-h-screen'>
      {/* Hero Section */}
      <MarketingHero variant='left'>
        <p
          className='marketing-kicker mb-0'
          style={{ color: 'var(--linear-text-tertiary)' }}
        >
          Blog
        </p>
        <h1
          className='marketing-h1-linear mb-6 mt-6 max-w-[8ch]'
          style={{ color: 'var(--linear-text-primary)' }}
        >
          Blog
        </h1>
        <p
          className='marketing-lead-linear max-w-[34rem]'
          style={{ color: 'var(--linear-text-secondary)' }}
        >
          Thoughts on product, strategy, and the craft of building tools for
          artists.
        </p>
      </MarketingHero>

      {/* Posts Grid */}
      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />

        {/* Featured Post */}
        <div className='mb-10'>
          <BlogCard
            post={featured}
            author={featuredAuthor}
            variant='featured'
          />
        </div>

        {/* Remaining Posts Grid */}
        {remaining.length > 0 && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
            {remaining.map(post => {
              const author = resolveAuthor(post);
              return <BlogCard key={post.slug} post={post} author={author} />;
            })}
          </div>
        )}
      </MarketingContainer>
    </div>
  );
}
