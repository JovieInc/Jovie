import { generateText } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextDocument } from './document';

export function createRichTextStarterKit() {
  return StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    underline: false,
    link: {
      autolink: true,
      openOnClick: false,
      protocols: ['http', 'https', 'mailto'],
    },
  });
}

export function richTextDocumentToPlainText(
  document: RichTextDocument
): string {
  return generateText(document, [createRichTextStarterKit()]);
}
