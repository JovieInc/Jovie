import { HOME_AUTO_NOTIFY_CONTENT } from './home-page-content';

export function HomeNotificationCard() {
  const { notificationFrom, notificationBody } = HOME_AUTO_NOTIFY_CONTENT;

  return (
    <div className='homepage-ios-notification'>
      <div className='homepage-ios-notification-header'>
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
