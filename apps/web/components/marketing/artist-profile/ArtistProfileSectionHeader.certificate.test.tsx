import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';

describe('ArtistProfileSectionHeader certificate', () => {
  it('writes the eyebrow in its own casing, without forced capitals', async () => {
    const { container } = render(
      <ArtistProfileSectionHeader
        eyebrow='Artist Profile'
        headline='Own the fan path from first tap.'
        body='Route every visitor to the next useful action.'
      />
    );

    const eyebrow = screen.getByText('Artist Profile');
    expect(eyebrow).toHaveClass('ap-shell-eyebrow');
    expect(eyebrow.className).not.toMatch(/\buppercase\b/);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Own the fan path from first tap.',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders only the headline when the eyebrow and lead are absent', async () => {
    const { container } = render(
      <ArtistProfileSectionHeader headline='Own the fan path from first tap.' />
    );

    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Own the fan path from first tap.'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps left alignment and long copy whole in a right-to-left document', async () => {
    const headline = 'موسيقاك تبقى معًا. والخطوة الصحيحة تتقدم.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileSectionHeader
          align='left'
          eyebrow='ملف الفنان'
          headline={headline}
          body='وجّه كل زائر إلى الخطوة التالية المفيدة.'
        />
      </div>
    );

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(headline);
    expect(heading.className).not.toMatch(/line-clamp|truncate/);
    expect(heading.parentElement).toHaveClass('max-w-2xl');
    expect(heading.parentElement).not.toHaveClass('text-center');
    await expectNoA11yViolations(container);
  });
});
