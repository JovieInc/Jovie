import Link from 'next/link';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';
import type { getHelpCenterDestination } from '@/lib/help-center-home.mjs';
import styles from './HelpCenterDestination.module.css';

type Destination = NonNullable<ReturnType<typeof getHelpCenterDestination>>;

type Article = {
  id: string;
  route: string;
  title: string;
  description: string;
  category: string;
};

export function HelpCenterDestination({
  destination,
}: {
  destination: Destination;
}) {
  const { consumers } = loadArticleRegistry();
  const articles = (consumers.navigation as Article[]).filter(
    article =>
      article.category === destination.category &&
      article.route !== '/docs' &&
      article.route !== destination.route
  );

  return (
    <main className={`${styles.root} not-prose`}>
      <Link className={styles.back} href='/docs'>
        Help Center
      </Link>
      <h1>{destination.title}</h1>
      <p className={styles.description}>{destination.description}</p>

      {articles.length > 0 ? (
        <ul className={styles.list}>
          {articles.map(article => (
            <li key={article.id}>
              <Link href={article.route}>{article.title}</Link>
              <p>{article.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <section className={styles.empty} aria-labelledby='guides-on-the-way'>
          <h2 id='guides-on-the-way'>Guides are on the way</h2>
          <p>
            We are reviewing this section before publishing it. Use Help Center
            search to find currently available answers.
          </p>
        </section>
      )}
    </main>
  );
}
