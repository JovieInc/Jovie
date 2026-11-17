import { slugToHref, titleFromSlug } from '@/lib/wiki/format';

interface Props {
  readonly results: {
    slug: string;
    title: string;
    score?: number;
    chunk_text?: string;
  }[];
  readonly query: string;
}

export function WikiSearchResults({ results, query }: Props) {
  return (
    <div className='mt-6'>
      <p className='mb-4 text-sm text-tertiary-token'>
        {results.length} result{results.length !== 1 ? 's' : ''} for &quot;
        {query}&quot;
      </p>
      <ul className='space-y-3'>
        {results.map(r => (
          <li key={r.slug} className='rounded-lg border border-subtle p-3'>
            <a
              href={slugToHref(r.slug)}
              className='font-medium text-accent-text hover:underline'
            >
              {r.title || titleFromSlug(r.slug)}
            </a>
            {r.chunk_text && (
              <p className='mt-1 text-sm text-secondary-token line-clamp-2'>
                {r.chunk_text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
