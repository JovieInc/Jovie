import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieLogo } from './JovieLogo';

/** Rendered states of the Jovie wordmark link. */
const meta = {
  title: 'Atoms/JovieLogo/States',
  component: JovieLogo,
  parameters: { layout: 'centered' },
  args: {
    href: '/',
    variant: 'light',
    size: 'md',
  },
} satisfies Meta<typeof JovieLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no destination, so the wordmark renders without a link. */
export const PartialWithoutLink: Story = {
  args: { href: '', title: 'Jovie wordmark' },
};

/** Long content: a long artist handle in the profile invitation link. */
export const LongContentArtistHandle: Story = {
  args: {
    artistHandle: 'the-extremely-long-artist-handle-from-a-collective',
    showText: true,
    size: 'sm',
  },
};

/** Right to left: the wordmark and its name inside an Arabic layout. */
export const RtlWordmark: Story = {
  args: { showText: true },
  render: function RtlLogo(args) {
    return (
      <div dir='rtl' lang='ar' className='rounded-lg bg-surface-1 p-6'>
        <JovieLogo {...args} />
      </div>
    );
  },
};
