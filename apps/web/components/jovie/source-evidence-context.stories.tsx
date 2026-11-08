import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMarkdown } from './components/ChatMarkdown';
import { sourceFixture } from './components/source-evidence.fixtures';
import { SourceEvidenceProvider } from './source-evidence-context';

const meta = {
  title: 'Jovie/SourceEvidenceContext',
  component: SourceEvidenceProvider,
  args: {
    facts: [sourceFixture()],
    children: <ChatMarkdown content='9.9K followers' />,
  },
} satisfies Meta<typeof SourceEvidenceProvider>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
