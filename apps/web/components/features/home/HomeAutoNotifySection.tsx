import { Container } from '@/components/site/Container';
import { HOME_AUTO_NOTIFY_CONTENT } from './home-page-content';

function LockScreenNotification() {
  const { notificationFrom, notificationBody } = HOME_AUTO_NOTIFY_CONTENT;

  return (
    <div className='homepage-ios-notification'>
      <div className='homepage-ios-notification-header'>
        {/* Jovie icon — small rounded square */}
        <div className='homepage-ios-notification-icon'>
          <svg
            width='16'
            height='16'
            viewBox='0 0 16 16'
            fill='none'
            aria-hidden='true'
          >
            <rect width='16' height='16' rx='4' fill='rgba(255,255,255,0.9)' />
            <text
              x='8'
              y='12'
              textAnchor='middle'
              fill='#0a0b0e'
              fontSize='10'
              fontWeight='700'
              fontFamily='ui-sans-serif, system-ui, sans-serif'
            >
              J
            </text>
          </svg>
        </div>
        <span className='homepage-ios-notification-app'>
          {notificationFrom}
        </span>
        <span className='homepage-ios-notification-time'>now</span>
      </div>
      <p className='homepage-ios-notification-body'>{notificationBody}</p>
    </div>
  );
}

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
              <LockScreenNotification />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
