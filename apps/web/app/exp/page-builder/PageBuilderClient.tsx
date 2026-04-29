'use client';

import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Layers,
  LayoutTemplate,
  Music2,
  Plus,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarketingFinalCTA } from '@/components/site/MarketingFinalCTA';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import {
  DESIGN_STUDIO_CATEGORY_LABELS,
  DESIGN_STUDIO_ITEMS,
  DESIGN_STUDIO_SCREENSHOT_SCENARIOS,
  type DesignStudioCategory,
  type DesignStudioItem,
  getDesignStudioPublicScreenshotUrl,
  getDesignStudioScreenshotUrl,
} from '@/lib/design-studio/registry';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';
import type { ScreenshotScenario } from '@/lib/screenshots/types';
import {
  getSectionById,
  getSectionsByCategory,
  SECTION_CATEGORIES_ORDERED,
  SECTION_CATEGORY_LABELS,
  type SectionCategory,
  type SectionVariant,
} from '@/lib/sections/registry';
import { cn } from '@/lib/utils';

type HeaderMode = 'solid' | 'transparent';
type FooterMode = 'full' | 'minimal';
type CtaMode = 'on' | 'off';
type StudioMode = 'pages' | 'sections' | 'product' | 'screenshots';

/**
 * Default body composition. Mirrors a "complete" landing page so reviewers
 * see header → hero → trust → feature → testimonial → FAQ → CTA → footer
 * without configuring anything.
 */
const DEFAULT_BODY: readonly string[] = [
  'marketing-hero-centered',
  'home-trust-default',
  'feature-card-grid-3up',
  'testimonial-card-3up',
  'faq-section-default',
];

/** Body categories — `header`, `footer-cta`, and `footer` are chrome, not body. */
const BODY_CATEGORIES: readonly SectionCategory[] =
  SECTION_CATEGORIES_ORDERED.filter(
    c => c !== 'header' && c !== 'footer-cta' && c !== 'footer'
  );

function parseBody(param: string | null): readonly string[] {
  if (!param) return DEFAULT_BODY;
  const ids = param
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : DEFAULT_BODY;
}

function parseHeader(param: string | null): HeaderMode {
  return param === 'transparent' ? 'transparent' : 'solid';
}
function parseFooter(param: string | null): FooterMode {
  return param === 'minimal' ? 'minimal' : 'full';
}
function parseCta(param: string | null): CtaMode {
  return param === 'off' ? 'off' : 'on';
}
function parseMode(param: string | null): StudioMode {
  if (param === 'sections' || param === 'product' || param === 'screenshots') {
    return param;
  }
  return 'pages';
}

