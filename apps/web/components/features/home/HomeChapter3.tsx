import { Container } from '@/components/site/Container';
import { HomeCountdownObject } from './HomeCountdownObject';
import { HomeLocationAwareObject } from './HomeLocationAwareObject';
import { HomeRelationshipPanel } from './HomeRelationshipPanel';
import { HOME_CHAPTER_3_CONTENT } from './home-page-content';

function ChapterInsightObject({ id }: Readonly<{ id: string }>) {
  if (id === 'relationship') return <HomeRelationshipPanel />;
  if (id === 'countdown') return <HomeCountdownObject />;
  if (id === 'location') return <HomeLocationAwareObject />;
  return null;
}

export function HomeChapter3() {
  const [insight, mini1, mini2] = HOME_CHAPTER_3_CONTENT.items;

  return (
    <section
      data-testid='homepage-chapter-3'
      className='homepage-chapter'
      aria-labelledby='homepage-ch3-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-chapter-copy'>
            <h2 id='homepage-ch3-heading' className='homepage-chapter-title'>
              {HOME_CHAPTER_3_CONTENT.title}
            </h2>
            <p className='homepage-chapter-body'>
              {HOME_CHAPTER_3_CONTENT.body}
            </p>
          </div>

          <div className='homepage-chapter-insight'>
            <article className='homepage-insight-card homepage-insight-card-lead'>
              <div className='homepage-insight-card-copy'>
                <h3 className='homepage-insight-card-title'>{insight.title}</h3>
                <p className='homepage-insight-card-body'>{insight.body}</p>
              </div>
              <ChapterInsightObject id={insight.id} />
            </article>

            <div className='homepage-insight-minis'>
              <article className='homepage-insight-card homepage-insight-card-mini'>
                <div className='homepage-insight-card-copy'>
                  <h3 className='homepage-insight-card-title'>{mini1.title}</h3>
                  <p className='homepage-insight-card-body'>{mini1.body}</p>
                </div>
                <ChapterInsightObject id={mini1.id} />
              </article>

              <article className='homepage-insight-card homepage-insight-card-mini'>
                <div className='homepage-insight-card-copy'>
                  <h3 className='homepage-insight-card-title'>{mini2.title}</h3>
                  <p className='homepage-insight-card-body'>{mini2.body}</p>
                </div>
                <ChapterInsightObject id={mini2.id} />
              </article>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
