import { MarketingFooter } from '@/components/site/MarketingFooter';
import type { SectionVariant } from '../registry';

export const FOOTER_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-footer-expanded',
    category: 'footer',
    label: 'Marketing Footer — expanded (default)',
    description: 'Full footer with link columns. Default for landing pages.',
    componentPath: 'components/site/MarketingFooter.tsx',
    usedIn: ['/', '/artist-profile', 'most landings'],
    status: 'canonical',
    canonical: true,
    render: () => <MarketingFooter variant='expanded' />,
  },
  {
    id: 'marketing-footer-minimal',
    category: 'footer',
    label: 'Marketing Footer — minimal',
    description:
      'Compact footer for legal/pricing pages. Logo + privacy/terms only.',
    componentPath: 'components/site/MarketingFooter.tsx',
    usedIn: ['/pricing', '/privacy', '/terms'],
    status: 'canonical',
    render: () => <MarketingFooter variant='minimal' />,
  },
];
