import { getSectionById } from '@/lib/sections/registry';

export interface SectionVariantPreviewProps {
  /** Registry id of the section variant to render. */
  readonly variantId: string;
}

/**
 * Storybook host for landing-page section variants. Renders the registry
 * entry's demo `render()` output so stories always reflect what
 * `/exp/page-builder` and `/exp/component-checker` compose.
 */
export function SectionVariantPreview({
  variantId,
}: Readonly<SectionVariantPreviewProps>) {
  const variant = getSectionById(variantId);

  if (!variant) {
    return (
      <p className='p-6 text-sm text-red-500'>
        Unknown section variant: {variantId}
      </p>
    );
  }

  return (
    <div data-testid={`section-variant-${variant.id}`}>{variant.render()}</div>
  );
}
