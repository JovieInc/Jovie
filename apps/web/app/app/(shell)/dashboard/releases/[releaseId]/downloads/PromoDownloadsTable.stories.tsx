import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  type PromoDownloadFile,
  PromoDownloadsTable,
} from './PromoDownloadsTable';

const initialFiles: PromoDownloadFile[] = [
  {
    id: 'download-1',
    title: 'Radio Edit',
    fileName: 'radio-edit.mp3',
    fileMimeType: 'audio/mpeg',
    fileSizeBytes: 2_048_000,
    isActive: true,
    position: 1,
  },
  {
    id: 'download-2',
    title: 'Instrumental',
    fileName: 'instrumental.wav',
    fileMimeType: 'audio/wav',
    fileSizeBytes: null,
    isActive: false,
    position: 2,
  },
];

function InteractivePromoDownloadsTable() {
  const [files, setFiles] = useState(initialFiles);

  return (
    <PromoDownloadsTable
      files={files}
      loaded
      onToggleActive={(fileId, isActive) => {
        setFiles(current =>
          current.map(file =>
            file.id === fileId ? { ...file, isActive } : file
          )
        );
      }}
      onDelete={fileId => {
        setFiles(current => current.filter(file => file.id !== fileId));
      }}
    />
  );
}

const meta = {
  title: 'Features/Releases/PromoDownloadsTable',
  component: PromoDownloadsTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    files: initialFiles,
    loaded: true,
    onToggleActive: () => undefined,
    onDelete: () => undefined,
  },
} satisfies Meta<typeof PromoDownloadsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  render: () => <InteractivePromoDownloadsTable />,
};

export const Empty: Story = {
  args: { files: [] },
};

export const Loading: Story = {
  args: { files: [], loaded: false },
};
