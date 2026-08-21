import { describe, expect, it } from 'vitest';
import {
  readTaskDescriptionContent,
  writeTaskDescriptionContent,
} from './task-rich-text';

describe('task rich text metadata', () => {
  it('upgrades legacy plain text without losing it', () => {
    expect(readTaskDescriptionContent(null, 'First line')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First line' }],
        },
      ],
    });
  });

  it('merges validated editor content without clobbering task metadata', () => {
    const content = {
      type: 'doc' as const,
      content: [{ type: 'paragraph' }],
    };

    const metadata = writeTaskDescriptionContent(
      { source: 'release' },
      content
    );
    expect(metadata).toEqual({
      source: 'release',
      descriptionRichTextV1: content,
    });
    expect(readTaskDescriptionContent(metadata, 'fallback')).toEqual(content);
  });

  it('falls back safely when stored metadata is malformed', () => {
    expect(
      readTaskDescriptionContent(
        { descriptionRichTextV1: { type: 'video' } },
        'Safe fallback'
      )
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Safe fallback' }],
        },
      ],
    });
  });
});
