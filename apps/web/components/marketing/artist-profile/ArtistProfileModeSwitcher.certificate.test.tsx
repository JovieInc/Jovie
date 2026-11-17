import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import meta, {
  EmptyModes,
  LongContentIntro,
  PartialCompactNoCaptions,
  RtlArabic,
} from './ArtistProfileModeSwitcher.states.stories';

type Props = ComponentProps<typeof ArtistProfileModeSwitcher>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

const ADAPTIVE = ARTIST_PROFILE_COPY.adaptive;

// Rendered-state, keyboard and axe coverage; hydration and source contracts
// live in ArtistProfileModeSwitcher.test.tsx.
describe('ArtistProfileModeSwitcher states', () => {
  it('moves between modes with the arrow keys and keeps the panel axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArtistProfileModeSwitcher adaptive={ADAPTIVE} />
    );
    const [first, second] = ADAPTIVE.modes;
    await user.click(screen.getByRole('tab', { name: first.label }));
    await user.keyboard('{ArrowRight}');
    const secondTab = screen.getByRole('tab', { name: second.label });
    expect(secondTab).toHaveFocus();
    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('tabpanel', { name: second.label })).getByText(
        second.headline
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when there are no modes', () => {
    const { container } = render(
      <ArtistProfileModeSwitcher {...props(EmptyModes)} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the compact switcher with no heading, body or caption', async () => {
    const { container } = render(
      <ArtistProfileModeSwitcher {...props(PartialCompactNoCaptions)} />
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps a long two-line headline and mode copy whole', async () => {
    const { container } = render(
      <ArtistProfileModeSwitcher {...props(LongContentIntro)} />
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('line-clamp-2');
    expect(heading).toHaveTextContent('and every listener who opens it');
    expect(
      screen.getAllByText(/This mode headline carries extra words/).length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileModeSwitcher {...props(RtlArabic)} />
      </div>
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'يتغير مع كل إصدار'
    );
    await expectNoA11yViolations(container);
  });
});
