import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { LegalMarkdownReader } from '@/components/molecules/LegalMarkdownReader';

interface Props {
  readonly page: { readonly slug: string; readonly title: string; readonly compiled_truth?: string };
}

export async function WikiPageArticle({ page }: Props) {
  const document = page.compiled_truth
    ? await createMarkdownDocument(page.compiled_truth)
    : null;

  return (
    <article>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{page.title}</h1>
      {document ? (
        <LegalMarkdownReader html={document.html} />
      ) : (
        <p className="text-gray-500 dark:text-gray-400">This wiki page has no content.</p>
      )}
    </article>
  );
}
