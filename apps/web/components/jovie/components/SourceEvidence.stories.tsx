import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMarkdown } from './ChatMarkdown';
import { SourceEvidenceProvider } from './SourceEvidence';
import { sourceFixture } from './source-evidence.fixtures';

const meta = {
  title: 'Jovie/SourceEvidence',
  component: SourceEvidenceProvider,
  args: {
    facts: [sourceFixture()],
    children: <ChatMarkdown content='9.9K followers' />,
  },
} satisfies Meta<typeof SourceEvidenceProvider>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
