import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RailToggleButton } from './RailToggleButton';

const meta = {
  title: 'Atoms/RailToggleButton',
  component: RailToggleButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    side: 'left',
    open: true,
    openLabel: 'Collapse sidebar',
    closedLabel: 'Expand sidebar',
    onToggle: () => undefined,
  },
} satisfies Meta<typeof RailToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LeftOpen: Story = {};

export const LeftClosed: Story = {
  args: {
    open: false,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const RightOpen: Story = {
  args: {
    side: 'right',
    openLabel: 'Collapse details',
    closedLabel: 'Expand details',
  },
};

export const RightClosed: Story = {
  args: {
    side: 'right',
    open: false,
    openLabel: 'Collapse details',
    closedLabel: 'Expand details',
  },
};

export const ManualRightClosed: Story = {
  args: {
    ...RightClosed.args,
    previewTrigger: false,
  },
};

const LONG_ARTIST_NAME =
  'Florence Okonkwo-Vasquez and the Northern Lights Philharmonic Collective';

/**
 * Long content: the artist profile toggle names the selected artist, so a
 * long display name lands in the visible tooltip and must wrap inside it.
 */
export const LongContentArtistName: Story = {
  args: {
    side: 'right',
    open: false,
    openLabel: `Hide ${LONG_ARTIST_NAME} profile`,
    closedLabel: `Show ${LONG_ARTIST_NAME} profile`,
    shortcut: ']',
  },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: `Show ${LONG_ARTIST_NAME} profile`,
    });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(
      await within(document.body).findByRole('tooltip')
    ).toHaveTextContent(LONG_ARTIST_NAME);
  },
};

/** Right-to-left: an Arabic artist name in the label and tooltip. */
export const RtlArabicArtistName: Story = {
  args: {
    side: 'right',
    open: false,
    openLabel: 'إخفاء ملف عمرو دياب الشخصي',
    closedLabel: 'إظهار ملف عمرو دياب الشخصي',
    shortcut: ']',
  },
  render: args => (
    <div dir='rtl'>
      <RailToggleButton {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'إظهار ملف عمرو دياب الشخصي',
    });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await expect(
      await within(document.body).findByRole('tooltip')
    ).toHaveTextContent('عمرو دياب');
  },
};
