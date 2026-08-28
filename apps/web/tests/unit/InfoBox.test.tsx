import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from '@/components/molecules/InfoBox';

const INFO_BOX_SOURCE = readFileSync(
  resolve(process.cwd(), 'components/molecules/InfoBox.tsx'),
  'utf8'
);

const RAW_PALETTE_UTILITY =
  /(?:dark:)?(?:bg|border|text)-(?:blue|yellow|green|red)-\d+(?:\/\d+)?/g;
const BLUE_HOVER_UTILITY =
  /(?:group-)?hover:(?:bg|border|text)-blue-\d+(?:\/\d+)?/g;
const STATE_GEOMETRY_UTILITY =
  /(?:group-)?(?:hover|focus|focus-visible|active|disabled):(?:-?(?:translate-[xy]|scale)|(?:p|m)[trblxy]?|h|w|min-h|min-w|max-h|max-w|inset|top|right|bottom|left)-/g;

const VARIANT_CLASSES = {
  info: ['border-info/30', 'bg-info-subtle'],
  warning: ['border-warning/30', 'bg-warning-subtle'],
  success: ['border-success/30', 'bg-success-subtle'],
  error: ['border-error/30', 'bg-error-subtle'],
} as const;

function findMatches(source: string, pattern: RegExp): string[] {
  return source.match(pattern) ?? [];
}

describe('InfoBox', () => {
  it.each(
    Object.entries(VARIANT_CLASSES)
  )('renders the %s variant with semantic color ownership and stable geometry', (variant, expectedClasses) => {
    render(
      <InfoBox
        title={`${variant} title`}
        variant={variant as keyof typeof VARIANT_CLASSES}
      >
        <span>{variant} content</span>
      </InfoBox>
    );

    const content = screen.getByText(`${variant} content`);
    const contentContainer = content.parentElement;
    const container = contentContainer?.parentElement;

    expect(container).toHaveClass(
      'rounded-lg',
      'border',
      'p-4',
      ...expectedClasses
    );
    expect(screen.getByRole('heading')).toHaveClass(
      'mb-2',
      'font-semibold',
      'text-primary-token'
    );
    expect(contentContainer).toHaveClass('text-sm', 'text-secondary-token');
  });

  it('renders title and content with the info variant by default', () => {
    render(
      <InfoBox title='Information'>
        <p>Test content</p>
      </InfoBox>
    );

    const container = screen.getByText('Information').closest('div');
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(container).toHaveClass('bg-info-subtle', 'border-info/30');
  });

  it('renders without a title when omitted', () => {
    render(
      <InfoBox>
        <p>Content only</p>
      </InfoBox>
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Content only')).toBeInTheDocument();
  });

  it('merges custom className into the container', () => {
    render(
      <InfoBox className='custom-info'>
        <p>Custom content</p>
      </InfoBox>
    );

    // Find the outer container (has rounded-lg border p-4 from InfoBox)
    const container = screen
      .getByText('Custom content')
      .closest('div')?.parentElement;
    expect(container).toHaveClass('custom-info');
  });

  it('rejects raw palette utilities and proves the detector with deliberate-red fixtures', () => {
    const rawSurface = ['bg', 'blue', '50'].join('-');
    const rawDarkText = `dark:${['text', 'red', '100'].join('-')}`;

    expect(
      findMatches(`${rawSurface} ${rawDarkText}`, RAW_PALETTE_UTILITY)
    ).toHaveLength(2);
    expect(findMatches(INFO_BOX_SOURCE, RAW_PALETTE_UTILITY)).toEqual([]);
  });

  it('rejects blue hover drift and proves the detector with a deliberate-red fixture', () => {
    const blueHover = `hover:${['bg', 'blue', '600'].join('-')}`;

    expect(findMatches(blueHover, BLUE_HOVER_UTILITY)).toHaveLength(1);
    expect(findMatches(INFO_BOX_SOURCE, BLUE_HOVER_UTILITY)).toEqual([]);
  });

  it('rejects state-driven geometry drift and proves the detector with deliberate-red fixtures', () => {
    const driftingStates =
      'hover:-translate-y-0.5 focus-visible:p-5 active:scale-95';

    expect(findMatches(driftingStates, STATE_GEOMETRY_UTILITY)).toHaveLength(3);
    expect(findMatches(INFO_BOX_SOURCE, STATE_GEOMETRY_UTILITY)).toEqual([]);
  });
});
