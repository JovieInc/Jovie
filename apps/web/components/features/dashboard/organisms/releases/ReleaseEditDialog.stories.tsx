import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseEditDialog } from './ReleaseEditDialog';

const meta = {
  title: 'Features/Dashboard/Organisms/Releases/ReleaseEditDialog',
  component: ReleaseEditDialog,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'release',
        'providerList',
        'drafts',
        'isSaving',
        'onDraftChange',
        'onSave',
        'onReset',
        'onClose',
      ],
    },
  },
} satisfies Meta<typeof ReleaseEditDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
