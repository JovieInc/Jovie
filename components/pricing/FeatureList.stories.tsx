import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FeatureList } from './FeatureList';

const meta: Meta<typeof FeatureList> = {
  title: 'Pricing/FeatureList',
  component: FeatureList,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof FeatureList>;

export const Default: Story = {
  args: {
    title: "What's included",
    features: [
      { title: 'Custom profile URL' },
      { title: 'Unlimited music links' },
      { title: 'Social media integration' },
      { title: 'Analytics dashboard' },
      { title: 'Fan notifications' },
    ],
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const ProFeatures: Story = {
  args: {
    title: 'Pro Features',
    features: [
      { title: 'Remove Jovie branding' },
      { title: 'Priority support' },
      { title: 'Advanced analytics' },
      { title: 'Custom themes' },
      { title: 'Early access to new features' },
    ],
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const ShortList: Story = {
  args: {
    title: 'Basic Features',
    features: [{ title: 'Profile page' }, { title: 'Music links' }],
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};
