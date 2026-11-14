import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ScrollRevealInit } from './ScrollRevealInit';

const meta = {
  title: 'Marketing/Motion/ScrollRevealInit',
  component: ScrollRevealInit,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ScrollRevealInit>;

export default meta;
type Story = StoryObj<typeof meta>;

function ScrollFrame({
  children,
  withTargets,
}: Readonly<{ children: ReactNode; withTargets: boolean }>) {
  return (
    <div className='bg-base text-primary-token'>
      {children}
      <section className='grid h-screen place-items-center'>
        <h2 className='text-4xl font-semibold'>Scroll to reveal</h2>
      </section>
      {withTargets ? (
        <>
          <section className='grid h-screen place-items-center'>
            <p className='reveal-on-scroll text-3xl font-semibold'>
              First revealed block
            </p>
          </section>
          <section className='grid h-screen place-items-center'>
            <p
              className='reveal-on-scroll text-3xl font-semibold'
              data-delay='160'
            >
              Delayed revealed block
            </p>
          </section>
        </>
      ) : (
        <section className='grid h-screen place-items-center'>
          <p className='text-3xl font-semibold'>Always visible block</p>
        </section>
      )}
    </div>
  );
}

export const Default: Story = {
  decorators: [
    Story => (
      <ScrollFrame withTargets>
        <Story />
      </ScrollFrame>
    ),
  ],
};

/**
 * Empty: a page with no `.reveal-on-scroll` targets. The fallback registers
 * no observer and every block stays visible.
 */
export const EmptyNoRevealTargets: Story = {
  decorators: [
    Story => (
      <ScrollFrame withTargets={false}>
        <Story />
      </ScrollFrame>
    ),
  ],
};
