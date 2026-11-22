import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FooterLink } from './FooterLink';

describe('FooterLink', () => {
  it('renders an internal link without a new-tab target', async () => {
    const { container } = render(
      <FooterLink href='/privacy'>Privacy Policy</FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(link).toHaveAttribute('href', '/privacy');
    expect(link).not.toHaveAttribute('target');
    expect(link.className).toContain('text-on-media/70');
    expect(link.className).not.toContain('text-white');
    await expectNoA11yViolations(container);
  });

  it('forces a new tab with noopener noreferrer on external links', async () => {
    const { container } = render(
      <FooterLink href='https://status.jov.ie' rel='author'>
        Status
      </FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Status' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('author noopener noreferrer');
    await expectNoA11yViolations(container);
  });

  it('uses the light tone token palette and an empty label stays axe-clean', async () => {
    const { container } = render(
      <FooterLink href='/terms' tone='light' aria-label='Terms' />
    );
    const link = screen.getByRole('link', { name: 'Terms' });
    expect(link.className).toContain('text-secondary-token');
    await expectNoA11yViolations(container);
  });

  it('forwards click handlers and keyboard activation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <FooterLink href='/terms' onClick={onClick}>
        Terms
      </FooterLink>
    );
    const link = screen.getByRole('link', { name: 'Terms' });
    await user.click(link);
    link.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
