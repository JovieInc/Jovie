import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChannelIcon, ContactGlyph } from './ContactIcons';

// The icons are decorative: the drawer rows that render them carry the
// accessible name, so each glyph must stay hidden from assistive tech.
describe('ContactIcons', () => {
  it('renders the contact glyph as a hidden, current-colour icon', async () => {
    const { container } = render(
      <button type='button' aria-label='Contact Tim White'>
        <ContactGlyph />
      </button>
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveClass('h-4', 'w-4');
    expect(
      screen.getByRole('button', { name: 'Contact Tim White' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('draws a distinct glyph for each channel type', async () => {
    const { container } = render(
      <ul>
        {(['phone', 'sms', 'email'] as const).map(type => (
          <li key={type} data-testid={`channel-${type}`}>
            <a href={`#${type}`}>
              <ChannelIcon type={type} />
              <span>{type}</span>
            </a>
          </li>
        ))}
      </ul>
    );
    const shapes = (['phone', 'sms', 'email'] as const).map(type => {
      const svg = within(screen.getByTestId(`channel-${type}`))
        .getByRole('link')
        .querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      return Array.from(svg?.querySelectorAll('path') ?? [])
        .map(path => path.getAttribute('d'))
        .join('|');
    });
    expect(new Set(shapes).size).toBe(3);
    expect(screen.getByRole('link', { name: 'sms' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the glyphs hidden right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <a href='#email'>
          <ChannelIcon type='email' />
          <span>البريد الإلكتروني</span>
        </a>
      </div>
    );
    expect(
      screen.getByRole('link', { name: 'البريد الإلكتروني' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
