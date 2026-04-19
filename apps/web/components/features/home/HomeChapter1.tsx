import { Container } from '@/components/site/Container';
import { HomeSandboxCard } from './HomeSandboxCard';
import { HOME_CHAPTER_1_CONTENT } from './home-page-content';

export function HomeChapter1() {
  const [callout1, callout2] = HOME_CHAPTER_1_CONTENT.callouts;

  return (
    <section
      data-testid='homepage-chapter-1'
      className='homepage-chapter'
      aria-labelledby='homepage-ch1-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-chapter-layout'>
            <div className='homepage-chapter-copy'>
              <h2 id='homepage-ch1-heading' className='homepage-chapter-title'>
                {HOME_CHAPTER_1_CONTENT.title}
              </h2>
              <p className='homepage-chapter-body'>
                {HOME_CHAPTER_1_CONTENT.body}
              </p>

              <div className='homepage-chapter-callouts'>
                <div className='homepage-chapter-callout'>
                  <span className='homepage-chapter-callout-label'>
                    {callout1.label}
                  </span>
                  <p className='homepage-chapter-callout-body'>
                    {callout1.body}
                  </p>
                </div>
                <div className='homepage-chapter-callout'>
                  <span className='homepage-chapter-callout-label'>
                    {callout2.label}
                  </span>
                  <p className='homepage-chapter-callout-body'>
                    {callout2.body}
                  </p>
                </div>
              </div>
            </div>

            <div className='homepage-chapter-visual'>
              <HomeSandboxCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
