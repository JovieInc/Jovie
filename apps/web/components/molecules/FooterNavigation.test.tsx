import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FooterNavigation } from './FooterNavigation';

describe('FooterNavigation', () => {
  it('renders the default legal links inside a labelled nav', async () => {
    const { container } = render(<FooterNavigation />);

    const nav = screen.getByRole('navigation', { name: 'Footer links' });
    const links = within(nav).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['Privacy', 'Terms']);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    expect(nav).toHaveClass('text-xs');
    await expectNoA11yViolations(container);
  });

  it('uses the light type scale and custom links', async () => {
    const { container } = render(
      <FooterNavigation
        variant='light'
        ariaLabel='Legal'
        className='justify-center'
        links={[
          { href: '/legal/privacy', label: 'Privacy' },
          { href: '/legal/cookies', label: 'Cookies' },
        ]}
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Legal' });
    expect(nav).toHaveClass('text-app', 'justify-center');
    expect(screen.getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/legal/cookies'
    );
    await expectNoA11yViolations(container);
  });

  it('moves keyboard focus through each link in order', async () => {
    const user = userEvent.setup();
    render(
      <FooterNavigation
        links={[
          { href: '/legal/privacy', label: 'Privacy' },
          { href: '/legal/terms', label: 'Terms' },
        ]}
      />
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveFocus();
  });

  it('renders an empty nav when the owner passes no links', async () => {
    const { container } = render(<FooterNavigation links={[]} />);

    const nav = screen.getByRole('navigation', { name: 'Footer links' });
    expect(within(nav).queryAllByRole('link')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL labels axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FooterNavigation
          ariaLabel='روابط التذييل'
          links={[
            { href: '/legal/privacy', label: 'الخصوصية' },
            { href: '/legal/dmca', label: 'Copyright and DMCA Notices' },
          ]}
        />
      </div>
    );

    expect(screen.getByRole('link', { name: 'الخصوصية' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Copyright and DMCA Notices' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
