import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist } from '@/types/db';
import { ProfileEditorSection } from './ProfileEditorSection';

const artist = { id: 'artist-1', handle: 'novalane' } as Artist;

const meta = {
  title: 'Dashboard/Organisms/ProfileEditorSection',
  component: ProfileEditorSection,
  parameters: { layout: 'centered' },
  args: {
    artist,
    avatarUrl: null,
    username: 'novalane',
    displayName: 'Nova Lane',
    editingField: null,
    setEditingField: () => undefined,
    displayNameInputRef: { current: null },
    usernameInputRef: { current: null },
    profileDisplayName: 'Nova Lane',
    profileUsername: 'novalane',
    onDisplayNameChange: () => undefined,
    onUsernameChange: () => undefined,
    onAvatarUpload: async () => 'https://example.com/avatar.png',
    onInputKeyDown: () => undefined,
    onInputBlur: () => undefined,
  },
} satisfies Meta<typeof ProfileEditorSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: neither field has a value yet. */
export const Empty: Story = {
  args: {
    username: '',
    displayName: '',
    profileDisplayName: '',
    profileUsername: '',
  },
};

/** Partial: only the display name is set. */
export const Partial: Story = {
  args: { username: '', profileUsername: '' },
};

/** Editing: the display name input is open. */
export const EditingDisplayName: Story = {
  args: { editingField: 'displayName' },
};

/** Long content: values that overflow the card. */
export const LongContent: Story = {
  args: {
    username: 'nova_lane_and_the_extraordinarily_long_handle',
    displayName: 'Nova Lane and the Extraordinarily Long Named Orchestra',
    profileDisplayName:
      'Nova Lane and the Extraordinarily Long Named Orchestra',
    profileUsername: 'nova_lane_and_the_extraordinarily_long_handle',
  },
};

/** Rtl: right-to-left values and layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    username: 'novalane',
    displayName: 'نوفا لين',
    profileDisplayName: 'نوفا لين',
    profileUsername: 'novalane',
  },
};
