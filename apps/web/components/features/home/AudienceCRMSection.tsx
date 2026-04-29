import { NumberedSection } from '@/components/marketing';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';

const SUB_ITEMS = [
  {
    number: '3.1',
    title: 'Fan Intelligence',
    description:
      'See who keeps showing up — identify super-fans before they even know they are.',
  },
  {
    number: '3.2',
    title: 'Source Tracking',
    description:
      'Know which platform drove every fan. See what actually converts.',
  },
  {
    number: '3.3',
    title: 'Segments',
    description:
      'Build campaign-ready audience slices based on engagement, location, and source.',
  },
];

export function AudienceCRMSection() {
  return (
    <NumberedSection
      id='audience'
      sectionNumber='3.0'
      sectionTitle='Audience'
      heading='Know every fan by name.'
      description='See who returns, where they came from, and what actually drives growth.'
      subItems={SUB_ITEMS}
      className='relative overflow-hidden bg-page'
    >
      <div className='relative'>
        <MarketingScreenshot
          scenarioId='dashboard-audience-desktop'
          altOverride='Audience CRM showing fan table with source tracking and segments'
          width={2880}
          height={1800}
          title='Audience'
        />
        {/* Bottom gradient fade */}
        <div className='pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-linear-to-t from-[var(--linear-bg-surface-0)] to-transparent' />
      </div>
    </NumberedSection>
  );
}
