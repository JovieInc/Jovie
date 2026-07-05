import {
  FileArchive,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';

import type { FileKind } from '../hooks/useChatFileAttachments';

export function fileKindIcon(
  kind: FileKind,
  className: string = 'h-3.5 w-3.5'
) {
  switch (kind) {
    case 'audio':
      return <FileAudio2 className={className} />;
    case 'video':
      return <FileVideo className={className} />;
    case 'image':
      return <FileImage className={className} />;
    case 'archive':
      return <FileArchive className={className} />;
    case 'document':
      return <FileText className={className} />;
    default:
      return <FileText className={className} />;
  }
}
