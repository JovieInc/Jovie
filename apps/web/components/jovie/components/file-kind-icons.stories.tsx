import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FileKind } from '../hooks/useChatFileAttachments';
import { fileKindIcon } from './file-kind-icons';

const KINDS: FileKind[] = ['audio', 'video', 'image', 'archive', 'document'];

function FileKindIconsDemo() {
  return (
    <div className='flex items-center gap-4 text-secondary-token'>
      {KINDS.map(kind => (
        <div key={kind} className='flex flex-col items-center gap-1'>
          {fileKindIcon(kind, 'h-5 w-5')}
          <span className='text-2xs'>{kind}</span>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Jovie/FileKindIcons',
  component: FileKindIconsDemo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FileKindIconsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllKinds: Story = {};
