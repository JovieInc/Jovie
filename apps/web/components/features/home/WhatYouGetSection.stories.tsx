import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WhatYouGetSection } from './WhatYouGetSection';

const meta = {
  title: 'Marketing/Sections/WhatYouGetSection',
  component: WhatYouGetSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WhatYouGetSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
