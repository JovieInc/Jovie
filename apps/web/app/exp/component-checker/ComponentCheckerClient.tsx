'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import {
  getCanonicalForCategory,
  getSectionById,
  getSectionsByCategory,
  SECTION_CATEGORIES_ORDERED,
  SECTION_CATEGORY_LABELS,
  SECTION_REGISTRY,
  type SectionCategory,
  type SectionStatus,
  type SectionVariant,
} from '@/lib/sections/registry';

const STATUS_BADGE: Record<
  SectionStatus,
  { label: string; className: string }
> = {
  canonical: {
    label: 'canonical',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  consolidate: {
    label: 'consolidate',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  orphaned: {
    label: 'orphaned',
    className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  },
};

function pickVariant(idParam: string | null): SectionVariant {
  if (idParam) {
    const found = getSectionById(idParam);
    if (found) return found;
  }
  // Fall back to the canonical variant of the first category.
  const firstCategory = SECTION_CATEGORIES_ORDERED[0];
  const canonical = getCanonicalForCategory(firstCategory);
  return canonical ?? SECTION_REGISTRY[0];
}

export function ComponentCheckerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');

  const variant = useMemo(() => pickVariant(idParam), [idParam]);

  const variantsInCategory = useMemo(
    () => getSectionsByCategory(variant.category),
    [variant.category]
  );

  const navigateTo = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('id', id);
      router.replace(`/exp/component-checker?${params.toString()}`);
    },
    [router, searchParams]
  );

  const navigateCategory = useCallback(
    (category: SectionCategory) => {
      const target = getCanonicalForCategory(category);
      if (target) navigateTo(target.id);
    },
    [navigateTo]
  );

  // Keyboard navigation: ←/→ moves within the current category, Cmd+↑/↓
  // jumps category. Skip when an input or textarea is focused.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const currentVariantIdx = variantsInCategory.findIndex(
        v => v.id === variant.id
      );
      const currentCategoryIdx = SECTION_CATEGORIES_ORDERED.indexOf(
        variant.category
      );

      if (e.key === 'ArrowLeft' && !e.metaKey) {
        e.preventDefault();
        const next = variantsInCategory[currentVariantIdx - 1];
        if (next) navigateTo(next.id);
      } else if (e.key === 'ArrowRight' && !e.metaKey) {
        e.preventDefault();
        const next = variantsInCategory[currentVariantIdx + 1];
        if (next) navigateTo(next.id);
      } else if (e.key === 'ArrowUp' && e.metaKey) {
        e.preventDefault();
        const prevCat = SECTION_CATEGORIES_ORDERED[currentCategoryIdx - 1];
        if (prevCat) navigateCategory(prevCat);
      } else if (e.key === 'ArrowDown' && e.metaKey) {
        e.preventDefault();
        const nextCat = SECTION_CATEGORIES_ORDERED[currentCategoryIdx + 1];
        if (nextCat) navigateCategory(nextCat);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [variant, variantsInCategory, navigateTo, navigateCategory]);

  const status = STATUS_BADGE[variant.status];

  return (
    <div className='relative min-h-screen w-full overflow-x-hidden bg-(--linear-app-content-surface)'>
      <Toolbar
        variant={variant}
        onCategoryChange={navigateCategory}
        onVariantChange={navigateTo}
        variantsInCategory={variantsInCategory}
        status={status}
      />
      <main
        className='w-full pt-[88px]'
        data-testid='component-checker-canvas'
        aria-label={`Preview of ${variant.label}`}
      >
        {/*
          Variants render unmodified — no clamps, no max-widths overlaid.
          The section itself is responsible for its own max-width if it
          needs one. This is intentional so ultra-wide screens see what a
          real ultra-wide visit would see.
        */}
        {variant.render()}
      </main>
    </div>
  );
}

interface ToolbarProps {
  readonly variant: SectionVariant;
  readonly variantsInCategory: readonly SectionVariant[];
  readonly onCategoryChange: (c: SectionCategory) => void;
  readonly onVariantChange: (id: string) => void;
  readonly status: { label: string; className: string };
}

function Toolbar({
  variant,
  variantsInCategory,
  onCategoryChange,
  onVariantChange,
  status,
}: ToolbarProps) {
  return (
    <div
      className='fixed left-4 top-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-white/10 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-3'
      data-testid='component-checker-toolbar'
    >
      <div className='flex items-center gap-2'>
        <label className='sr-only' htmlFor='cc-category'>
          Category
        </label>
        <select
          id='cc-category'
          value={variant.category}
          onChange={e => onCategoryChange(e.target.value as SectionCategory)}
          className='rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-white/40'
        >
          {SECTION_CATEGORIES_ORDERED.map(cat => (
            <option key={cat} value={cat}>
              {SECTION_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>

        <label className='sr-only' htmlFor='cc-variant'>
          Variant
        </label>
        <select
          id='cc-variant'
          value={variant.id}
          onChange={e => onVariantChange(e.target.value)}
          className='max-w-[260px] truncate rounded-md border border-white/15 bg-black/60 px-2 py-1 text-xs font-medium text-white focus:outline-none focus:ring-1 focus:ring-white/40'
        >
          {variantsInCategory.map(v => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className='flex flex-wrap items-center gap-2 text-2xs text-white/60'>
        <span
          className={`inline-flex h-5 items-center rounded-full border px-2 font-semibold uppercase tracking-wider ${status.className}`}
        >
          {status.label}
        </span>
        {variant.canonical && (
          <span className='inline-flex h-5 items-center rounded-full border border-white/15 px-2 font-semibold text-white/80'>
            default
          </span>
        )}
        <code className='font-mono text-2xs text-white/50'>
          {variant.componentPath}
        </code>
        <span className='text-white/30' aria-hidden='true'>
          •
        </span>
        <span className='text-white/60'>←/→ variants · ⌘↑/⌘↓ category</span>
      </div>
    </div>
  );
}
