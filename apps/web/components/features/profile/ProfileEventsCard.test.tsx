import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileEventsCard } from './ProfileEventsCard';

const ACCENT = { accent: 'pulse', strength: 'text' } as const;

describe('ProfileEventsCard', () => {
  it('states plainly that there are no events, with no invented CTA', async () => {
    const { container } = render(
      <ProfileEventsCard accent={ACCENT} hasEvents={false} />
    );

    const card = screen.getByTestId('profile-primary-tab-events-empty');
    expect(card).toHaveAccessibleName('Events');
    expect(card).toHaveAttribute('data-accent', 'pulse');
    expect(
      within(card).getByRole('heading', { name: 'No upcoming events' })
    ).toBeInTheDocument();
    expect(within(card).getByText('New dates will appear here.')).toBeVisible();
    expect(within(card).queryByRole('link')).toBeNull();
    expect(within(card).queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('hosts the event list when dates exist', async () => {
    const { container } = render(
      <ProfileEventsCard accent={ACCENT} hasEvents>
        <ul>
          <li>The Echo</li>
        </ul>
      </ProfileEventsCard>
    );

    const card = screen.getByTestId('profile-events-card');
    expect(within(card).getByText('The Echo')).toBeInTheDocument();
    expect(within(card).queryByRole('heading')).toBeNull();
    expect(screen.queryByTestId('profile-primary-tab-events-empty')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders only the provided alerts opt-in under the empty state', async () => {
    const { container } = render(
      <ProfileEventsCard
        accent={ACCENT}
        hasEvents={false}
        emptyAction={
          <a href='https://jov.ie/tim/alerts'>Turn on event alerts</a>
        }
      >
        <p>Hidden list</p>
      </ProfileEventsCard>
    );

    const card = screen.getByTestId('profile-primary-tab-events-empty');
    expect(
      within(card).getByRole('link', { name: 'Turn on event alerts' })
    ).toBeInTheDocument();
    expect(within(card).queryByText('Hidden list')).toBeNull();
    await expectNoA11yViolations(container);
  });

  // Walk 2026-11-09 (jov.ie/tim): the empty card reserved 17rem under a short
  // message, a large blank gradient with a corner glow that read as a smear.
  it('renders the empty state as a compact card with one glow and a rim', () => {
    render(<ProfileEventsCard accent={ACCENT} hasEvents={false} />);
    expect(screen.getByTestId('profile-primary-tab-events-empty')).toHaveClass(
      'profile-mode-card',
      'profile-mode-card--compact'
    );

    const css = readFileSync(
      join(process.cwd(), 'styles', 'design-system.css'),
      'utf8'
    );
    const compact = css.slice(
      css.indexOf('.profile-mode-card.profile-mode-card--compact {')
    );
    expect(compact).toMatch(/^[^}]*--profile-mode-card-min-height:\s*0;/);
    expect(compact).toMatch(/^[^}]*box-shadow:\s*inset[^;]*hairline/);
    const glow = compact.slice(compact.indexOf('::before'));
    expect(glow.slice(0, glow.indexOf('}'))).not.toContain('0% 100%');
  });

  it('keeps the reserved height on the card that lists dates', () => {
    render(
      <ProfileEventsCard accent={ACCENT} hasEvents>
        <p>The Echo</p>
      </ProfileEventsCard>
    );
    expect(screen.getByTestId('profile-events-card')).not.toHaveClass(
      'profile-mode-card--compact'
    );
  });
});
