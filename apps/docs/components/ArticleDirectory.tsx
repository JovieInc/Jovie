import Link from 'next/link';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

type DirectoryArticle = {
  id: string;
  route: string;
  title: string;
  description: string;
};

export function ArticleDirectory({
  currentArticleId,
}: {
  currentArticleId?: string;
}) {
  const { consumers } = loadArticleRegistry();
  const articles = (consumers.navigation as DirectoryArticle[]).filter(
    article => article.id !== currentArticleId
  );

  return (
    <ul>
      {articles.map(article => (
        <li key={article.id}>
          <Link href={article.route}>{article.title}</Link> —{' '}
          {article.description}
        </li>
      ))}
    </ul>
  );
}
