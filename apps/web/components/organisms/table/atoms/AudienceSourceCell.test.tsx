import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceSourceCell } from './AudienceSourceCell';

function renderCell(node: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>);
}

describe('AudienceSourceCell', () => {
  it('names a known referrer and shows it in a tooltip on hover', async () => {
    const user = userEvent.setup();
    const { container } = renderCell(
      <AudienceSourceCell
        referrerHistory={[
          { url: 'https://jov.ie/artist' },
          { url: 'https://www.instagram.com/p/1' },
        ]}
      />
    );

    const source = screen.getByRole('img', { name: 'Instagram' });
    await expectNoA11yViolations(container);
    await user.hover(source);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Instagram');
  });

  it('prefers an action source over UTM and referrers', async () => {
    const { container } = renderCell(
      <AudienceSourceCell
        referrerHistory={[{ url: 'https://instagram.com/' }]}
        utmParams={{ source: 'newsletter', medium: 'email' }}
        actions={[{ label: 'Scanned', sourceLabel: 'Tour poster QR' }]}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Tour poster QR' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('formats UTM source and medium before referrers', () => {
    renderCell(
      <AudienceSourceCell
        referrerHistory={[{ url: 'https://instagram.com/' }]}
        utmParams={{ source: 'newsletter', medium: 'email' }}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Newsletter / email' })
    ).toBeInTheDocument();
  });

  it.each([
    [[], 'Direct'],
    [[{ url: 'https://jovie.fm/x' }], 'Direct'],
    [[{ url: 'not a url' }], 'not a url'],
    [[{ url: 'https://example.org/' }], 'example.org'],
  ])('resolves %j to %s', async (referrerHistory, name) => {
    const { container } = renderCell(
      <AudienceSourceCell referrerHistory={referrerHistory} />
    );

    expect(screen.getByRole('img', { name })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in an RTL document', async () => {
    const { container } = renderCell(
      <div dir='rtl'>
        <AudienceSourceCell referrerHistory={[{ url: 'https://x.com/a' }]} />
      </div>
    );

    expect(screen.getByRole('img', { name: 'X' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
