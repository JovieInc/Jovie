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
    description: 'Bare horizontal strip for compact adaptive introductions.',
    componentPath: 'components/features/home/HomeTrustSection.tsx',
    usedIn: ['/artist-profile', '/artist-profiles'],
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
  {
    id: 'home-trust-proof-moment',
    category: 'logo-bar',
    label: 'Trust strip — artist proof moment',
    description:
      'Named label proof with a reserved, responsive 3+2 / 2+1+2 grid.',
    componentPath: 'components/features/home/HomeTrustSection.tsx',
    usedIn: ['/'],
    status: 'canonical',
    render: () => <HomeTrustSection presentation='proof-moment' />,
  },
];
