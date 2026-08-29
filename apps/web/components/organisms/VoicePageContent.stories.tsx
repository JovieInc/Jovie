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
      sourceSha: '8b0353fcbeb0cffef614fa47afbbbd8eeae48997',
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
