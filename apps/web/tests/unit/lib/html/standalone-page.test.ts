import { describe, expect, it } from 'vitest';
import { renderStandalonePage } from '@/lib/html/standalone-page';

describe('renderStandalonePage', () => {
  it('renders escaped title and message with design tokens', () => {
    const html = renderStandalonePage({
      title: "You're Subscribed!",
      message: 'Updates <enabled>',
      tone: 'success',
    });

    expect(html).toContain('You&#039;re Subscribed!');
    expect(html).toContain('Updates &lt;enabled&gt;');
    expect(html).toContain('color-scheme: light dark');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('--page-bg: #06070a');
    expect(html).toContain('data-tone="success"');
    expect(html).toContain('DM Sans');
    expect(html).toContain('Satoshi');
  });

  it('renders error tone icon markup', () => {
    const html = renderStandalonePage({
      title: 'Invalid Link',
      message: 'This opt-in link is invalid or expired.',
      tone: 'error',
    });

    expect(html).toContain('data-tone="error"');
    expect(html).toContain('<line x1="15" y1="9" x2="9" y2="15"></line>');
  });

  it('omits tone attribute for neutral pages', () => {
    const html = renderStandalonePage({
      title: 'Too Many Requests',
      message: 'Please try again later.',
    });

    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain('<html lang="en" data-tone=');
    expect(html).not.toContain('class="status"');
  });
});
