'use client';

import { ExternalLink } from 'lucide-react';
import {
  fileDisplayName,
  fileKindFromMediaType,
  type TranscriptFileKind,
} from '@/lib/chat/file-display-name';
import { cn } from '@/lib/utils';
import { fileKindIcon } from './file-kind-icons';

interface FileAttachmentChipProps {
  readonly url: string;
  readonly name?: string;
  readonly mediaType?: string;
  readonly tone?: 'onLight' | 'onDark';
}

function toComposerKind(
  kind: TranscriptFileKind
): 'image' | 'audio' | 'video' | 'archive' | 'document' | 'other' {
  return kind;
}

/**
 * Compact rich chip for non-image file attachments in the chat transcript.
 * Mirrors ImageAttachmentChip / EntityChip height and System B chrome so the
 * attachment strip reads as one coherent row (JOV-3492).
 */
export function FileAttachmentChip({
  url,
  name,
  mediaType,
  tone = 'onLight',
}: FileAttachmentChipProps) {
  const label = fileDisplayName(url, name);
  const kind = fileKindFromMediaType(mediaType, name ?? label);

  const chipClass = cn(
    'system-b-image-attachment-chip',
    tone === 'onLight'
      ? 'system-b-image-attachment-chip-light'
      : 'system-b-image-attachment-chip-dark'
  );

  return (
    <a
      href={url}
      target='_blank'
      rel='noreferrer'
      className='system-b-image-attachment-trigger'
      data-testid='file-attachment-chip-trigger'
      aria-label={`File attachment: ${label}`}
    >
      <span className={chipClass} data-testid='file-attachment-chip'>
        <span
          className='system-b-file-attachment-icon'
          aria-hidden
          data-kind={kind}
        >
          {fileKindIcon(toComposerKind(kind), 'h-3.5 w-3.5')}
        </span>
        <span className='system-b-image-attachment-label'>{label}</span>
        <ExternalLink className='h-3 w-3 shrink-0 opacity-60' aria-hidden />
      </span>
    </a>
  );
}
