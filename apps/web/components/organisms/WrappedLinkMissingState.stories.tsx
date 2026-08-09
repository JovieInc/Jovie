import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WrappedLinkMissingState } from './WrappedLinkMissingState';

const meta = {
  title: 'Public/Routes/WrappedLinkMissingState',
  component: WrappedLinkMissingState,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact missing-link presentation for web-193-out--[id]. This source-backed partial state contains no wrapped-link data or challenge token; lookup, sensitive-link confirmation, redirect, metadata, and challenge generation remain server-route-owned.',
      },
    },
    pen: {
      registryId: 'web-193-out--[id]',
      route: '/out/missing',
      source: 'apps/web/components/organisms/WrappedLinkMissingState.tsx',
      sourceExport: 'WrappedLinkMissingState',
      storyExport: 'Web193MissingLink',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
      fixture: 'missing wrapped link',
      proofTier: 'partial-source',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WrappedLinkMissingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web193MissingLink: Story = {
  name: 'web-193 /out/missing',
};