export function PageBuilderClient({
  designV1Enabled,
}: Readonly<{
  designV1Enabled: boolean;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = designV1Enabled ? parseMode(searchParams.get('mode')) : 'pages';
  const headerMode = parseHeader(searchParams.get('header'));
  const footerMode = parseFooter(searchParams.get('footer'));
  const ctaMode = parseCta(searchParams.get('cta'));
  const bodyIds = useMemo(
    () => parseBody(searchParams.get('body')),
    [searchParams]
  );

  const setParam = useCallback(
    (
      updates: Partial<
        Record<'mode' | 'header' | 'footer' | 'cta' | 'body', string>
      >
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined) params.delete(k);
        else params.set(k, v);
      }
      router.replace(`/exp/page-builder?${params.toString()}`);
    },
    [router, searchParams]
  );

  const setBody = useCallback(
    (ids: readonly string[]) =>
      // Empty body must drop the param entirely. If we set it to '',
      // `parseBody` falls back to DEFAULT_BODY on next render and the
      // "no sections" empty state becomes unreachable.
      ids.length === 0
        ? setParam({ body: undefined })
        : setParam({ body: ids.join(',') }),
    [setParam]
  );

  const addSection = useCallback(
    (id: string) => setBody([...bodyIds, id]),
    [bodyIds, setBody]
  );
  const removeSection = useCallback(
    (idx: number) => setBody(bodyIds.filter((_, i) => i !== idx)),
    [bodyIds, setBody]
  );
  const moveSection = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= bodyIds.length) return;
      const next = [...bodyIds];
      [next[idx], next[target]] = [next[target], next[idx]];
      setBody(next);
    },
    [bodyIds, setBody]
  );

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Resolve body section variants. Skip ids that aren't in the registry
  // (e.g. typed manually into the URL) so the page always renders.
  const bodyVariants = useMemo(
    () =>
      bodyIds
        .map((id, idx) => {
          const variant = getSectionById(id);
          return variant ? { variant, idx } : null;
        })
        .filter(
          (x): x is { variant: SectionVariant; idx: number } => x !== null
        ),
    [bodyIds]
  );

  return (
    <div className='relative min-h-screen w-full overflow-x-hidden bg-(--linear-app-content-surface)'>
      <Toolbar
        headerMode={headerMode}
        footerMode={footerMode}
        ctaMode={ctaMode}
        // Use the resolved variant count, not raw URL ids — keeps the label
        // truthful when someone hand-types a stale or unknown id into ?body=.
        bodyCount={bodyVariants.length}
        designV1Enabled={designV1Enabled}
        mode={mode}
        onSetMode={nextMode => setParam({ mode: nextMode })}
        onSetHeader={mode => setParam({ header: mode })}
        onSetFooter={mode => setParam({ footer: mode })}
        onSetCta={mode => setParam({ cta: mode })}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {mode === 'pages' ? (
        /*
          The composed landing page. Padding-top = toolbar height so the
          header always renders below the toolbar without overlap.
        */
        <div className='pt-[64px]'>
          <MarketingHeader
            variant={headerMode === 'transparent' ? 'homepage' : 'landing'}
          />

          <main>
            {bodyVariants.map(({ variant, idx }) => (
              <div key={`${variant.id}-${idx}`} data-body-section={variant.id}>
                {variant.render()}
              </div>
            ))}
          </main>

          {ctaMode === 'on' && <MarketingFinalCTA />}

          <MarketingFooter
            variant={footerMode === 'minimal' ? 'minimal' : 'expanded'}
          />
        </div>
      ) : (
        <DesignStudioWorkspace mode={mode} />
      )}

      {drawerOpen && mode === 'pages' && (
        <SectionDrawer
          bodyIds={bodyIds}
          onAdd={addSection}
          onRemove={removeSection}
          onMove={moveSection}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

interface ToolbarProps {
  readonly headerMode: HeaderMode;
  readonly footerMode: FooterMode;
  readonly ctaMode: CtaMode;
  readonly bodyCount: number;
  readonly designV1Enabled: boolean;
  readonly mode: StudioMode;
  readonly onSetMode: (mode: StudioMode) => void;
  readonly onSetHeader: (mode: HeaderMode) => void;
  readonly onSetFooter: (mode: FooterMode) => void;
  readonly onSetCta: (mode: CtaMode) => void;
  readonly onOpenDrawer: () => void;
}

function Toolbar({
  headerMode,
  footerMode,
  ctaMode,
  bodyCount,
  designV1Enabled,
  mode,
  onSetMode,
  onSetHeader,
  onSetFooter,
  onSetCta,
  onOpenDrawer,
}: ToolbarProps) {
  return (
    <div className='fixed left-0 right-0 top-0 z-50 flex h-[56px] items-center gap-4 border-b border-white/10 bg-black/85 px-4 text-white shadow-lg backdrop-blur-md'>
      <span
        className={
          designV1Enabled
            ? 'text-xs font-semibold text-white/80'
            : 'text-2xs font-semibold uppercase tracking-wider text-white/70'
        }
      >
        {designV1Enabled ? 'Design Studio' : 'Page Builder'}
      </span>

      <div
        className='hidden h-5 w-px bg-white/10 sm:block'
        aria-hidden='true'
      />

      {designV1Enabled && (
        <div className='inline-flex rounded-md border border-white/10 bg-black/60 p-0.5'>
          {[
            { value: 'pages', label: 'Pages', icon: LayoutTemplate },
            { value: 'sections', label: 'Sections', icon: Layers },
            { value: 'product', label: 'Product Components', icon: Music2 },
            { value: 'screenshots', label: 'Screenshots', icon: Camera },
          ].map(option => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type='button'
                aria-pressed={mode === option.value}
                onClick={() => onSetMode(option.value as StudioMode)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-2xs font-semibold transition-colors',
                  mode === option.value
                    ? 'bg-white text-black'
                    : 'text-white/70 hover:text-white'
                )}
              >
                <Icon className='h-3 w-3' />
                <span className='hidden lg:inline'>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode === 'pages' ? (
        <>
          <Toggle
            label='Header'
            value={headerMode}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'transparent', label: 'Transparent' },
            ]}
            onChange={onSetHeader}
          />

          <Toggle
            label='Footer'
            value={footerMode}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'minimal', label: 'Minimal' },
            ]}
            onChange={onSetFooter}
          />

          <Toggle
            label='CTA'
            value={ctaMode}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={onSetCta}
          />

          <button
            type='button'
            onClick={onOpenDrawer}
            className='ml-auto inline-flex h-8 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/10'
          >
            <Plus className='h-3.5 w-3.5' />
            Sections ({bodyCount})
          </button>
        </>
      ) : (
        <div className='ml-auto text-xs text-white/45'>
          Internal marketing tooling for previews, captures, and prompts
        </div>
      )}
    </div>
  );
}

