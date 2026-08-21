import { generateJSON } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { richTextDocumentSchema } from './document';
import { createRichTextStarterKit } from './extensions';

describe('shared rich-text schema spike', () => {
  it('keeps pasted prose and drops media, scripts, and unsafe links', () => {
    const json = generateJSON(
      '<p>Keep this line</p><img src="https://example.com/cover.png" alt="Cover"><script>document.cookie</script><a href="javascript:alert(1)">Unsafe</a>',
      [createRichTextStarterKit()]
    );

    const parsed = richTextDocumentSchema.parse(json);
    const serialized = JSON.stringify(parsed);

    expect(serialized).toContain('Keep this line');
    expect(serialized).not.toContain('cover.png');
    expect(serialized).not.toContain('document.cookie');
    expect(serialized).not.toContain('javascript:');
  });

  it('fits a reserved mobile editor schema without extra node types', () => {
    const json = generateJSON('<h2>Hook</h2><p>Say the line.</p>', [
      createRichTextStarterKit(),
    ]);
    const parsed = richTextDocumentSchema.parse(json);
    expect(parsed.type).toBe('doc');
    expect(parsed.content?.map(node => node.type)).toEqual([
      'heading',
      'paragraph',
    ]);
  });
});
