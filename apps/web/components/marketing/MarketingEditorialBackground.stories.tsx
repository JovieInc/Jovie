import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';

const meta: Meta<typeof MarketingEditorialBackground> = {
  title: 'Marketing/Primitives/MarketingEditorialBackground',
  component: MarketingEditorialBackground,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='relative min-h-screen overflow-hidden bg-base text-primary-token'>
        <Story />
        <div className='relative z-10 flex min-h-screen items-center justify-center'>
          <p className='max-w-md text-center text-lg'>
            Receiving section content sits on the calm dark region.
          </p>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Soft: Story = {
  args: { variant: 'soft', idSeed: 'storybook-soft' },
};

export const SoftOffCenter: Story = {
  args: {
    variant: 'soft',
    focalX: 'right',
    focalY: 'bottom',
    idSeed: 'storybook-soft-off-center',
  },
};

export const Flowing: Story = {
  args: { variant: 'flowing', idSeed: 'storybook-flowing' },
};

export const FlowingWithMotion: Story = {
  args: {
    variant: 'flowing',
    motion: true,
    idSeed: 'storybook-flowing-motion',
  },
};

export const FlowingRaised: Story = {
  args: {
    variant: 'flowing',
    focalY: 'top',
    idSeed: 'storybook-flowing-raised',
  },
};
