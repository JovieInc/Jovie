import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import PayPromo from './PayPromo';

/** Rendered states of the pay promo. It takes no props, so only direction varies. */
const meta = {
  title: 'Organisms/PayPromo/States',
  component: PayPromo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PayPromo>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div dir='rtl'>{children}</div>;
}

function withRtlFrame(StoryFn: () => ReactNode) {
  return <RtlFrame>{StoryFn()}</RtlFrame>;
}

/** Rtl: the centered promo mirrored in a right-to-left page. */
export const RtlPromo: Story = {
  decorators: [withRtlFrame],
};
