// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import { Button } from '@jovie/ui/atoms/button';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { DisplayText } from '@/components/atoms/DisplayText';
import { WaitlistRoleForm } from '@/components/features/waitlist/WaitlistRoleForm';
import { HomepageProfilePhone } from '@/components/homepage/HomepageProfilePhone';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_HEADLINE_BREAKS,
  HOMEPAGE_INVITE_ANCHOR,
  HOMEPAGE_RELEASES,
} from '@/data/homepageEditorialCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import './HomepageEditorial.css';

const OWNER = 'apps/web/components/homepage/HomepageEditorial.tsx';
const CHAPTER_ANCHORS = [
  'feature-split',
  'product-gallery',
  HOMEPAGE_INVITE_ANCHOR,
];

type HeroCopy = {
  readonly [K in keyof typeof HOMEPAGE_EDITORIAL_COPY.hero]: string;
};

/** The design's line breaks for a default headline; others wrap naturally. */
function lines(text: string): ReactNode {
  const parts = HOMEPAGE_HEADLINE_BREAKS[text] ?? [text];
  return parts.map((line, index) => (
    <Fragment key={line}>
      <span className='hpv1-line'>{line}</span>
      {index < parts.length - 1 ? ' ' : null}
    </Fragment>
  ));
}

function Eyebrow({ index, label }: Readonly<{ index: string; label: string }>) {
  return (
    <p className='hpv1-eyebrow'>
      <span className='hpv1-eyebrow__n'>{index}</span>
      {label}
    </p>
  );
}

/**
 * Hero: the locked line on the left editorial axis over the matte signal
 * field, one primary action that scrolls to the on-page invitation form, one
 * quiet link to a real profile, and the chapter index.
 */
