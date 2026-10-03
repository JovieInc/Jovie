import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SubItem } from './NumberedSection';
import { FeatureAccordion } from './FeatureAccordion';

// Real /home AudienceCRMSection sub-items (apps/web/components/features/home/AudienceCRMSection.tsx).
const AUDIENCE_CRM_SUB_ITEMS: SubItem[] = [
  {
    number: '3.1',
    title: 'Fan Intelligence',
    description:
      'See who keeps showing up: identify super-fans before they even know they are.',
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

const meta = {
  title: 'Marketing/FeatureAccordion',
  component: FeatureAccordion,
  args: {
    items: AUDIENCE_CRM_SUB_ITEMS,
  },
} satisfies Meta<typeof FeatureAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
