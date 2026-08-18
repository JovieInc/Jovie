import { z } from 'zod';

const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
]);
const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
]);
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MAX_DOCUMENT_JSON_BYTES = 250_000;
const MAX_DOCUMENT_NODES = 5_000;
const MAX_DOCUMENT_DEPTH = 24;

export type RichTextDocument = {
  readonly type: 'doc';
  readonly content?: Record<string, unknown>[];
};

export const emptyRichTextDocument: RichTextDocument = {
  type: 'doc',
  content: [],
};

export const richTextDocumentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(document)).byteLength >
      MAX_DOCUMENT_JSON_BYTES
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Document content is too large',
      });
      return;
    }

    let nodeCount = 0;
    const visit = (value: unknown, depth: number): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        context.addIssue({ code: 'custom', message: 'Invalid document node' });
        return;
      }
      if (depth > MAX_DOCUMENT_DEPTH || ++nodeCount > MAX_DOCUMENT_NODES) {
        context.addIssue({
          code: 'custom',
          message: 'Document structure is too complex',
        });
        return;
      }
      const node = value as Record<string, unknown>;
      if (typeof node.type !== 'string' || !ALLOWED_NODE_TYPES.has(node.type)) {
        context.addIssue({
          code: 'custom',
          message: 'Unsupported document node',
        });
        return;
      }
      if (node.type === 'text' && typeof node.text !== 'string') {
        context.addIssue({
          code: 'custom',
          message: 'Text nodes require text',
        });
      }
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid document marks',
          });
        } else {
          for (const mark of node.marks) {
            const type =
              mark && typeof mark === 'object'
                ? (mark as Record<string, unknown>).type
                : null;
            if (typeof type !== 'string' || !ALLOWED_MARK_TYPES.has(type)) {
              context.addIssue({
                code: 'custom',
                message: 'Unsupported document mark',
              });
              continue;
            }
            if (type === 'link') {
              const attrs = (mark as Record<string, unknown>).attrs;
              const href =
                attrs && typeof attrs === 'object'
                  ? (attrs as Record<string, unknown>).href
                  : null;
              try {
                if (
                  typeof href !== 'string' ||
                  !SAFE_LINK_PROTOCOLS.has(new URL(href).protocol)
                ) {
                  throw new Error('Unsafe protocol');
                }
              } catch {
                context.addIssue({
                  code: 'custom',
                  message: 'Unsupported link target',
                });
              }
            }
          }
        }
      }
      if (node.content !== undefined) {
        if (!Array.isArray(node.content)) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid nested document content',
          });
        } else {
          for (const child of node.content) visit(child, depth + 1);
        }
      }
    };

    for (const node of document.content ?? []) visit(node, 1);
  });

export function plainTextToRichTextDocument(value: string): RichTextDocument {
  const paragraphs = value.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map(paragraph => ({
      type: 'paragraph',
      ...(paragraph.length > 0
        ? { content: [{ type: 'text', text: paragraph }] }
        : {}),
    })),
  };
}
