import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DspAvatarItem } from './DspAvatarStack';
import { DspAvatarStack } from './DspAvatarStack';

const live: DspAvatarItem = {
  id: 'spotify',
  status: 'live',
  label: 'Spotify',
  glyph: 'S',
  color: '#1DB954',
};

const pending: DspAvatarItem = {
  id: 'apple',
  status: 'pending',
  label: 'Apple Music',
  glyph: 'A',
  color: '#FA243C',
};

const failed: DspAvatarItem = {
  id: 'youtube',
  status: 'error',
  label: 'YouTube Music',
  glyph: 'Y',
  color: '#FF0000',
};

const missing: DspAvatarItem = {
  id: 'tidal',
  status: 'missing',
  label: 'Tidal',
  glyph: 'T',
  color: '#444444',
};

function PageDecorator({ children }: { readonly children: React.ReactNode }) {
  return <div className='bg-base p-8'>{children}</div>;
}

const meta = {
  title: 'Shell/DspAvatarStack/States',
  component: DspAvatarStack,
  parameters: { layout: 'centered' },
  decorators: [
    function WithPage(StoryComponent) {
      return (
        <PageDecorator>
          <StoryComponent />
        </PageDecorator>
      );
    },
  ],
  args: { dsps: [live] },
} satisfies Meta<typeof DspAvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    dsps: [pending, { ...pending, id: 'amazon', label: 'Amazon Music' }],
  },
};

export const Error: Story = {
  args: { dsps: [failed, live] },
};

export const Partial: Story = {
  args: { dsps: [live, pending, failed, missing], maxVisible: 2 },
};

export const LongContent: Story = {
  args: {
    dsps: [
      {
        ...live,
        label:
          'A Distribution Partner With An Exceptionally Long Display Name That Wraps',
      },
      missing,
    ],
  },
};

export const Rtl: Story = {
  args: {
    dsps: [{ ...live, label: 'سبوتيفاي', glyph: 'س' }, missing],
  },
  decorators: [
    function WithRtl(StoryComponent) {
      return (
        <div dir='rtl'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
