import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CapacityBoard } from './CapacityBoard';
import {
  CAPACITY_NOW,
  capacityOrder,
  capacityRegistryUpdatedAt,
  capacityView,
  emptyCapacityView,
  longCapacityView,
} from './capacityBoard.test-fixtures';

/** Rendered states of the capacity board beyond its default stories. */
const meta = {
  title: 'Admin/Capacity/Board/States',
  component: CapacityBoard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function CapacityFrameDecorator(Story) {
      return (
        <div className='min-h-160 bg-base text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    view: capacityView,
    order: capacityOrder,
    selectedId: null,
    basePath: '/app/ov/capacity',
    now: CAPACITY_NOW,
    registryUpdatedAt: capacityRegistryUpdatedAt,
    liveOverlay: 'none',
  },
} satisfies Meta<typeof CapacityBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a registry with no providers, alerts or delegation order yet. */
export const EmptyRegistry: Story = {
  args: { view: emptyCapacityView, order: [] },
};

/** Error: the credits alarm raised while a provider runs under pace. */
export const ErrorCreditsAlarm: Story = {
  args: { selectedId: 'hyperagent' },
};

/** Long content: long provider label and account aliases wrap in place. */
export const LongContentAliases: Story = {
  args: { view: longCapacityView, selectedId: 'openai-codex' },
};

/** Right-to-left: the board inside an RTL document. */
export const RtlDocument: Story = {
  args: { selectedId: 'openai-codex' },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
