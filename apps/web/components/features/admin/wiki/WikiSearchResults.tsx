import { slugToHref, titleFromSlug } from '@/lib/wiki/format';

interface Props {
  results: {
    slug: string;
    title: string;
    score?: number;
    chunk_text?: string;
  }[];
  query: string;
}

export function WikiSearchResults({ results, query }: Props) {
  return (
    <div className='mt-6'>
      <p className='mb-4 text-sm text-gray-500 dark:text-gray-400'>
        {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
      </p>
      <ul className='space-y-3'>
        {results.map(r => (
          <li
            key={r.slug}
            className='rounded-lg border border-gray-200 p-3 dark:border-gray-700'
          >
            <a
              href={slugToHref(r.slug)}
              className='font-medium text-blue-600 hover:underline dark:text-blue-400'
            >
              {r.title || titleFromSlug(r.slug)}
            </a>
            {r.chunk_text && (
              <p className='mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2'>
                {r.chunk_text}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
