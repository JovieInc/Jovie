import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';

const spotify = detectPlatform('https://open.spotify.com/artist/abc');
const instagram = detectPlatform('https://instagram.com/lunapark');

const meta = {
  title: 'Features/Dashboard/Molecules/MultiLinkPasteDialog',
  component: MultiLinkPasteDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    onClose: fn(),
    onConfirm: fn(),
    onToggleSelection: fn(),
    extractedLinks: [
      { detectedLink: spotify, isDuplicate: false, isSelected: true },
      { detectedLink: instagram, isDuplicate: false, isSelected: false },
    ],
    selectableCount: 1,
  },
} satisfies Meta<typeof MultiLinkPasteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { extractedLinks: [], selectableCount: 0 },
};

/** Partial: one pasted link is already on the profile and cannot be selected. */
export const Partial: Story = {
  args: {
    extractedLinks: [
      { detectedLink: spotify, isDuplicate: true, isSelected: false },
      { detectedLink: instagram, isDuplicate: false, isSelected: true },
    ],
    selectableCount: 1,
  },
};

export const LongContent: Story = {
  args: {
    extractedLinks: [
      {
        detectedLink: {
          ...spotify,
          normalizedUrl: `https://open.spotify.com/artist/${'a'.repeat(160)}`,
        },
        isDuplicate: false,
        isSelected: true,
      },
    ],
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
