import { NumberedSection } from '@/components/marketing';
import { ProductScreenshot } from './ProductScreenshot';

const SUB_ITEMS = [
  {
    number: '5.1',
    title: 'Real-time Streams',
    description:
      'Watch streams as they come in. See which releases are gaining momentum.',
  },
  {
    number: '5.2',
    title: 'Geographic Insights',
    description:
      'See where your fans are. Plan tours and campaigns around real listener density.',
  },
  {
    number: '5.3',
    title: 'Campaign Attribution',
    description:
      'Track which campaigns drive results. Know your ROI before you scale spend.',
  },
];

export function AnalyticsSection() {
  return (
    <NumberedSection
      id='analytics'
      sectionNumber='5.0'
      sectionTitle='Analytics'
      heading='Understand your reach.'
      description='Take the guesswork out of music marketing with real-time analytics that surface what needs your attention.'
      subItems={SUB_ITEMS}
    >
      <ProductScreenshot
        src='/product-screenshots/insights-dashboard.png'
        alt='Analytics dashboard showing stream counts, charts, and top cities'
        width={2880}
        height={1800}
        title='Analytics'
      />
    </NumberedSection>
  );
}