export function HomepageStoryHero({
  copy = HOMEPAGE_EDITORIAL_COPY.hero,
  headingId = 'home-hero-heading',
}: Readonly<{ copy?: HeroCopy; headingId?: string }>) {
  return (
    <section
      data-pen-section='hero'
      data-testid='marketing-section-hero'
      data-marketing-variant='left-none'
      data-accent='ion'
      data-marketing-owner={OWNER}
      aria-labelledby={headingId}
      className='hpv1-hero marketing-hero-dock'
    >
      <div className='hpv1-hero__art' aria-hidden>
        <Image
          src='/assets/generated/homepage-hero-signal-grain-v1.webp'
          alt=''
          fill
          priority
          sizes='100vw'
          className='hpv1-hero__img'
        />
        <div className='hpv1-hero__veil' />
      </div>
      <div className='hpv1-wrap hpv1-hero__copy'>
        <DisplayText as='h1' id={headingId} className='hpv1-display'>
          {lines(HOMEPAGE_EDITORIAL_COPY.hero.headline)}
        </DisplayText>
        <p className='hpv1-lede'>{copy.subhead}</p>
        <div className='hpv1-actions'>
          <div className='hpv1-cta'>
            <Button
              asChild
              variant='primary'
              size='lg'
              data-testid='homepage-primary-cta'
              data-primary-action='true'
            >
              <Link href={copy.primaryHref} prefetch={false}>
                {copy.primaryAction}
              </Link>
            </Button>
          </div>
          <Link
            href={copy.secondaryHref}
            prefetch={false}
            className='hpv1-quiet-link'
            data-testid='homepage-hero-live-profile'
          >
            {copy.secondaryAction}
            <ArrowRight className='size-4' aria-hidden />
          </Link>
          <p className='hpv1-note hpv1-note--compact'>
            {HOMEPAGE_EDITORIAL_COPY.hero.noteCompact}
          </p>
        </div>
        <p className='hpv1-note hpv1-note--wide'>
          {HOMEPAGE_EDITORIAL_COPY.hero.note}
        </p>
      </div>
      <nav
        className='hpv1-wrap hpv1-index'
        aria-label={HOMEPAGE_EDITORIAL_COPY.chaptersLabel}
      >
        <ol>
          {HOMEPAGE_EDITORIAL_COPY.chapters.map((label, index) => (
            <li key={label}>
              <a href={`#${CHAPTER_ANCHORS[index]}`}>
                <span className='hpv1-eyebrow__n'>{`0${index + 1}`}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

interface ChapterCopy {
  readonly headline: string;
  readonly body: string;
}

/** jov.ie/tim: Tim's real profile, with what the profile does in three rows. */
export function HomepageProfileChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.profile,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = HOMEPAGE_EDITORIAL_COPY.profile;
  return (
    <section
      id='feature-split'
      data-pen-section='profile'
      data-testid='marketing-section-feature-split'
      data-marketing-variant='phone-right'
      data-marketing-owner={OWNER}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
      className='hpv1-chapter hpv1-profile'
    >
      <div className='hpv1-wrap hpv1-profile__grid'>
        <div className='hpv1-profile__copy'>
          <Eyebrow index='01' label={HOMEPAGE_EDITORIAL_COPY.chapters[0]} />
          <DisplayText as='h2' className='hpv1-display hpv1-display--section'>
            {lines(copy.headline)}
          </DisplayText>
          <p className='hpv1-body'>{copy.body}</p>
          <dl className='hpv1-rows'>
            {media.rows.map(row => (
              <div key={row.label} className='hpv1-row'>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className='hpv1-stage'>
          <HomepageProfilePhone
            alt={media.alt}
            release={HOMEPAGE_RELEASES[0]}
          />
        </div>
      </div>
    </section>
  );
}

/** Tim's real catalog: four covers, titles below, never over, the art. */
export function HomepageReleasesChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.releases,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = HOMEPAGE_EDITORIAL_COPY.releases;
  return (
    <section
      id='product-gallery'
      data-pen-section='releases'
      data-testid='marketing-section-product-gallery'
      data-marketing-variant='release-rail'
      data-marketing-owner={OWNER}
      data-pen-contract={
        MARKETING_PEN_CONTRACT_IDS.section.productGalleryReleaseRail
      }
      className='hpv1-chapter hpv1-releases'
    >
      <div className='hpv1-wrap'>
        <div className='hpv1-releases__head'>
          <div>
            <Eyebrow index='02' label={HOMEPAGE_EDITORIAL_COPY.chapters[1]} />
            <DisplayText as='h2' className='hpv1-display hpv1-display--section'>
              {lines(copy.headline)}
            </DisplayText>
          </div>
          <p className='hpv1-body'>{copy.body}</p>
        </div>
        <ul className='hpv1-catalog'>
          {HOMEPAGE_RELEASES.map(release => (
            <li key={release.title} className='hpv1-release'>
              <div className='hpv1-release__art'>
                <Image
                  src={release.src}
                  alt={`${release.title} cover art`}
                  fill
                  sizes='(min-width: 1200px) 276px, 163px'
                />
              </div>
              <p className='hpv1-release__title'>{release.title}</p>
              <p className='hpv1-release__meta'>
                <span className='hpv1-meta--wide'>{release.meta}</span>
                <span className='hpv1-meta--compact'>
                  {'metaCompact' in release
                    ? release.metaCompact
                    : release.meta}
                </span>
              </p>
            </li>
          ))}
        </ul>
        <Link
          href={TIM_CATALOG_HREF}
          prefetch={false}
          className='hpv1-quiet-link hpv1-catalog-link'
        >
          {media.catalogLink}
          <ArrowRight className='size-4' aria-hidden />
        </Link>
      </div>
    </section>
  );
}

const TIM_CATALOG_HREF = HOMEPAGE_EDITORIAL_COPY.hero.secondaryHref;

/** Close: the role waitlist form, the page's one conversion. */
export function HomepageInviteClose({
  copy = HOMEPAGE_EDITORIAL_COPY.invite,
}: Readonly<{
  copy?: { readonly headline: string; readonly subhead: string };
}>) {
  const invite = HOMEPAGE_EDITORIAL_COPY.invite;
  return (
    <section
      id={HOMEPAGE_INVITE_ANCHOR}
      data-pen-section='invite'
      data-testid='marketing-section-cta'
      data-marketing-variant='final-single-claim'
      data-marketing-owner={OWNER}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.cta}
      className='hpv1-chapter hpv1-invite'
    >
      <div className='hpv1-wrap hpv1-invite__grid'>
        <div className='hpv1-invite__form'>
          <Eyebrow index='03' label={HOMEPAGE_EDITORIAL_COPY.chapters[2]} />
          <DisplayText as='h2' className='hpv1-display hpv1-display--section'>
            {lines(copy.headline)}
          </DisplayText>
          <p className='hpv1-body'>{copy.subhead}</p>
          <WaitlistRoleForm
            presentation='chips'
            align='start'
            headingLevel={2}
            title={copy.headline}
            roleLabel={invite.roleLabel}
            submitLabel={invite.action}
            note={invite.note}
          />
        </div>
        <ol className='hpv1-steps'>
          {invite.steps.map((step, index) => (
            <li key={step.title} className='hpv1-step'>
              <span className='hpv1-step__n'>{index + 1}</span>
              <div>
                <p className='hpv1-step__title'>{step.title}</p>
                <p className='hpv1-step__body'>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
