import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorProfileSocialLinks } from './CreatorProfileSocialLinks';

const link = (
  id: string,
  platform: string,
  url: string,
  displayText: string | null = null
) => ({ id, platform, platformType: 'social', url, displayText });

describe('CreatorProfileSocialLinks certificate', () => {
  const open = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('open', open);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    open.mockReset();
  });

  it('shows a dash when the creator has no links', async () => {
    const { container, rerender } = render(
      <CreatorProfileSocialLinks socialLinks={[]} />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);

    rerender(<CreatorProfileSocialLinks socialLinks={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens a link in a new tab without an opener', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CreatorProfileSocialLinks
        socialLinks={[link('ig', 'instagram', 'https://instagram.com/artist')]}
      />
    );

    const pill = screen.getByRole('button');
    expect(pill).toHaveAccessibleName(/instagram/);
    await user.click(pill);
    expect(open).toHaveBeenCalledWith(
      'https://instagram.com/artist',
      '_blank',
      'noopener,noreferrer'
    );
    await expectNoA11yViolations(container);
  });

  it('caps the rail at three pills and counts every link', async () => {
    const user = userEvent.setup();
    const links = [
      link('ig', 'instagram', 'https://instagram.com/one'),
      link('tt', 'tiktok', 'https://tiktok.com/@two'),
      link('yt', 'youtube', 'https://youtube.com/@three'),
      link('x', 'x', 'https://x.com/four'),
      link('sc', 'soundcloud', 'https://soundcloud.com/five'),
    ];
    const { container } = render(
      <CreatorProfileSocialLinks socialLinks={links} />
    );

    const pills = screen.getAllByRole('button');
    expect(pills).toHaveLength(3);
    expect(screen.getByTitle('5 social links')).toHaveTextContent('5');
    await user.click(pills[2]);
    expect(open).toHaveBeenCalledWith(
      'https://youtube.com/@three',
      '_blank',
      'noopener,noreferrer'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CreatorProfileSocialLinks
          socialLinks={[
            link('ig', 'instagram', 'https://instagram.com/artist', 'فنان'),
            link('tt', 'tiktok', 'https://tiktok.com/@artist'),
          ]}
        />
      </div>
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
