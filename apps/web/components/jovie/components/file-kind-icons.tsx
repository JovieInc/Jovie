import {
  FileArchive,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';

import type { FileKind } from '../hooks/useChatFileAttachments';

export function fileKindIcon(kind: FileKind, className?: string) {
  const cls = className ?? 'h-3.5 w-3.5';
  switch (kind) {
    case 'audio':
      return <FileAudio2 className={cls} />;
    case 'video':
      return <FileVideo className={cls} />;
    case 'image':
      return <FileImage className={cls} />;
    case 'archive':
      return <FileArchive className={cls} />;
    case 'document':
      return <FileText className={cls} />;
    default:
      return <FileText className={cls} />;
  }
}
