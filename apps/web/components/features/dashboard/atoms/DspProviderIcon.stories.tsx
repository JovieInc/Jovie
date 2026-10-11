import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DSP_PROVIDER_IDS } from '@/lib/dsp-provider-metadata';
import { DspProviderIcon } from './DspProviderIcon';

const meta = {
  title: 'Dashboard/Atoms/DspProviderIcon',
  component: DspProviderIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    provider: 'spotify',
    size: 'md',
  },
  argTypes: {
    provider: {
      control: 'select',
      options: DSP_PROVIDER_IDS,
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
} satisfies Meta<typeof DspProviderIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: {
    showLabel: true,
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    showLabel: true,
  },
};

export const NonStreamingProvider: Story = {
  args: {
    provider: 'genius',
    showLabel: true,
  },
};

export const AllProviders: Story = {
  render: args => (
    <div className='flex flex-wrap items-center gap-4'>
      {DSP_PROVIDER_IDS.map(provider => (
        <DspProviderIcon
          key={provider}
          {...args}
          provider={provider}
          showLabel
        />
      ))}
    </div>
  ),
};
