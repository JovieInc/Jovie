import { Button } from '@jovie/ui';
import { Check, Minus } from 'lucide-react';
import Link from 'next/link';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
import { APP_NAME } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import type { ComparisonData } from '@/content/comparisons';

interface ComparisonPageContentProps {
  readonly data: ComparisonData;
}

export function ComparisonPageContent({
  data,
}: Readonly<ComparisonPageContentProps>) {
  return (
    <>
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Compare</p>
        <h1 className='mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
          {data.heroHeadline}
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          {data.heroSubheadline}
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            Feature Comparison
          </h2>
          <div className='mt-8 overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b border-border-primary'>
                  <th
                    scope='col'
                    className='pb-3 pr-4 text-left font-medium text-secondary-token'
                  >
                    Feature
                  </th>
                  <th
                    scope='col'
                    className='pb-3 px-4 text-center font-medium text-primary-token'
                  >
                    {APP_NAME}
                  </th>
                  <th
                    scope='col'
                    className='pb-3 pl-4 text-center font-medium text-secondary-token'
                  >
                    {data.competitor}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-border-primary'>
                {data.features.map(feature => (
                  <tr key={feature.name}>
                    <th
                      scope='row'
                      className='py-3 pr-4 text-left font-normal text-secondary-token'
                    >
                      {feature.name}
                      {feature.note && (
                        <span className='mt-1 block text-xs text-tertiary-token'>
                          {feature.note}
                        </span>
                      )}
                    </th>
                    <td className='py-3 px-4 text-center'>
                      {feature.jovie ? (
                        <Check
                          aria-label='Yes'
                          className='mx-auto h-4 w-4 text-accent-green'
                        />
                      ) : (
                        <Minus
                          aria-label='No'
                          className='mx-auto h-4 w-4 text-tertiary-token'
                        />
                      )}
                    </td>
                    <td className='py-3 pl-4 text-center'>
                      {feature.competitor ? (
                        <Check
                          aria-label='Yes'
                          className='mx-auto h-4 w-4 text-accent-green'
                        />
                      ) : (
                        <Minus
                          aria-label='No'
                          className='mx-auto h-4 w-4 text-tertiary-token'
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </MarketingContainer>

      <MarketingContainer width='prose' className='pb-16'>
        <section>
          <h2 className='text-2xl font-semibold text-primary-token'>
            The Bottom Line
          </h2>
          <p className='mt-4 text-base leading-relaxed text-secondary-token'>
            {data.bottomLine}
          </p>
          <div className='mt-8'>
            <Button asChild variant='primary' size='lg'>
              <Link href={APP_ROUTES.SIGNUP}>Try {APP_NAME} Free</Link>
            </Button>
          </div>
        </section>
      </MarketingContainer>

      <FaqSection
        items={data.faq}
        headingClassName='text-2xl font-semibold tracking-tight text-primary-token'
      />
    </>
  );
}
