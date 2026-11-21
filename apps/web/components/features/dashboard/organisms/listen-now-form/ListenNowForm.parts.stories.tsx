import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { PrimaryDspRow } from './ListenNowForm.parts';

const meta = {
  title: 'Dashboard/Organisms/ListenNowForm/Parts',
  component: PrimaryDspRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl'>
        <Story />
      </div>
    ),
  ],
  args: {
    platformId: 'spotify',
    icon: 'spotify',
    label: 'Spotify',
    value: '',
    placeholder: 'https://open.spotify.com/artist/…',
    onChange: fn(),
    onBlur: fn(),
    onSearch: fn(),
  },
} satisfies Meta<typeof PrimaryDspRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Partial: Story = {
  args: {
    value: 'https://open.spotify.com/artist/story',
    onSearch: undefined,
    connectedInfo: {
      artistName: 'Mina Vale',
      artistImageUrl: null,
      externalUrl: 'https://open.spotify.com/artist/story',
    },
  },
};

export const LongContent: Story = {
  args: {
    value: `https://open.spotify.com/artist/${'a'.repeat(120)}`,
    connectedInfo: {
      artistName: 'Mina Vale and the Extraordinarily Long Named Ensemble',
      artistImageUrl: null,
      externalUrl: null,
    },
  },
};

export const RtlOverflow: Story = {
  decorators: [
    function Rtl(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
