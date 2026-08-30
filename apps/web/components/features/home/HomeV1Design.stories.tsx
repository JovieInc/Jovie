import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeV1Design } from './HomeV1Design';

const meta = {
  title: 'Marketing/Sections/HomeV1Design',
  component: HomeV1Design,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Source-backed story for the legacy homepage design. It renders the component directly; the live homepage route remains controlled by the static SHOW_HOME_V1_DESIGN flag.',
      },
    },
  },
} satisfies Meta<typeof HomeV1Design>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
