import type { Metadata } from 'next';
import { FaqSection, MarketingHero } from '@/components/marketing';
import { APP_NAME, APP_URL } from '@/constants/app';
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildOrganizationSchema,
} from '@/lib/constants/schemas';

export const revalidate = false;

const FAQ_ITEMS = [
  {
    question: 'What is Jovie?',
    answer:
      'Jovie is a release platform for independent musicians. It combines smart links, artist profiles, audience intelligence, release automation, and AI tools to help artists release more music with less work. Jovie is available at jov.ie.',
  },
  {
    question: 'Is Jovie related to Jovie childcare or babysitting?',
    answer:
      'No. Jovie the music platform (jov.ie) and Jovie the childcare franchise (jovie.com) are completely separate, unrelated companies in different industries. Jovie the music platform is operated by Jovie Technology Inc. The childcare franchise is operated by Bright Horizons Family Solutions.',
  },
  {
    question: 'Who founded Jovie?',
    answer:
      'Jovie was founded by Tim White, a music marketing veteran with 15+ years of experience working with labels like Armada Music and Universal Music, and running digital campaigns for artists like Tory Lanez and Megan Thee Stallion, and brands like Google and the NFL.',
  },
  {
    question: 'What does Jovie do?',
    answer:
      'Jovie gives independent musicians smart links that route fans to the right streaming platform, professional artist profiles, audience intelligence and fan CRM, automatic release notifications, and AI tools that know your actual career data — stream counts, tour dates, collaborations, and more.',
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes, Jovie offers a free tier that lets you create a profile, add releases, and start collecting fans. Paid plans unlock advanced analytics, branding removal, contact export, and more.',
  },
  {
    question: 'How is Jovie different from Linktree?',
    answer:
      'Linktree is a general-purpose link-in-bio tool. Jovie is built specifically for musicians — it automatically generates smart links for music releases, routes fans to the right streaming platform, collects and manages fan contacts, sends automatic notifications when you drop new music, and includes AI tools that understand your career. Jovie optimizes for fan conversion, not just link display.',
  },
];

export const metadata: Metadata = {
  title: `About ${APP_NAME} — The Release Platform for Independent Musicians`,
  description:
    'Jovie is a release platform for independent musicians, combining smart links, artist profiles, audience intelligence, and AI. Founded by Tim White. Not affiliated with Jovie childcare.',
  keywords: [
    'Jovie',
    'Jovie music',
    'Jovie app',
    'what is Jovie',
    'Jovie Technology',
    'Tim White Jovie',
    'music release platform',
    'smart links for musicians',
    'link in bio for artists',
  ],
  alternates: {
    canonical: `${APP_URL}/about`,
  },
  openGraph: {
    title: `About ${APP_NAME} — The Release Platform for Independent Musicians`,
    description:
      'Jovie is a release platform for independent musicians, combining smart links, artist profiles, audience intelligence, and AI. Founded by Tim White.',
    url: `${APP_URL}/about`,
    type: 'website',
  },
};

const ORGANIZATION_SCHEMA = buildOrganizationSchema({
  legalName: 'Jovie Technology Inc.',
  description:
    'Jovie is the release platform for independent musicians, combining smart links, artist profiles, audience insights, paid release notifications, and AI support.',
  sameAs: ['https://instagram.com/meetjovie'],
});

const FAQ_SCHEMA = buildFaqSchema(FAQ_ITEMS);

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: APP_URL },
  { name: 'About', url: `${APP_URL}/about` },
]);

export default function AboutPage() {
  return (
    <>
      <script type='application/ld+json'>{ORGANIZATION_SCHEMA}</script>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='marketing-kicker'>About</p>
        <h1 className='marketing-h1-linear mt-6 max-w-[20ch] text-primary-token'>
          Release more music. Do less release work.
        </h1>
        <p className='mt-6 max-w-[60ch] text-lg leading-relaxed text-secondary-token'>
          Jovie is the release platform for independent musicians. Smart links,
          artist profiles, audience intelligence, release automation, and AI —
          all in one place.
        </p>
      </MarketingHero>

      {/* Origin Story */}
      <section className='mx-auto max-w-[720px] px-6 pb-16 sm:px-8 lg:px-10'>
        <h2 className='text-2xl font-semibold text-primary-token'>
          Why Jovie exists
        </h2>
        <div className='mt-6 space-y-5 text-base leading-relaxed text-secondary-token'>
          <p>
            I spent 15 years in music marketing. Worked with Armada Music,
            Universal Music, ran digital campaigns for artists like Tory Lanez
            and Megan Thee Stallion, and drove campaigns for brands like Google
            and the NFL.
          </p>
          <p>
            The whole time, I saw the same problem: the artists who needed
            marketing infrastructure the most were the ones who could never
            afford it. Labels have teams of people coordinating releases,
            managing fan data, planning rollouts. Independent artists have
            themselves and maybe a friend who&apos;s decent at Instagram.
          </p>
          <p>
            Jovie is what I wish existed when I was an artist. One platform that
            handles the release work so musicians can focus on making music.
            Smart links that route fans to the right streaming platform. A
            profile that converts visitors into fans. Audience intelligence that
            tells you who your fans are and where they came from. AI that
            actually knows your career — your stream counts, your tour dates,
            your collaborations — not a blank prompt.
          </p>
          <p className='text-primary-token'>— Tim White, Founder</p>
        </div>
      </section>

      {/* What Jovie Does */}
      <section className='mx-auto max-w-[720px] px-6 pb-16 sm:px-8 lg:px-10'>
        <h2 className='text-2xl font-semibold text-primary-token'>
          What Jovie does
        </h2>
        <div className='mt-6 grid gap-8 sm:grid-cols-2'>
          {[
            {
              title: 'Smart Links',
              description:
                'Every release gets a smart link that routes fans to Spotify, Apple Music, YouTube, or wherever they listen.',
            },
            {
              title: 'Artist Profiles',
              description:
                'A professional link-in-bio at jov.ie/username — music, social links, tour dates, and bio in one place.',
            },
            {
              title: 'Audience Intelligence',
              description:
                'Fan CRM with contact collection, engagement tracking, source attribution, and audience segmentation.',
            },
            {
              title: 'Release Automation',
              description:
                'Automatic fan notifications, release task management, and rollout planning for every drop.',
            },
            {
              title: 'AI Tools',
              description:
                'Press releases, release strategy, and career insights powered by AI that knows your actual data.',
            },
            {
              title: 'Tipping & Payments',
              description:
                'Let fans support you directly with tips via Stripe — at shows, on your profile, or through QR codes.',
            },
          ].map(feature => (
            <div key={feature.title}>
              <h3 className='font-medium text-primary-token'>
                {feature.title}
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <FaqSection items={FAQ_ITEMS} />
    </>
  );
}
