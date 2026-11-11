import { render } from '@testing-library/react';
import {
  FileArchive,
  FileAudio2,
  FileImage,
  FileText,
  FileVideo,
  type LucideIcon,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { FileKind } from '../hooks/useChatFileAttachments';
import { fileKindIcon } from './file-kind-icons';

const EXPECTED: ReadonlyArray<readonly [FileKind, LucideIcon]> = [
  ['audio', FileAudio2],
  ['video', FileVideo],
  ['image', FileImage],
  ['archive', FileArchive],
  ['document', FileText],
  ['other', FileText],
];

describe('fileKindIcon', () => {
  it.each(EXPECTED)('draws the %s glyph', (kind, Icon) => {
    expect(renderToStaticMarkup(fileKindIcon(kind))).toBe(
      renderToStaticMarkup(<Icon className='h-3.5 w-3.5' />)
    );
  });

  it('falls back to the document glyph for an unknown kind', () => {
    expect(renderToStaticMarkup(fileKindIcon('unknown-kind' as FileKind))).toBe(
      renderToStaticMarkup(<FileText className='h-3.5 w-3.5' />)
    );
  });

  it('applies the caller size instead of the default', () => {
    const { container } = render(fileKindIcon('image', 'h-5 w-5'));
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-5', 'w-5');
    expect(svg).not.toHaveClass('h-3.5');
  });

  it('is axe-clean beside the label that names each kind', async () => {
    const { container } = render(
      <ul>
        {EXPECTED.map(([kind]) => (
          <li key={kind}>
            {fileKindIcon(kind)}
            <span>{kind}</span>
          </li>
        ))}
      </ul>
    );
    expect(container.querySelectorAll('svg')).toHaveLength(EXPECTED.length);
    for (const svg of container.querySelectorAll('svg'))
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });
});
