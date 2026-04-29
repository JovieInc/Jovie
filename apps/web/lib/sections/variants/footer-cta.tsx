import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import type { SectionVariant } from '../registry';

export const FOOTER_CTA_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'marketing-final-cta-default',
    category: 'footer-cta',
    label: 'Marketing Final CTA (default)',
    description:
      'Locked footer CTA — every landing page must end with this unless explicitly opted out via the LEGAL_ROUTES list.',
    componentPath: 'components/site/MarketingFinalCTA.tsx',
    usedIn: ['/pricing', '/artist-profile (target)'],
    status: 'canonical',
    canonical: true,
    render: () => <MarketingFinalCTA />,
  },
  {
    id: 'marketing-final-cta-with-secondary',
    category: 'footer-cta',
    label: 'Marketing Final CTA — with secondary',
    description:
      'Same canonical CTA, with a secondary link rendered next to the primary.',
    componentPath: 'components/site/MarketingFinalCTA.tsx',
    usedIn: ['/pricing'],
    status: 'canonical',
    render: () => (
      <MarketingFinalCTA
        title='Ready to stop juggling tools?'
        body='Replace LinkTree, scheduling app, fan email, and three spreadsheets with one workspace.'
        ctaLabel='Claim my workspace'
        secondaryLabel='See pricing'
        secondaryHref='/pricing'
      />
    ),
  },
  {
    id: 'final-cta-section-claim-handle',
    category: 'footer-cta',
    label: 'FinalCTASection (form-based)',
    description:
      'Homepage claim-handle form. Slated for refactor — extract ClaimHandleForm and use MarketingFinalCTA as the shell.',
    componentPath: 'components/features/home/FinalCTASection.tsx',
    usedIn: ['/'],
    status: 'consolidate',
    mergeInto: 'marketing-final-cta-default',
    render: () => <MarketingFinalCTA />,
  },
  {
    id: 'organism-cta-section',
    category: 'footer-cta',
    label: 'CTASection (organism)',
    description:
      'Generic CTA used only by PayPromo, which is itself dormant behind NEXT_PUBLIC_FEATURE_TIPS. Delete both together when the Tips feature is officially shelved.',
    componentPath: 'components/organisms/CTASection.tsx',
    usedIn: ['PayPromo (dormant, feature-flagged)'],
    status: 'consolidate',
    mergeInto: 'marketing-final-cta-default',
    render: () => <MarketingFinalCTA />,
  },
];
