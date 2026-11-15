import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InspectorEmpty } from './InspectorEmpty';
import { InspectorRow } from './InspectorRow';
import { InspectorSection } from './InspectorSection';

const CREDITS = Array.from({ length: 12 }, (_, i) => `Credit ${i + 1}`);

describe('InspectorSection', () => {
  it('renders a titled section with its body, axe-clean', async () => {
    const { container } = render(
      <InspectorSection title='Assets' data-testid='assets-section'>
        <InspectorEmpty message='No assets for this object.' />
      </InspectorSection>
    );
    const section = screen.getByTestId('assets-section');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveTextContent('Assets');
    expect(section).toHaveTextContent('No assets for this object.');
    await expectNoA11yViolations(container);
  });

  it('omits the heading when no title is given', async () => {
    const { container } = render(
      <InspectorSection data-testid='untitled' className='pt-2'>
        <InspectorRow label='ISRC' value='USRC17607839' />
      </InspectorSection>
    );
    const section = screen.getByTestId('untitled');
    expect(section).toHaveClass('space-y-2', 'pt-2');
    expect(section.firstElementChild).toHaveTextContent('ISRCUSRC17607839');
    await expectNoA11yViolations(container);
  });

  it('keeps a long list of rows and RTL copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InspectorSection title='الأصول'>
          {CREDITS.map(label => (
            <InspectorRow
              key={label}
              label={label}
              value='Additional production and mixing'
            />
          ))}
        </InspectorSection>
      </div>
    );
    expect(screen.getByText('الأصول')).toBeInTheDocument();
    expect(
      screen.getAllByText('Additional production and mixing')
    ).toHaveLength(12);
    await expectNoA11yViolations(container);
  });
});
