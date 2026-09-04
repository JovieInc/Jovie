import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VoicePageContent } from './VoicePageContent';

const meta = {
  title: 'Marketing/Routes/Voice',
  component: VoicePageContent,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1024] },
    pen: {
      registryId: 'web-041-voice',
      route: '/voice',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      proofScope: 'exact-production-body',
    },
    docs: {
      description: {
        component:
          'Exact production presentation for /voice. Route metadata, noindex policy, and revalidation remain route-owned.',
      },
    },
  },
} satisfies Meta<typeof VoicePageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Web041Voice: Story = {};
