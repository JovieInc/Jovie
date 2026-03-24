import Link from 'next/link';
import { slugifyCategory } from '@/lib/blog/getBlogPosts';

export interface CategoryPillProps {
  readonly category: string;
}

export function CategoryPill({ category }: CategoryPillProps) {
  return (
    <Link
      href={`/blog/category/${slugifyCategory(category)}`}
      className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 bg-surface-1 text-tertiary-token hover:text-primary-token hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
    >
      {category}
    </Link>
  );
}
