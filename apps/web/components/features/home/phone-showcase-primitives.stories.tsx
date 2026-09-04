import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MODES,
  PhoneShowcase,
  PhoneTourMobileSection,
} from './phone-showcase-primitives';

const meta = {
  title: 'Marketing/PhoneShowcasePrimitives',
  component: PhoneShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    modes: MODES,
    activeIndex: 0,
    autoRotate: false,
    hideTabs: false,
  },
} satisfies Meta<typeof PhoneShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Showcase: Story = {
  render: args => (
    <div className='min-h-dvh bg-page px-5 py-10'>
      <PhoneShowcase {...args} />
    </div>
  ),
};

export const MobileSections: Story = {
  render: () => <PhoneTourMobileSection />,
};
