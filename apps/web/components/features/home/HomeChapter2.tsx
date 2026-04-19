import { Container } from '@/components/site/Container';
import { HomeProfileShowcase } from './HomeProfileShowcase';
import { HOME_CHAPTER_2_CONTENT } from './home-page-content';

export function HomeChapter2() {
  return (
    <section
      data-testid='homepage-chapter-2'
      className='homepage-chapter'
      aria-labelledby='homepage-ch2-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-chapter-layout'>
            <div className='homepage-chapter-copy'>
              <h2 id='homepage-ch2-heading' className='homepage-chapter-title'>
                {HOME_CHAPTER_2_CONTENT.title}
              </h2>
              <p className='homepage-chapter-body'>
                {HOME_CHAPTER_2_CONTENT.body}
              </p>
            </div>

            <div className='homepage-chapter-visual'>
              <article className='homepage-ch2-bento'>
                <div className='homepage-ch2-bento-drawer'>
                  <HomeProfileShowcase
                    stateId={HOME_CHAPTER_2_CONTENT.payStateId}
                    presentation='drawer-crop'
                    cropAnchor='bottom'
                  />
                </div>
                <p className='homepage-ch2-bento-label'>That&apos;s it.</p>
              </article>
            </div>
          </div>

          <p className='homepage-chapter-flow-line'>
            {HOME_CHAPTER_2_CONTENT.flowLine}
          </p>
        </div>
      </Container>
    </section>
  );
}
