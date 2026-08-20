import {
  plainTextToRichTextDocument,
  type RichTextDocument,
  richTextDocumentSchema,
} from '@/lib/rich-text/document';

const TASK_DESCRIPTION_RICH_TEXT_KEY = 'descriptionRichTextV1';

export function readTaskDescriptionContent(
  metadata: Record<string, unknown> | null | undefined,
  fallbackPlainText: string | null | undefined
): RichTextDocument {
  const parsed = richTextDocumentSchema.safeParse(
    metadata?.[TASK_DESCRIPTION_RICH_TEXT_KEY]
  );
  return parsed.success
    ? parsed.data
    : plainTextToRichTextDocument(fallbackPlainText ?? '');
}

export function writeTaskDescriptionContent(
  metadata: Record<string, unknown> | null | undefined,
  content: RichTextDocument
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [TASK_DESCRIPTION_RICH_TEXT_KEY]: richTextDocumentSchema.parse(content),
  };
}
