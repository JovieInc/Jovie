import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const readSource = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('chat file attachment chip source guards (JOV-3492)', () => {
  const message = readSource('components/jovie/components/ChatMessage.tsx');
  const chip = readSource('components/jovie/components/FileAttachmentChip.tsx');
  const display = readSource('lib/chat/file-display-name.ts');

  it('renders non-image file parts via FileAttachmentChip', () => {
    expect(message).toContain("from './FileAttachmentChip'");
    expect(message).toContain('<FileAttachmentChip');
    expect(message).toContain("p.type === 'file'");
  });

  it('normalizes filenames and never shows raw blob hosts in the chip label', () => {
    expect(chip).toContain('fileDisplayName');
    expect(chip).toContain("data-testid='file-attachment-chip'");
    expect(display).toContain('blob.vercel-storage.com');
    expect(display).toContain('decodeURIComponent');
    expect(display).toContain('middleEllipsis');
  });
});
