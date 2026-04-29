import { MarketingFooterCta } from '@/components/site/MarketingFooterCta';
import type { SectionVariant } from '../registry';

export const FOOTER_CTA_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-footer-cta-default',
    category: 'footer-cta',
    label: 'Marketing Footer CTA',
    description:
      'Locked footer CTA. Public landing pages use this treatment unless a page owns the final CTA itself.',
    componentPath: 'components/site/MarketingFooterCta.tsx',
    usedIn: ['/', '/pricing', '/artist-profiles'],
    status: 'canonical',
    canonical: true,
    render: () => <MarketingFooterCta />,
  },
  {
    id: 'final-cta-section-claim-handle',
    category: 'footer-cta',
    label: 'FinalCTASection (form-based)',
    description:
      'Legacy homepage claim-handle form. Consolidate into the locked footer CTA shell if this returns.',
    componentPath: 'components/features/home/FinalCTASection.tsx',
    usedIn: ['/'],
    status: 'consolidate',
    mergeInto: 'marketing-footer-cta-default',
    render: () => <MarketingFooterCta />,
  },
  {
    id: 'organism-cta-section',
    category: 'footer-cta',
    label: 'CTASection (organism)',
    description:
      'Orphaned generic CTA. Zero call sites — slated for deletion in PR 3.',
    componentPath: 'components/organisms/CTASection.tsx',
    usedIn: [],
    status: 'orphaned',
    mergeInto: 'marketing-footer-cta-default',
    render: () => <MarketingFooterCta />,
  },
];
