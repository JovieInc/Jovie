// @coverage-via apps/web/lib/content-records/page-spec.test.tsx
import { Button } from '@jovie/ui';
import {
  Bell,
  Calendar,
  ChartNoAxesColumn,
  Check,
  CreditCard,
  Globe,
  Link as LinkIcon,
  type LucideIcon,
  Music,
  Shield,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import { APP_ROUTES } from '@/constants/routes';
import type {
  PageSpecIcon,
  PageSpecSection,
} from '@/lib/content-records/page-spec';
import { cn } from '@/lib/utils';

/**
 * The one renderer for page-spec sections (`lib/content-records/page-spec.ts`).
 * A spec fills copy and picks order; every visual decision lives here:
 * - static matte surfaces only (two semantic backgrounds, no gradient/motion);
 * - feature icons are bare glyphs, never tiles or badges;
 * - no step numbers are ever drawn;
 * - exactly one primary action per section.
 */

const ICONS: Readonly<Record<PageSpecIcon, LucideIcon>> = {
  check: Check,
  link: LinkIcon,
  bell: Bell,
  calendar: Calendar,
  chart: ChartNoAxesColumn,
  'credit-card': CreditCard,
  globe: Globe,
  music: Music,
  shield: Shield,
  zap: Zap,
};

const SURFACE = {
  base: 'bg-base',
  raised: 'bg-surface-0',
} as const;

const SECTION_CLASS = 'py-16 text-primary-token sm:py-24';
const TITLE_CLASS = 'marketing-type-section';
const BODY_CLASS = 'text-pretty text-lg text-secondary-token';

function Shell({
  section,
  labelId,
  children,
}: Readonly<{
  section: PageSpecSection;
  labelId?: string;
  children: React.ReactNode;
}>) {
  return (
    <section
      aria-labelledby={labelId}
      data-page-spec-section={section.type}
      data-page-spec-id={section.id}
      data-accent='ion'
      className={cn(SECTION_CLASS, SURFACE[section.background])}
    >
      <MarketingContainer width='page'>{children}</MarketingContainer>
    </section>
  );
}

function PrimaryCta({
  label,
  href,
}: Readonly<{ label: string; href: string }>) {
  return (
    <Button asChild size='lg'>
      <Link href={href} prefetch={false}>
        {label}
      </Link>
    </Button>
  );
}

function SingleFieldForm({
  field,
  microcopy,
  submitLabel,
}: Readonly<{
  field: 'email' | 'handle';
  microcopy: string;
  submitLabel: string;
}>) {
  const isEmail = field === 'email';
  return (
    <form
      action={APP_ROUTES.START}
      method='get'
      className='mt-6 w-full max-w-md'
    >
      <div className='flex flex-col gap-3 sm:flex-row'>
        <input
          aria-label={isEmail ? 'Email address' : 'Your handle'}
          autoComplete={isEmail ? 'email' : 'username'}
          className='h-11 min-w-0 flex-1 rounded-full border border-subtle bg-surface-1 px-4 text-primary-token placeholder:text-tertiary-token focus-visible:outline-2 focus-visible:outline-offset-2'
          inputMode={isEmail ? 'email' : 'text'}
          name={field}
          required
          type={isEmail ? 'email' : 'text'}
        />
        <Button size='lg' type='submit'>
          {submitLabel}
        </Button>
      </div>
      <p className='mt-3 text-sm text-tertiary-token'>{microcopy}</p>
    </form>
  );
}

function renderSection(section: PageSpecSection) {
  const labelId = `page-spec-${section.id}`;
  switch (section.type) {
    case 'hero':
      return (
        <Shell key={section.id} section={section} labelId={labelId}>
          <div className='flex max-w-3xl flex-col items-start gap-5'>
            <h1
              id={labelId}
              className='marketing-type-display text-balance'
              data-wrap='editorial-title'
            >
              {section.title}
            </h1>
            <p className={BODY_CLASS}>{section.body}</p>
            {section.cta ? <PrimaryCta {...section.cta} /> : null}
          </div>
        </Shell>
      );
    case 'product-shot':
      return (
        <Shell key={section.id} section={section} labelId={labelId}>
          <h2 id={labelId} className={TITLE_CLASS} data-wrap='editorial-title'>
            {section.title}
          </h2>
          <figure className='mt-8 overflow-hidden rounded-2xl border border-subtle'>
            <Image
              alt={section.shot.alt}
              className='h-auto w-full'
              height={900}
              sizes='(min-width: 1200px) 1200px, 100vw'
              src={section.shot.src}
              width={1600}
            />
            {section.caption ? (
              <figcaption className='border-t border-subtle px-4 py-3 text-sm text-tertiary-token'>
                {section.caption}
              </figcaption>
            ) : null}
          </figure>
        </Shell>
      );
    case 'feature-list':
      return (
        <Shell key={section.id} section={section} labelId={labelId}>
          <h2 id={labelId} className={TITLE_CLASS} data-wrap='editorial-title'>
            {section.title}
          </h2>
          <ul className='mt-10 grid list-none gap-x-10 gap-y-8 p-0 sm:grid-cols-2'>
            {section.items.map(item => {
              const Icon = item.icon ? ICONS[item.icon] : null;
              return (
                <li key={item.id} className='flex flex-col gap-2'>
                  {Icon ? (
                    <Icon
                      aria-hidden='true'
                      className='size-5 text-secondary-token'
                      strokeWidth={1.5}
                    />
                  ) : null}
                  <h3 className='text-balance text-lg font-medium'>
                    {item.title}
                  </h3>
                  <p className='text-secondary-token'>{item.body}</p>
                </li>
              );
            })}
          </ul>
        </Shell>
      );
    case 'proof-quote':
      return (
        <Shell key={section.id} section={section}>
          <figure className='max-w-3xl'>
            <blockquote className='marketing-type-section text-balance'>
              {section.quote}
            </blockquote>
            <figcaption className='mt-5 text-sm text-secondary-token'>
              {section.name}, {section.role}
            </figcaption>
          </figure>
        </Shell>
      );
    case 'cta':
      return (
        <Shell key={section.id} section={section} labelId={labelId}>
          <div className='flex max-w-2xl flex-col items-start gap-4'>
            <h2
              id={labelId}
              className={TITLE_CLASS}
              data-wrap='editorial-title'
            >
              {section.title}
            </h2>
            {section.mode === 'link' ? (
              <>
                {section.body ? (
                  <p className={BODY_CLASS}>{section.body}</p>
                ) : null}
                <PrimaryCta {...section.cta} />
              </>
            ) : (
              <SingleFieldForm
                field={section.field}
                microcopy={section.microcopy}
                submitLabel={section.submitLabel}
              />
            )}
          </div>
        </Shell>
      );
    case 'faq':
      return (
        <Shell key={section.id} section={section} labelId={labelId}>
          <h2 id={labelId} className={TITLE_CLASS} data-wrap='editorial-title'>
            {section.title}
          </h2>
          <dl className='mt-8 grid max-w-3xl gap-6'>
            {section.items.map(item => (
              <div key={item.id}>
                <dt className='text-lg font-medium'>{item.question}</dt>
                <dd className='mt-2 text-secondary-token'>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </Shell>
      );
  }
}

export function PageSpecSections({
  sections,
}: Readonly<{ sections: readonly PageSpecSection[] }>) {
  return <>{sections.map(renderSection)}</>;
}
