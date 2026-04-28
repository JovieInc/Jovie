import { Camera, Disc3, LineChart } from 'lucide-react';
import { FeatureCard } from '@/components/molecules/FeatureCard';
import type { SectionVariant } from '../registry';

function FeatureCardGrid() {
  return (
    <div className='mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3'>
      <FeatureCard
        title='Plan releases'
        description='Map your campaign — pre-saves, editorial pitch, social rollout, day-of amplification — on a single calendar.'
        icon={<Disc3 className='h-5 w-5' />}
        accent='green'
        metric='6-week runway'
      />
      <FeatureCard
        title='Generate album art'
        description='Move from style brief to render-ready cover art in minutes, with the right aspect ratios pre-baked.'
        icon={<Camera className='h-5 w-5' />}
        accent='purple'
      />
      <FeatureCard
        title='Track what worked'
        description='See which links converted, which playlists drove engagement, and which fans stuck around.'
        icon={<LineChart className='h-5 w-5' />}
        accent='blue'
      />
    </div>
  );
}

export const FEATURE_CARD_VARIANTS: readonly SectionVariant[] = [
  {
    id: 'feature-card-grid-3up',
    category: 'feature-card',
    label: 'Feature cards — 3-up grid',
    description:
      'Three feature cards on desktop, one column on mobile. Standard outcome row.',
    componentPath: 'components/molecules/FeatureCard.tsx',
    usedIn: ['/', '/artist-profile'],
    status: 'canonical',
    canonical: true,
    render: () => <FeatureCardGrid />,
  },
];
