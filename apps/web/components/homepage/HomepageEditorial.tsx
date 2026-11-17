// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { WaitlistRoleForm } from '@/components/features/waitlist/WaitlistRoleForm';
import { HomepageProfilePhone } from '@/components/homepage/HomepageProfilePhone';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_HEADLINE_BREAKS,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { HOMEPAGE_LATEST_RELEASE } from '@/data/homepageProductUi';
import {
  isHomepageStartCtaEnabled,
  resolveHomepageHeroPrimaryAction,
} from '@/data/homepageStartCta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { HOME_SPEC } from './v3/home-spec';
import { Orbit } from './v3/Orbit';
import { AppWindow, CatalogPlate } from './v3/ProductUi';
import { Callout, ReleasePage } from './v3/Surfaces';
import './v3/stage.css';
import './v3/product-ui.css';
import './v3/surfaces.css';
import './v3/phone.css';
import './v3/chapters.css';
import './v3/specs.css';
import './v3/form.css';
import './v3/responsive.css';
import './v3/cinema.css';

const OWNER = 'apps/web/components/homepage/HomepageEditorial.tsx';
const COPY = HOMEPAGE_EDITORIAL_COPY;
const CHAPTER_ANCHORS = [
  'feature-split',
  'product-gallery',
  'specs',
  HOMEPAGE_INVITE_ANCHOR,
];

/** Chapter index labels: the close is `claim` while public signup is open. */
function chapterLabels(): readonly string[] {
  return isHomepageStartCtaEnabled()
    ? [...COPY.chapters.slice(0, 3), COPY.claim.chapter]
    : COPY.chapters;
}

type HeroCopy = {
  readonly [K in keyof typeof HOMEPAGE_EDITORIAL_COPY.hero]: string;
};

/** The design's line breaks for a default headline; others wrap naturally. */
function lines(text: string): ReactNode {
  const parts = HOMEPAGE_HEADLINE_BREAKS[text] ?? [text];
  return parts.map((line, index) => (
    <Fragment key={line}>
      <span className='hv3-line'>{line}</span>
      {index < parts.length - 1 ? ' ' : null}
    </Fragment>
  ));
}

function ChapterRule({
  index,
  label,
}: Readonly<{ index: string; label: string }>) {
  return (
    <div className='hv3-rule'>
      <span className='hv3-mono'>{`${index} · ${label}`}</span>
    </div>
  );
}

/**
 * Hero: the locked line beside the lede and actions, then Jovie for Mac shot
 * straight on, its release page lifted out of the window, standing in one
 * key light from above. No rings or glow blobs: light, edge and shadow only.
 */
