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
