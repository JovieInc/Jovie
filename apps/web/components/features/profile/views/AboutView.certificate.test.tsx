import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AboutView } from './AboutView';
import {
  ABOUT_EMPTY_ARTIST,
  ABOUT_LONG_ARTIST,
  ABOUT_LONG_GENRES,
  ABOUT_RTL_ARTIST,
} from './about-view-state-fixtures';

describe('AboutView certificate', () => {
  it('shows the empty note when nothing is verified', async () => {
    const { container } = render(
      <AboutView artist={ABOUT_EMPTY_ARTIST} genres={[]} contacts={[]} />
    );

    expect(screen.getByText('No information available yet.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps a long bio and genre list whole and axe-clean', async () => {
    const { container } = render(
      <AboutView artist={ABOUT_LONG_ARTIST} genres={ABOUT_LONG_GENRES} />
    );

    expect(
      screen.getByText(ABOUT_LONG_ARTIST.tagline as string)
    ).toBeInTheDocument();
    expect(screen.getByText('Alternative electronic pop')).toBeInTheDocument();
    expect(
      screen.queryByText('No information available yet.')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic bio in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AboutView artist={ABOUT_RTL_ARTIST} genres={['هاوس']} />
      </div>
    );

    expect(
      screen.getByText('منتج وكاتب أغانٍ من لوس أنجلوس.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
