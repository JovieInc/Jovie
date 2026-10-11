import { LegalMarkdownReader } from '@/components/molecules/LegalMarkdownReader';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';

interface Props {
  readonly page: {
    readonly slug: string;
    readonly title: string;
    readonly compiled_truth?: string;
  };
}

export async function WikiPageArticle({ page }: Props) {
  const document = page.compiled_truth
    ? await createMarkdownDocument(page.compiled_truth)
    : null;

  return (
    <article>
      {document ? (
        <LegalMarkdownReader html={document.html} />
      ) : (
        <p className='text-secondary-token'>This wiki page has no content.</p>
      )}
    </article>
  );
}
