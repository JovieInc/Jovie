import type { NamespaceGroup } from '@/lib/wiki/namespace';
import { slugToHref, titleFromSlug } from '@/lib/wiki/format';

interface Props { group: NamespaceGroup }

export function WikiNamespaceSection({ group }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold capitalize text-gray-700 dark:text-gray-300">
        {group.namespace}
      </h2>
      <ul className="space-y-1">
        {group.pages.map(page => (
          <li key={page.slug}>
            <a
              href={slugToHref(page.slug)}
              className="block rounded-md px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-gray-800"
            >
              {page.title || titleFromSlug(page.slug)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