export function HomepageStoryHero({
  copy = HOMEPAGE_EDITORIAL_COPY.hero,
  headingId = 'home-hero-heading',
}: Readonly<{ copy?: HeroCopy; headingId?: string }>) {
  const primary = resolveHomepageHeroPrimaryAction(copy);
  return (
    <section
      data-pen-section='hero'
      data-testid='marketing-section-hero'
      data-marketing-variant='left-none'
      data-accent='ion'
      data-marketing-owner={OWNER}
      aria-labelledby={headingId}
      className='hv3 hv3-hero marketing-hero-dock'
    >
      <div className='hv3-hero__copy'>
        <h1
          id={headingId}
          className='hv3-display marketing-hero-headline text-balance'
        >
          {lines(HOMEPAGE_EDITORIAL_COPY.hero.headline)}
        </h1>
        <div className='hv3-hero__side'>
          <p className='hv3-lede marketing-hero-subtitle'>{copy.subhead}</p>
          <div className='hv3-ctas'>
            <Link
              href={primary.href}
              prefetch={false}
              className='hv3-btn hv3-btn--primary'
              data-testid='homepage-primary-cta'
              data-primary-action='true'
            >
              {primary.label}
            </Link>
            <Link
              href={copy.secondaryHref}
              prefetch={false}
              className='hv3-btn hv3-btn--ghost'
              data-testid='homepage-hero-live-profile'
            >
              {copy.secondaryAction}
              <ArrowRight className='size-4' aria-hidden />
            </Link>
          </div>
          {primary.showInviteNote ? (
            <p className='hv3-mono hv3-hero__note'>{COPY.hero.note}</p>
          ) : null}
        </div>
      </div>
      {/* Product mockups under the 3D camera: their boxes overlap by projection,
          not by layout, so the DOM layout detectors skip them. */}
      <div
        className='hv3-stage hv3-stage--hero'
        data-dom-certification='ignore'
      >
        {/* The key light: one Ion wedge from above the frame, falling onto the
            selected release. The window stands in it; it shows only as haze
            above the window and as spill below it. */}
        <div aria-hidden className='hv3-keylight' />
        <div
          className='hv3-rig hv3-rig--hero'
          role='img'
          aria-label={COPY.hero.windowLabel}
        >
          <div className='hv3-window hv3-edge'>
            <AppWindow />
            <div className='hv3-sheen' />
          </div>
          {/* What a listener gets from the selected row: its release page,
              on the third column, down to its first listen rows. */}
          <div
            aria-hidden
            className='hv3-lift hv3-lift--page hv3-edge'
            data-hv3-parallax
          >
            <div className='hv3-phone hv3-phone--hero'>
              <ReleasePage titleAnchor='htitle' />
            </div>
          </div>
        </div>
      </div>
      <nav className='hv3-index' aria-label={COPY.chaptersLabel}>
        {chapterLabels().map((label, index) => (
          <a
            key={label}
            href={`#${CHAPTER_ANCHORS[index]}`}
            className='hv3-mono'
          >
            <b>{`0${index + 1}`}</b>
            {label}
          </a>
        ))}
      </nav>
    </section>
  );
}

interface ChapterCopy {
  readonly headline: string;
  readonly body: string;
}

