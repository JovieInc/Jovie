import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { PRODUCT_EXPLORE_GROUPS } from '@/data/productExploreLinks';

/**
 * A quiet, plain index of the product pages that are not in the footer. No
 * cards, no icons: text links in two lists, on the matte page background.
 */
export function ProductExploreLinks() {
  return (
    <aside
      aria-labelledby='product-explore-heading'
      data-testid='product-explore-links'
      className='bg-base py-16 sm:py-20 text-primary-token'
    >
      <MarketingContainer width='page'>
        <h2
          id='product-explore-heading'
          className='truncate text-balance text-sm font-medium text-secondary-token'
        >
          Explore
        </h2>
        <div className='mt-6 grid gap-10 sm:grid-cols-2'>
          {PRODUCT_EXPLORE_GROUPS.map(group => (
            <nav key={group.id} aria-label={group.title}>
              <p className='text-xs text-tertiary-token'>{group.title}</p>
              <ul className='mt-3 flex list-none flex-col gap-2 p-0'>
                {group.links.map(link => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className='focus-ring-themed inline-flex text-sm text-secondary-token underline-offset-4 hover:text-primary-token hover:underline'
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </MarketingContainer>
    </aside>
  );
}
