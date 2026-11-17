import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SocialLinksCell } from './SocialLinksCell';

const LINKS = [
  { id: 'l1', url: 'https://instagram.com/jovie', platform: 'instagram' },
  {
    id: 'l2',
    url: 'https://open.spotify.com/artist/abc',
    platform: 'spotify',
    displayText: 'Jovie Live',
  },
  { id: 'l3', url: 'https://tiktok.com/@jovie', platform: 'tiktok' },
  { id: 'l4', url: 'https://youtube.com/@jovie', platform: 'youtube' },
];

describe('SocialLinksCell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens a link in a new tab without an opener', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { container } = render(<SocialLinksCell links={LINKS.slice(0, 1)} />);

    await user.click(screen.getByRole('button'));
    expect(open).toHaveBeenCalledWith(
      'https://instagram.com/jovie',
      '_blank',
      'noopener,noreferrer'
    );
    await expectNoA11yViolations(container);
  });

  it('caps visible links at maxLinks and counts all of them', async () => {
    const { container } = render(
      <SocialLinksCell links={LINKS} maxLinks={2} />
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByTitle('4 social links')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('filters by inferred platform type', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { container } = render(
      <SocialLinksCell links={LINKS} filterPlatformType={['MUSIC']} />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/abc',
      '_blank',
      'noopener,noreferrer'
    );
    await expectNoA11yViolations(container);
  });

  it.each([
    [null, undefined],
    [[], undefined],
    [LINKS.slice(0, 1), 'music'],
  ])('shows a dash when nothing matches (%j, %s)', async (links, filter) => {
    const { container } = render(
      <SocialLinksCell links={links} filterPlatformType={filter} />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders links with missing platform data in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SocialLinksCell
          links={[
            { id: 'p1', url: 'https://example.com/press-kit', platform: null },
            { id: 'p2', url: 'https://instagram.com/jovie' },
          ]}
        />
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
