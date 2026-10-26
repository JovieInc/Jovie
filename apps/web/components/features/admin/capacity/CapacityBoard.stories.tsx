import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ops from '../../../../../../ops/registry/capacity.json';
import spend from '../../../../../../ops/registry/spend.json';
import models from '../../../../../../scripts/backlog-orchestrator/config/model-registry.json';
import {
  evaluateRegistry,
  routingOrder,
} from '../../../../../../scripts/lib/capacity-registry.mjs';
import { CapacityBoard } from './CapacityBoard';

const NOW = Date.parse('2026-10-25T02:00:00Z');
const view = evaluateRegistry(ops, { now: NOW, spend, models });

const meta = {
  title: 'Admin/Capacity/Board',
  component: CapacityBoard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-160 bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    view,
    order: routingOrder(view),
    selectedId: null,
    basePath: '/app/ov/capacity',
    now: NOW,
    registryUpdatedAt: ops.updatedAt,
    liveOverlay: 'none',
  },
} satisfies Meta<typeof CapacityBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const CodexSelected: Story = { args: { selectedId: 'openai-codex' } };
export const HyperagentSelected: Story = { args: { selectedId: 'hyperagent' } };
