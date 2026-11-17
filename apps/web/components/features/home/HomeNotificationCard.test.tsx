import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeNotificationCard } from './HomeNotificationCard';
import { HOME_AUTO_NOTIFY_CONTENT } from './home-page-content';

describe('HomeNotificationCard', () => {
  it('renders the sender, time and release line from the home content', async () => {
    const { container } = render(<HomeNotificationCard />);

    expect(
      screen.getByText(HOME_AUTO_NOTIFY_CONTENT.notificationFrom)
    ).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(
      screen.getByText(HOME_AUTO_NOTIFY_CONTENT.notificationBody)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('paints the app icon with the on-media tokens, not raw colours', () => {
    const { container } = render(<HomeNotificationCard />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const rect = container.querySelector('rect');
    const glyph = container.querySelector('text');
    expect(rect).toHaveClass('fill-on-media/90');
    expect(rect).not.toHaveAttribute('fill');
    expect(glyph).toHaveClass('fill-ink-on-media');
    expect(glyph).not.toHaveAttribute('fill');
    expect(glyph).toHaveTextContent('J');
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomeNotificationCard />
      </div>
    );

    expect(
      screen.getByText(HOME_AUTO_NOTIFY_CONTENT.notificationBody)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
