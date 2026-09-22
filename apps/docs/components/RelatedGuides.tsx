import Link from 'next/link';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

type RelatedArticle = {
  id: string;
  route: string;
  title: string;
  description: string;
};

export function RelatedGuides({ articleId }: { articleId: string }) {
  const { consumers } = loadArticleRegistry();
  const articles = consumers.related(articleId) as RelatedArticle[];
  if (articles.length === 0) return null;

  return (
    <aside aria-labelledby='related-guides-heading'>
      <h2 id='related-guides-heading'>Related guides</h2>
      <ul>
        {articles.map(article => (
          <li key={article.id}>
            <Link href={article.route}>{article.title}</Link>
            <p>{article.description}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
