import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider, useRightPanel } from '@/contexts/RightPanelContext';
import { CreatorDocumentsWorkspace } from './CreatorDocumentsWorkspace';
import { document } from './creator-document-test-fixture';

function RegisteredEditor() {
  return useRightPanel();
}

const older = { ...document, id: '20000000-0000-4000-8000-000000000001', title: 'Earlier private caption' };
const recent = Array.from({ length: 50 }, (_, index) => ({
  ...document,
  id: `recent-${index}`,
  title: `Recent draft ${index + 1}`,
}));

const meta = {
  title: 'App/Library/Private document reopen',
  component: CreatorDocumentsWorkspace,
  parameters: { layout: 'fullscreen' },
  args: {
    creatorProfileId: 'example-owner',
    initialDocuments: [...recent, older],
    initialDocumentId: older.id,
    initialNextCursor: 'example-next-page',
  },
  render: args => (
    <RightPanelProvider>
      <div className='flex h-screen'>
        <CreatorDocumentsWorkspace {...args} />
        <RegisteredEditor />
      </div>
    </RightPanelProvider>
  ),
} satisfies Meta<typeof CreatorDocumentsWorkspace>;

export default meta;
export const OlderDraft: StoryObj<typeof meta> = {};
