import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { SectionVariant } from '../registry';

export const LOGO_BAR_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'home-trust-default',
    category: 'logo-bar',
    label: 'Trust strip — card (default)',
    description: 'Logos rendered in a glass card. Default for landing pages.',
    componentPath: 'components/features/home/HomeTrustSection.tsx',
    usedIn: ['/', '/artist-profile'],
    status: 'canonical',
    canonical: true,
    render: () => (
      <div className='py-12 px-6'>
        <HomeTrustSection variant='default' presentation='card' />
      </div>
    ),
  },
  {
    id: 'home-trust-compact',
    category: 'logo-bar',
    label: 'Trust strip — compact card',
    description: 'Same card layout, tighter padding. Used in tighter sections.',
    componentPath: 'components/features/home/HomeTrustSection.tsx',
    usedIn: ['/release-notification'],
    status: 'canonical',
    render: () => (
      <div className='py-12 px-6'>
        <HomeTrustSection variant='compact' presentation='card' />
      </div>
    ),
  },
  {
    id: 'home-trust-inline',
    category: 'logo-bar',
    label: 'Trust strip — inline (no card)',
    description: 'Bare horizontal strip. Used in the homepage hero.',
    componentPath: 'components/features/home/HomeTrustSection.tsx',
    usedIn: ['/'],
    status: 'canonical',
    render: () => (
      <div className='py-8 px-6'>
        <HomeTrustSection
          variant='default'
          presentation='inline-strip'
          label='Trusted by artists'
        />
      </div>
    ),
  },
];
