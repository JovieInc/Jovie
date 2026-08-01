import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CmdKPalette } from './CmdKPalette';

const meta = {
  title: 'Organisms/CmdKPalette',
  component: CmdKPalette,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'additionalSectionsAfter',
        'onAdditionalSelect',
        'onHeaderChange',
      ],
    },
  },
  args: {
    profileId: 'storybook-profile',
    open: true,
    onOpenChange: () => undefined,
    presentation: 'dialog',
  },
} satisfies Meta<typeof CmdKPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullPageSearch: Story = {};
