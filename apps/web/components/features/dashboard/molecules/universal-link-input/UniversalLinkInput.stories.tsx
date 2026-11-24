import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UniversalLinkInput } from './UniversalLinkInput';

const meta = {
  title: 'Dashboard/Molecules/UniversalLinkInput/UniversalLinkInput',
  component: UniversalLinkInput,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-96'>
      <UniversalLinkInput {...args} />
    </div>
  ),
  args: {
    onAdd: () => {},
  },
} satisfies Meta<typeof UniversalLinkInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPlaceholder: Story = {
  args: {
    placeholder: 'Paste a link or search for an artist...',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const Prefilled: Story = {
  args: {
    prefillUrl: 'https://open.spotify.com/artist/sashawaves',
    onPrefillConsumed: () => {},
  },
};

export const ChatDisabled: Story = {
  args: {
    chatEnabled: false,
  },
};

export const Empty: Story = {
  args: { placeholder: 'Paste any link or ask Jovie anything...' },
};

export const LongContent: Story = {
  args: {
    prefillUrl: `https://example.com/${'a-very-long-path-segment/'.repeat(10)}`,
    onPrefillConsumed: () => {},
  },
};

export const Offline: Story = {
  args: { disabled: true, prefillUrl: 'https://example.com' },
};

export const RtlOverflow: Story = {
  decorators: [
    function Rtl(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: { prefillUrl: 'https://example.com/رابط-طويل-جدا-جدا-جدا' },
};