/** 01 profile: the featured artist's profile, with what it does in three rows. */
export function HomepageProfileChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.profile,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = COPY.profile;
  return (
    <section
      id='feature-split'
      data-pen-section='profile'
      data-testid='marketing-section-feature-split'
      data-marketing-variant='phone-right'
      data-marketing-owner={OWNER}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
      className='hv3 hv3-chapter hv3-profile'
    >
      <ChapterRule index='01' label={COPY.chapters[0]} />
      <div className='hv3-split'>
        <div className='hv3-reveal'>
          <h2 className='hv3-statement text-balance'>{lines(copy.headline)}</h2>
          <p className='hv3-body'>{copy.body}</p>
          <dl className='hv3-rows'>
            {media.rows.map(row => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div
          className='hv3-stage hv3-stage--profile'
          data-dom-certification='ignore'
        >
          <Orbit
            id='hv3-orbit-profile'
            rings={[380, 300, 220]}
            arc={[38, 44]}
          />
          <div className='hv3-bounce' />
          <div className='hv3-rig hv3-rig--profile'>
            <div className='hv3-phone hv3-edge'>
              <HomepageProfilePhone
                alt={media.alt}
                release={HOMEPAGE_LATEST_RELEASE}
              />
            </div>
          </div>
          <Callout
            anchor='handle'
            label={media.handleCallout}
            className='hv3-callout--handle'
          />
          <Callout
            anchor='updates'
            side='left'
            label={media.updatesCallout}
            className='hv3-callout--updates'
          />
        </div>
      </div>
    </section>
  );
}

/** 02 releases: the catalog row and the release page it becomes. */
export function HomepageReleasesChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.releases,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = COPY.releases;
  const captions = media.captions;
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
      className='hv3 hv3-chapter hv3-releases'
    >
      <ChapterRule index='02' label={COPY.chapters[1]} />
      <div className='hv3-centered hv3-reveal'>
        <h2 className='hv3-statement text-balance'>{lines(copy.headline)}</h2>
        <p className='hv3-lede hv3-lede--center'>{copy.body}</p>
      </div>
      <div
        className='hv3-stage hv3-stage--releases hv3-frame'
        data-dom-certification='ignore'
      >
        <Orbit id='hv3-orbit-releases' rings={[620, 500]} arc={[345, 36]} />
        <div className='hv3-bounce' />
        <div className='hv3-rig hv3-rig--releases'>
          <div
            className='hv3-plate hv3-edge'
            role='img'
            aria-label={media.catalogLabel}
          >
            <CatalogPlate />
          </div>
          <div
            className='hv3-phone hv3-phone--release hv3-edge'
            role='img'
            aria-label={media.releasePageLabel}
          >
            <ReleasePage />
          </div>
        </div>
        <svg
          aria-hidden
          className='hv3-connector'
          data-hv3-connector='rowR>title'
        />
      </div>
      <div className='hv3-captions hv3-reveal'>
        <div>
          <h3 className='text-balance'>{captions.page.title}</h3>
          <p>{captions.page.body}</p>
        </div>
        <div>
          <h3 className='text-balance'>{captions.services.title}</h3>
          <p>{captions.services.body(HOME_SPEC.listen)}</p>
        </div>
        <div>
          <h3 className='text-balance'>{captions.catalog.title}</h3>
          <p>{captions.catalog.body}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * 04 claim: the page's one conversion while public signup is open, the shared
 * claim-profile intent into `/start`. Code-owned copy (see `COPY.claim`).
 */
function ClaimCloseBody() {
  const claim = COPY.claim;
  const intent = getClaimProfileIntent();
  return (
    <>
      <ChapterRule index='04' label={claim.chapter} />
      <div className='hv3-invite__inner'>
        <h2 className='hv3-statement text-balance'>{lines(claim.headline)}</h2>
        <p className='hv3-lede hv3-lede--center'>{claim.subhead}</p>
        <div className='hv3-form'>
          <Link
            href={intent.href}
            prefetch={false}
            className='hv3-btn hv3-btn--primary'
            data-testid='homepage-close-cta'
          >
            {intent.label}
          </Link>
        </div>
        <Steps steps={claim.steps} />
      </div>
    </>
  );
}

function Steps({
  steps,
}: Readonly<{
  steps: readonly { readonly title: string; readonly body: string }[];
}>) {
  return (
    <ol className='hv3-steps hv3-reveal'>
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className='hv3-mono'>{`0${index + 1}`}</span>
          <b>{step.title}</b>
          <span>{step.body}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 04 close. Public signup open: the claim close. Only while the
 * `PUBLIC_SIGNUP_CLOSED` kill switch is on: the role waitlist form, whose
 * headline and subhead the `cta` record slots fill.
 */
export function HomepageInviteClose({
  copy = HOMEPAGE_EDITORIAL_COPY.invite,
}: Readonly<{
  copy?: { readonly headline: string; readonly subhead: string };
}>) {
  const invite = COPY.invite;
  return (
    <section
      id={HOMEPAGE_INVITE_ANCHOR}
      data-pen-section='invite'
      data-testid='marketing-section-cta'
      data-marketing-variant='final-single-claim'
      data-marketing-owner={OWNER}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.cta}
      className='hv3 hv3-chapter hv3-invite'
    >
      {isHomepageStartCtaEnabled() ? (
        <ClaimCloseBody />
      ) : (
        <>
          <ChapterRule index='04' label={COPY.chapters[3]} />
          <div className='hv3-invite__inner'>
            <h2 className='hv3-statement text-balance'>
              {lines(copy.headline)}
            </h2>
            <p className='hv3-lede hv3-lede--center'>{copy.subhead}</p>
            <div className='hv3-form'>
              <WaitlistRoleForm
                presentation='chips'
                align='center'
                headingLevel={2}
                title={copy.headline}
                roleLabel={invite.roleLabel}
                submitLabel={invite.action}
              />
            </div>
            <Steps steps={invite.steps} />
          </div>
        </>
      )}
    </section>
  );
}
