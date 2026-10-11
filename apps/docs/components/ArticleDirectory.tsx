import Link from 'next/link';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

const CATEGORY_LABELS = {
  'jovie-essentials': 'Jovie essentials',
  'build-your-presence': 'Build your presence',
  'manage-jovie': 'Manage Jovie',
} as const;

type DirectoryArticle = {
  id: string;
  route: string;
  title: string;
  description: string;
  category: keyof typeof CATEGORY_LABELS | 'developers' | 'legacy';
};

export function ArticleDirectory({
  currentArticleId,
}: {
  currentArticleId?: string;
}) {
  const { consumers } = loadArticleRegistry();
  const articles = (consumers.navigation as DirectoryArticle[]).filter(
    article =>
      article.id !== currentArticleId && article.category in CATEGORY_LABELS
  );

  return (
    <>
      {(
        Object.entries(CATEGORY_LABELS) as [
          keyof typeof CATEGORY_LABELS,
          string,
        ][]
      ).map(([category, label]) => {
        const entries = articles.filter(
          article => article.category === category
        );
        if (entries.length === 0) return null;
        return (
          <section key={category} aria-labelledby={`docs-group-${category}`}>
            <h2 id={`docs-group-${category}`}>{label}</h2>
            <ul>
              {entries.map(article => (
                <li key={article.id}>
                  <Link href={article.route}>{article.title}</Link> —{' '}
                  {article.description}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p>
        Integrating with the API? See{' '}
        <Link href='/docs/developers'>Developers</Link>.
      </p>
    </>
  );
}
