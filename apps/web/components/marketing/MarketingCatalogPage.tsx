import { Button } from '@jovie/ui';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_ROUTES } from '@/constants/routes';

export interface MarketingCatalogItem {
  readonly href: string;
  readonly title: string;
  readonly description: string;
}

export interface MarketingCatalogPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly listHeading: string;
  readonly items: readonly MarketingCatalogItem[];
}

export function MarketingCatalogPage({
  eyebrow,
  title,
  description,
  listHeading,
  items,
}: Readonly<MarketingCatalogPageProps>) {
  return (
    <>
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>{eyebrow}</p>
        <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl line-clamp-2'>
          {title}
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          {description}
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token line-clamp-2'>
            {listHeading}
          </h2>
          <ul className='mt-8 grid gap-8 sm:grid-cols-2'>
            {items.map(item => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className='text-base font-medium text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                >
                  {item.title}
                </Link>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </MarketingContainer>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <div className='rounded-xl border border-border-primary bg-surface-secondary p-8 text-center'>
            <h2 className='text-xl font-semibold text-primary-token line-clamp-2'>
              Ready to try Jovie?
            </h2>
            <p className='mt-2 text-sm text-secondary-token'>
              Create your free profile in under a minute.
            </p>
            <Button asChild variant='primary' size='lg' className='mt-6'>
              <Link href={APP_ROUTES.SIGNUP}>Request Access</Link>
            </Button>
          </div>
        </section>
      </MarketingContainer>
    </>
  );
}
