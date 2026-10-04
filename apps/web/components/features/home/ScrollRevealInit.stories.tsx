import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ScrollRevealInit } from './ScrollRevealInit';

const meta = {
  title: 'Marketing/Motion/ScrollRevealInit',
  component: ScrollRevealInit,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
        <section className='grid h-screen place-items-center'>
          <h2 className='text-4xl font-semibold'>Scroll to reveal</h2>
        </section>
        <section className='grid h-[60vh] place-items-center'>
          <p className='reveal-on-scroll text-3xl font-semibold'>
            First revealed block
          </p>
        </section>
        <section className='grid h-[60vh] place-items-center'>
          <p
            className='reveal-on-scroll text-3xl font-semibold'
            data-delay='160'
          >
            Delayed revealed block
          </p>
        </section>
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollRevealInit>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
