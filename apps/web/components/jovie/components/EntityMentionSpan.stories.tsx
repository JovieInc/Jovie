import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { EntityMentionSpan } from './EntityMentionSpan';

const meta = {
  title: 'Jovie/EntityMentionSpan',
  component: EntityMentionSpan,
  args: { kind: 'artist', label: '9.9K followers' },
} satisfies Meta<typeof EntityMentionSpan>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
