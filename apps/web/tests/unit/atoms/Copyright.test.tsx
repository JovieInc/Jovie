import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Copyright } from '@/components/atoms/Copyright';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/constants/app', () => ({
  getCopyrightText: (year?: number) => `© ${year ?? 2026} Jovie`,
}));

describe('Copyright', () => {
  it('renders copyright text with default year', () => {
    render(<Copyright />);
    expect(screen.getByText('© 2026 Jovie')).toBeInTheDocument();
  });

  it('renders copyright text with custom year', () => {
    render(<Copyright year={2024} />);
    expect(screen.getByText('© 2024 Jovie')).toBeInTheDocument();
  });

  it('renders as a paragraph element', () => {
    render(<Copyright />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el.tagName).toBe('P');
  });

  it('applies dark variant classes by default', () => {
    render(<Copyright />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el).toHaveClass('text-white/70');
  });

  it('applies light variant classes', () => {
    render(<Copyright variant='light' />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el).toHaveClass('text-tertiary-token');
  });

  it('applies base styles', () => {
    render(<Copyright />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el).toHaveClass('text-sm');
    expect(el).toHaveClass('font-medium');
    expect(el).toHaveClass('tracking-tight');
  });

  it('applies custom className', () => {
    render(<Copyright className='mt-4' />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el).toHaveClass('mt-4');
  });

  it('applies custom style', () => {
    render(<Copyright style={{ opacity: 0.5 }} />);
    const el = screen.getByText('© 2026 Jovie');
    expect(el).toHaveStyle({ opacity: 0.5 });
  });

  it('passes a11y checks', async () => {
    const { container } = render(<Copyright />);
    await expectNoA11yViolations(container);
  });
});
