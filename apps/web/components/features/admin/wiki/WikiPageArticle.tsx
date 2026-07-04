import { createMarkdownDocument } from '@/lib/content/markdown';
import { LegalMarkdownReader } from '@/components/legal/LegalMarkdownReader';

interface Props {
  page: { slug: string; title: string; compiled_truth?: string };
}

export function WikiPageArticle({ page }: Props) {
  const document = page.compiled_truth
    ? createMarkdownDocument(page.compiled_truth)
    : null;

  return (
    <article>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{page.title}</h1>
      {document ? (
        <LegalMarkdownReader document={document} />
      ) : (
        <p className="text-gray-500 dark:text-gray-400">This wiki page has no content.</p>
      )}
    </article>
  );
}
