import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SourceFactCard } from './SourceFactCard';
import { sourceFixture } from './source-evidence.fixtures';

const meta = {
  title: 'Jovie/SourceFactCard',
  component: SourceFactCard,
  args: { fact: sourceFixture() },
} satisfies Meta<typeof SourceFactCard>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
