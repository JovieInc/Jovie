// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, loading, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

function setClipboard(value: Clipboard | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

describe('HomepageCertifiedSections', () => {
  it('renders the locked connected and relationships sections without unsupported proof', () => {
    render(<HomepageCertifiedSections />);

    expect(
      screen.queryByTestId('marketing-section-logo-cloud')
    ).not.toBeInTheDocument();

    const sections = screen.getAllByTestId('marketing-section-feature-split');
    expect(sections).toHaveLength(2);
    expect(
      sections.map(section => section.getAttribute('data-marketing-occurrence'))
    ).toEqual(['connected', 'relationships']);

    const connected = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-connected"]'
    )!;
    expect(connected).toHaveAttribute('data-marketing-variant', 'editorial');
    expect(connected).toHaveAttribute('data-rhythm', 'product');
    expect(connected).toHaveTextContent('ONE LIVING PROFILE');
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].headline
    );
    expect(connected).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[0].body
    );
    expect(connected.querySelector('.ap-phone-frame')).toBeNull();
    expect(connected.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/generated/homepage-identity-optical-v1.webp'
    );
    expect(connected.querySelector('img')).toHaveAttribute(
      'alt',
      'A conceptual photographic assembly of a profile identity'
    );

    const relationships = document.querySelector<HTMLElement>(
      '[data-homepage-testid="homepage-section-relationships"]'
    )!;
    expect(relationships).toHaveAttribute('data-rhythm', 'text');
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].headline
    );
    expect(relationships).toHaveTextContent(
      HOMEPAGE_LAUNCH_COPY.certified.sections[1].body
    );
    expect(relationships.querySelectorAll('img')).toHaveLength(0);
    expect(within(relationships).getByRole('list')).toHaveAttribute(
      'aria-label',
      'Relationships'
    );

    const outcomes = within(relationships).getAllByRole('listitem');
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map(outcome => outcome.textContent)).toEqual([
      expect.stringContaining('Be found. Be understood.'),
      expect.stringContaining('Know who cares.'),
      expect.stringContaining('Built around who you are.'),
    ]);
    expect(
      outcomes.map(outcome => outcome.querySelector('span')?.textContent)
    ).toEqual(['01', '02', '03']);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('HomepageClose', () => {
  it('renders the locked close actions and focuses the hero search', () => {
    render(
      <>
        <input id='homepage-name-search' aria-label='Search your name' />
        <HomepageClose />
      </>
    );

    const section = screen.getByRole('region', {
      name: HOMEPAGE_LAUNCH_COPY.certified.close.headline,
    });
    expect(section).toHaveAttribute(
      'data-marketing-variant',
      'editorial-search'
    );
    expect(section).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageClose.tsx'
    );
    expect(section).toHaveAttribute('data-homepage-testid', 'homepage-close');
    expect(section).toHaveAttribute('data-rhythm', 'close');
    expect(
      within(section).getByRole('heading', {
        level: 2,
        name: HOMEPAGE_LAUNCH_COPY.certified.close.headline,
      })
    ).toBeInTheDocument();
    expect(within(section).queryByRole('combobox')).not.toBeInTheDocument();

    const profileCta = screen.getByTestId('homepage-close-profile-cta');
    expect(profileCta).toHaveAttribute('href', '#homepage-name-search');
    expect(profileCta).toHaveAttribute('data-size', 'marketing');
    expect(profileCta).toHaveAttribute('data-variant', 'primary');

    const copyButton = screen.getByRole('button', {
      name: 'Copy agent onboarding link',
    });
    expect(copyButton).toHaveTextContent('Onboard your agent');
    fireEvent.click(profileCta);
    expect(document.getElementById('homepage-name-search')).toHaveFocus();
  });

  it('announces a successful clipboard write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText } as Clipboard);
    render(<HomepageClose />);

    const button = screen.getByRole('button', {
      name: 'Copy agent onboarding link',
    });
    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveTextContent('Copied'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/cli'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/llms.txt')
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.not.stringContaining('npm install')
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Agent onboarding link copied.'
    );
  });

  it('exposes a selectable multiline fallback when clipboard access fails', async () => {
    setClipboard({
      writeText: vi.fn().mockRejectedValue(new Error('denied')),
    } as Clipboard);
    render(<HomepageClose />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy agent onboarding link' })
    );

    const fallback = await screen.findByRole('textbox', {
      name: 'Agent Onboarding Link',
    });
    expect(fallback.tagName).toBe('TEXTAREA');
    expect((fallback as HTMLTextAreaElement).value).toContain(
      "Use Jovie's read-only public artist context:"
    );
    expect((fallback as HTMLTextAreaElement).value).toContain('/llms.txt');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Clipboard unavailable. Select the onboarding link below.'
    );
  });
});
