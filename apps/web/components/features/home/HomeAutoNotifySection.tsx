import { Container } from '@/components/site/Container';
import { HomeNotificationCard } from './HomeNotificationCard';
import { HOME_AUTO_NOTIFY_CONTENT } from './home-page-content';

export function HomeAutoNotifySection() {
  return (
    <section
      data-testid='homepage-auto-notify'
      className='homepage-chapter'
      aria-labelledby='auto-notify-heading'
    >
      <Container size='homepage'>
        <div className='mx-auto max-w-[1200px]'>
          <div className='homepage-auto-notify-layout'>
            <div className='homepage-chapter-copy'>
              <h2 id='auto-notify-heading' className='homepage-chapter-title'>
                {HOME_AUTO_NOTIFY_CONTENT.title}
              </h2>
              <p className='homepage-chapter-body'>
                {HOME_AUTO_NOTIFY_CONTENT.body}
              </p>
            </div>

            <div className='homepage-auto-notify-visual'>
              <HomeNotificationCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
