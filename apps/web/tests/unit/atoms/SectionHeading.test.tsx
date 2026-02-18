import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from '@/components/atoms/SectionHeading';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

describe('SectionHeading', () => {
  it('renders children text', () => {
    render(<SectionHeading>Hello World</SectionHeading>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders as h2 by default', () => {
    render(<SectionHeading>Default Heading</SectionHeading>);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Default Heading' })
    ).toBeInTheDocument();
  });

  it.each([
    1, 2, 3, 4, 5, 6,
  ] as const)('renders correct heading level h%i', level => {
    render(<SectionHeading level={level}>Heading {level}</SectionHeading>);
    const heading = screen.getByRole('heading', { level });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe(`H${level}`);
  });

  it('applies center alignment class by default', () => {
    render(<SectionHeading>Centered</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Centered' });
    expect(heading).toHaveClass('text-center');
  });

  it('applies left alignment class', () => {
    render(<SectionHeading align='left'>Left</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Left' });
    expect(heading).toHaveClass('text-left');
  });

  it('applies right alignment class', () => {
    render(<SectionHeading align='right'>Right</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Right' });
    expect(heading).toHaveClass('text-right');
  });

  it('applies lg size classes by default', () => {
    render(<SectionHeading>Large</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Large' });
    expect(heading).toHaveClass('text-2xl');
  });

  it.each([
    'sm',
    'md',
    'lg',
    'xl',
  ] as const)('applies size classes for size=%s', size => {
    render(<SectionHeading size={size}>Sized</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Sized' });
    expect(heading.className).toBeTruthy();
  });

  it('applies a custom id attribute', () => {
    render(<SectionHeading id='my-section'>With ID</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'With ID' });
    expect(heading).toHaveAttribute('id', 'my-section');
  });

  it('applies custom className', () => {
    render(<SectionHeading className='extra-class'>Styled</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Styled' });
    expect(heading).toHaveClass('extra-class');
  });

  it('applies base font and tracking styles', () => {
    render(<SectionHeading>Base Styles</SectionHeading>);
    const heading = screen.getByRole('heading', { name: 'Base Styles' });
    expect(heading).toHaveClass('font-bold');
    expect(heading).toHaveClass('tracking-tight');
    expect(heading).toHaveClass('text-primary-token');
  });

  it('passes a11y checks', async () => {
    const { container } = render(
      <SectionHeading level={2} id='a11y-test'>
        Accessible Heading
      </SectionHeading>
    );
    await expectNoA11yViolations(container);
  });
});
