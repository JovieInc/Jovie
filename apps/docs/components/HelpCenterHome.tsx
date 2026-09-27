import Link from 'next/link';
import {
  HELP_CENTER_DESTINATIONS,
  HELP_CENTER_SUPPORT,
  HELP_CENTER_TITLE,
} from '@/lib/help-center-home.mjs';
import styles from './HelpCenterHome.module.css';

type IconName = (typeof HELP_CENTER_DESTINATIONS)[number]['icon'];

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  start: <path d='M5 12h14M13 6l6 6-6 6' />,
  profile: (
    <>
      <circle cx='12' cy='8' r='3' />
      <path d='M5.5 19c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5' />
    </>
  ),
  release: (
    <>
      <circle cx='8' cy='12' r='3' />
      <circle cx='16' cy='12' r='3' />
      <path d='M11 12h2M5 8V6h4M19 16v2h-4' />
    </>
  ),
  audience: (
    <>
      <path d='M4 19v-5M10 19V9M16 19V5M22 19H2' />
    </>
  ),
  account: (
    <>
      <rect x='3' y='6' width='18' height='12' rx='2' />
      <path d='M3 10h18M7 14h3' />
    </>
  ),
  troubleshooting: (
    <>
      <path d='M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.6 2.6-3-3 2.6-2.6Z' />
    </>
  ),
};

function DestinationIcon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden='true'
      className={styles.icon}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function JovieMark() {
  return (
    <svg
      aria-hidden='true'
      className={styles.mark}
      viewBox='0 0 360 360'
      shapeRendering='geometricPrecision'
    >
      <path d='M179.16 6l3.08.05c8.92 1.73 16.9 6.45 23.05 13.18 7.95 8.7 12.87 20.77 12.87 34.14s-4.92 25.44-12.87 34.14c-6.7 7.34-15.59 12.28-25.49 13.57h-.64c-22.2 0-42.3 8.84-56.83 23.13-14.5 14.27-23.49 33.99-23.49 55.77s8.98 41.5 23.49 55.77c14.54 14.3 34.64 23.15 56.83 23.15 22.2 0 42.3-8.84 56.83-23.13 14.51-14.27 23.49-33.99 23.49-55.77 0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64a60 60 0 0 0 11.84-9.78c9.57-10.47 15.5-24.89 15.5-40.77s-5.93-30.3-15.5-40.77a61 61 0 0 0-4.55-4.44l7.67 1.58c40.44 8.35 75.81 30.3 100.91 60.75C341.22 100.4 356 138.51 356 179.99c0 48.05-19.81 91.55-51.83 123.05-31.99 31.46-76.19 50.92-125 50.92-48.79 0-93-19.47-125-50.94C22.15 271.53 2.34 228.03 2.34 179.98S22.15 88.42 54.17 56.93C86.18 25.47 130.38 6 179.16 6Z' />
    </svg>
  );
}

export function HelpCenterHome() {
  return (
    <main className={`${styles.root} not-prose`}>
      <div className={styles.gridLines} aria-hidden='true' />
      <header className={styles.hero}>
        <JovieMark />
        <h1>{HELP_CENTER_TITLE}</h1>
        <p>{HELP_CENTER_SUPPORT}</p>
      </header>

      <nav aria-label='Help Center topics' className={styles.destinations}>
        {HELP_CENTER_DESTINATIONS.map(destination => (
          <Link
            className={styles.card}
            href={destination.route}
            key={destination.route}
          >
            <DestinationIcon name={destination.icon} />
            <span className={styles.cardTitle}>{destination.title}</span>
            <span className={styles.cardDescription}>
              {destination.description}
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
