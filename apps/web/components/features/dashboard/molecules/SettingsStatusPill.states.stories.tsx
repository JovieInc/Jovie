import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsStatusPill } from './SettingsStatusPill';

/**
 * State coverage for the settings save status pill. Each state changes only
 * the save state or status record, or the document direction.
 */
const meta: Meta<typeof SettingsStatusPill> = {
  title: 'Dashboard/Molecules/SettingsStatusPill States',
  component: SettingsStatusPill,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsStatusPill>;

/** Error: a failed save with no message falls back to Save failed. */
export const ErrorSaveFailed: Story = {
  args: { state: 'error' },
};

/** Error with the server's message from the save status. */
export const ErrorServerMessage: Story = {
  args: {
    status: { saving: false, success: null, error: 'Handle is already taken' },
  },
};

/** Long content: a long save error wraps under the field. */
export const LongContentError: Story = {
  args: {
    status: {
      saving: false,
      success: null,
      error:
        'We could not save your notification preferences because the connection dropped before the server confirmed the change. Try again.',
    },
  },
  render: args => (
    <div className='w-72'>
      <SettingsStatusPill {...args} />
    </div>
  ),
};

/** Right-to-left: the pill under RTL settings copy. */
export const RtlDocument: Story = {
  args: {
    status: { saving: false, success: null, error: 'تعذر الحفظ' },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