interface ToggleProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly onChange: (value: T) => void;
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: ToggleProps<T>) {
  return (
    <div className='flex items-center gap-1.5'>
      <span className='text-2xs font-medium text-white/60'>{label}</span>
      <div className='inline-flex rounded-md border border-white/10 bg-black/60 p-0.5'>
        {options.map(opt => (
          <button
            key={opt.value}
            type='button'
            aria-pressed={opt.value === value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex h-6 items-center rounded px-2.5 text-2xs font-semibold transition-colors',
              opt.value === value
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function groupItemsByCategory(items: readonly DesignStudioItem[]) {
  return items.reduce(
    (groups, item) => {
      const existing = groups[item.category] ?? [];
      groups[item.category] = [...existing, item];
      return groups;
    },
    {} as Partial<Record<DesignStudioCategory, readonly DesignStudioItem[]>>
  );
}

export function DesignStudioWorkspace({
  mode,
}: Readonly<{ mode: StudioMode }>) {
  return (
    <main
      className='min-h-screen bg-[#0b0c0f] px-4 pb-12 pt-[80px] text-white sm:px-6 lg:px-8'
      data-testid={`design-studio-${mode}`}
    >
      {mode === 'sections' ? (
        <SectionStudio />
      ) : mode === 'product' ? (
        <ProductComponentStudio />
      ) : (
        <ScreenshotStudio />
      )}
    </main>
  );
}

function StudioIntro({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  return (
    <div className='mb-6 flex flex-col gap-2'>
      <h1 className='text-2xl font-semibold tracking-[-0.02em]'>{title}</h1>
      <p className='max-w-3xl text-sm leading-6 text-white/55'>{description}</p>
    </div>
  );
}

function ProductComponentStudio() {
  const grouped = groupItemsByCategory(
    DESIGN_STUDIO_ITEMS.filter(item => item.category !== 'sections')
  );
  const categoryOrder: readonly DesignStudioCategory[] = [
    'music-ai',
    'shell-views',
    'components',
  ];

  return (
    <div>
      <StudioIntro
        title='Product Components'
        description='Curated product surfaces for internal marketing: live previews, capture routes, downloadable screenshots, and prompts for placing each component on a page.'
      />
      <div className='space-y-8'>
        {categoryOrder.map(category => {
          const items = grouped[category] ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category} className='space-y-3'>
              <h2 className='text-sm font-semibold text-white/75'>
                {DESIGN_STUDIO_CATEGORY_LABELS[category]}
              </h2>
              <div className='grid gap-4 xl:grid-cols-2'>
                {items.map(item => (
                  <DesignStudioItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SectionStudio() {
  const sectionItems = DESIGN_STUDIO_ITEMS.filter(
    item => item.category === 'sections'
  );
  return (
    <div>
      <StudioIntro
        title='Sections'
        description='Landing-page sections from the shared registry. Use this view to inspect the canonical component, open it in the section checker, and copy placement prompts.'
      />
      <div className='grid gap-4 xl:grid-cols-2'>
        {sectionItems.map(item => (
          <DesignStudioItemCard key={item.id} item={item} compact />
        ))}
      </div>
    </div>
  );
}

function ScreenshotStudio() {
  const publicScenarios = SCREENSHOT_SCENARIOS.filter(
    scenario =>
      scenario.consumers.includes('marketing-export') ||
      DESIGN_STUDIO_SCREENSHOT_SCENARIOS.some(item => item.id === scenario.id)
  );
  return (
    <div>
      <StudioIntro
        title='Screenshots'
        description='Capture-ready screenshots from the existing product screenshot registry. Download existing public exports or open the route before regenerating the catalog.'
      />
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {publicScenarios.map(scenario => (
          <ScreenshotScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>
    </div>
  );
}

function DesignStudioItemCard({
  item,
  compact = false,
}: Readonly<{ item: DesignStudioItem; compact?: boolean }>) {
  return (
    <article
      className='overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]'
      data-testid={`design-studio-item-${item.id}`}
    >
      <div className={compact ? 'max-h-[280px] overflow-hidden' : ''}>
        {item.preview()}
      </div>
      <div className='space-y-3 border-t border-white/10 p-4'>
        <div>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h2 className='text-sm font-semibold'>{item.label}</h2>
              <p className='mt-1 text-xs leading-5 text-white/50'>
                {item.description}
              </p>
            </div>
            <span className='shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/55'>
              {DESIGN_STUDIO_CATEGORY_LABELS[item.category]}
            </span>
          </div>
        </div>

        <div className='flex flex-wrap gap-2'>
          <StudioLinkButton href={item.demoRoute} label='Open Preview' />
          {item.screenshotScenarioIds.map(id => (
            <StudioLinkButton
              key={id}
              href={getDesignStudioScreenshotUrl(id)}
              label='Screenshot'
              download={`${id}.png`}
            />
          ))}
          {item.screenshotScenarioIds.map(id => {
            const publicUrl = getDesignStudioPublicScreenshotUrl(id);
            if (!publicUrl) return null;
            return (
              <StudioLinkButton
                key={`${id}-public`}
                href={publicUrl}
                label='Public Export'
                download
              />
            );
          })}
          <CopyButton value={item.marketingPrompt} label='Copy Prompt' />
          <CopyButton value={item.demoRoute} label='Copy Route' />
        </div>

        <div className='flex flex-wrap gap-1.5'>
          {item.componentPaths.slice(0, 4).map(path => (
            <code
              key={path}
              className='rounded bg-black/35 px-2 py-1 text-[10px] text-white/45'
            >
              {path}
            </code>
          ))}
        </div>
      </div>
    </article>
  );
}

function ScreenshotScenarioCard({
  scenario,
}: Readonly<{ scenario: ScreenshotScenario }>) {
  const catalogUrl = getDesignStudioScreenshotUrl(scenario.id);
  const publicUrl = getDesignStudioPublicScreenshotUrl(scenario.id);
  return (
    <article className='rounded-lg border border-white/10 bg-white/[0.035] p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='truncate text-sm font-semibold'>{scenario.title}</h2>
          <p className='mt-1 truncate text-xs text-white/45'>
            {scenario.route}
          </p>
        </div>
        <span className='rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/55'>
          {scenario.viewport}
        </span>
      </div>
      <div className='mt-3 flex flex-wrap gap-2'>
        <StudioLinkButton href={scenario.route} label='Open Route' />
        <StudioLinkButton
          href={catalogUrl}
          label='Download'
          download={`${scenario.id}.png`}
        />
        {publicUrl ? (
          <StudioLinkButton href={publicUrl} label='Public Export' download />
        ) : null}
        <CopyButton value={scenario.route} label='Copy Route' />
      </div>
    </article>
  );
}

function StudioLinkButton({
  href,
  label,
  download,
}: Readonly<{
  href: string;
  label: string;
  download?: boolean | string;
}>) {
  return (
    <a
      href={href}
      download={download}
      target={download ? undefined : '_blank'}
      rel={download ? undefined : 'noreferrer'}
      className='inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white'
    >
      <ExternalLink className='h-3.5 w-3.5' />
      {label}
    </a>
  );
}

function CopyButton({
  value,
  label,
}: Readonly<{ value: string; label: string }>) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  return (
    <button
      type='button'
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopyState('copied');
        } catch {
          setCopyState('failed');
        }
        window.setTimeout(() => setCopyState('idle'), 1200);
      }}
      className='inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white'
    >
      {copyState === 'copied' ? (
        <Check className='h-3.5 w-3.5' />
      ) : (
        <Copy className='h-3.5 w-3.5' />
      )}
      {copyState === 'copied'
        ? 'Copied'
        : copyState === 'failed'
          ? 'Copy Failed'
          : label}
    </button>
  );
}

interface SectionDrawerProps {
  readonly bodyIds: readonly string[];
  readonly onAdd: (id: string) => void;
  readonly onRemove: (idx: number) => void;
  readonly onMove: (idx: number, dir: -1 | 1) => void;
  readonly onClose: () => void;
}

function SectionDrawer({
  bodyIds,
  onAdd,
  onRemove,
  onMove,
  onClose,
}: SectionDrawerProps) {
  // Escape closes the drawer — standard dialog behavior.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className='fixed right-0 top-0 z-[60] flex h-screen w-full max-w-[380px] flex-col border-l border-white/10 bg-black text-white shadow-2xl'
      role='dialog'
      aria-modal='true'
      aria-label='Body section composer'
    >
      <div className='flex h-[56px] items-center justify-between border-b border-white/10 px-4'>
        <span className='text-sm font-semibold'>Body sections</span>
        <button
          type='button'
          onClick={onClose}
          aria-label='Close drawer'
          className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-transparent text-white/70 hover:bg-white/5 hover:text-white'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        <section className='border-b border-white/10 px-4 py-4'>
          <div className='mb-2 text-2xs font-semibold uppercase tracking-wider text-white/50'>
            Current order ({bodyIds.length})
          </div>
          {bodyIds.length === 0 ? (
            <p className='text-xs text-white/50'>
              No body sections. Pick from the categories below to compose a
              page.
            </p>
          ) : (
            <ul className='flex flex-col gap-1.5'>
              {bodyIds.map((id, idx) => {
                const variant = getSectionById(id);
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: position in the ordered body is the identity here — a section can repeat, and reorder mutates the URL which forces a full remount anyway.
                    key={`${id}-${idx}`}
                    className='flex items-center gap-2 rounded border border-white/10 bg-white/[0.03] px-2 py-1.5'
                  >
                    <span className='flex-1 truncate text-xs text-white'>
                      {variant?.label ?? id}
                    </span>
                    <button
                      type='button'
                      onClick={() => onMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label='Move up'
                      className='inline-flex h-6 w-6 items-center justify-center rounded text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-30'
                    >
                      <ChevronUp className='h-3.5 w-3.5' />
                    </button>
                    <button
                      type='button'
                      onClick={() => onMove(idx, 1)}
                      disabled={idx === bodyIds.length - 1}
                      aria-label='Move down'
                      className='inline-flex h-6 w-6 items-center justify-center rounded text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-30'
                    >
                      <ChevronDown className='h-3.5 w-3.5' />
                    </button>
                    <button
                      type='button'
                      onClick={() => onRemove(idx)}
                      aria-label='Remove section'
                      className='inline-flex h-6 w-6 items-center justify-center rounded text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200'
                    >
                      <X className='h-3.5 w-3.5' />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {BODY_CATEGORIES.map(category => {
          const variants = getSectionsByCategory(category);
          if (variants.length === 0) return null;
          return (
            <section
              key={category}
              className='border-b border-white/10 px-4 py-4'
            >
              <div className='mb-2 text-2xs font-semibold uppercase tracking-wider text-white/50'>
                {SECTION_CATEGORY_LABELS[category]}
              </div>
              <ul className='flex flex-col gap-1'>
                {variants.map(variant => (
                  <li key={variant.id}>
                    <button
                      type='button'
                      onClick={() => onAdd(variant.id)}
                      className='flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-white/85 hover:bg-white/[0.04] hover:text-white'
                    >
                      <span className='flex-1 truncate'>{variant.label}</span>
                      <Plus className='h-3 w-3 shrink-0 text-white/40' />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
