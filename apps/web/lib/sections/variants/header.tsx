import { MarketingHeader } from '@/components/site/MarketingHeader';
import type { SectionVariant } from '../registry';

export const HEADER_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-header-landing',
    category: 'header',
    label: 'Landing (default)',
    description:
      'Standard landing-page header. Wraps `HeaderNav` with the public-static auth shell.',
    componentPath: 'components/site/MarketingHeader.tsx',
    usedIn: ['/', '/(home)/*', '/pricing', '/artist-profile', 'most landings'],
    status: 'canonical',
    canonical: true,
    render: () => <MarketingHeader variant='landing' />,
  },
  {
    id: 'marketing-header-content',
    category: 'header',
    label: 'Content (blog / changelog / support)',
    description:
      'Slimmer variant for long-form content surfaces. Same auth shell.',
    componentPath: 'components/site/MarketingHeader.tsx',
    usedIn: ['/blog', '/blog/[slug]', '/changelog', '/support'],
    status: 'canonical',
    render: () => <MarketingHeader variant='content' />,
  },
  {
    id: 'marketing-header-minimal',
    category: 'header',
    label: 'Minimal (legal / 404)',
    description: 'Logo-only header. Used on legal pages and error states.',
    componentPath: 'components/site/MarketingHeader.tsx',
    usedIn: ['/privacy', '/terms', '/not-found'],
    status: 'canonical',
    render: () => <MarketingHeader variant='minimal' />,
  },
  {
    id: 'marketing-header-homepage',
    category: 'header',
    label: 'Homepage (transparent on scroll)',
    description:
      'Used on the home route — transparent docked + frosted glass past 8px scroll.',
    componentPath: 'components/site/MarketingHeader.tsx',
    usedIn: ['/'],
    status: 'canonical',
    render: () => <MarketingHeader variant='homepage' />,
  },
];
