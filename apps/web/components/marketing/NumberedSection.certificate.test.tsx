import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NumberedSection } from './NumberedSection';
import meta, {
  EmptySubItems,
  LongContentClampedHeading,
  PartialSingleSubItem,
  RtlArabic,
} from './NumberedSection.states.stories';
import defaultMeta from './NumberedSection.stories';

// Rendered-state, sub-item disclosure and axe coverage; the section contract
// lives in NumberedSection.test.tsx.
describe('NumberedSection states', () => {
  it('opens and closes each sub-item from its button', async () => {
    const user = userEvent.setup();
    const { container } = render(<NumberedSection {...defaultMeta.args} />);
    const profile = screen.getByRole('button', { name: /Profile/ });
    const campaign = screen.getByRole('button', { name: /Campaign/ });
    expect(profile).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByText('Confirm the public profile surface.')
    ).not.toBeVisible();

    await user.click(profile);
    expect(profile).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Confirm the public profile surface.')
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(campaign);
    expect(profile).toHaveAttribute('aria-expanded', 'false');
    expect(campaign).toHaveAttribute('aria-expanded', 'true');
    await user.click(campaign);
    expect(campaign).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders no accordion for an empty sub-item list', async () => {
    const { container } = render(
      <NumberedSection {...meta.args} {...EmptySubItems.args} />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Release plan preview')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a single sub-item with no anchor id', async () => {
    const { container } = render(
      <NumberedSection {...meta.args} {...PartialSingleSubItem.args} />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelector('section')).not.toHaveAttribute('id');
    await expectNoA11yViolations(container);
  });

  it('clamps a long heading and keeps long sub-items whole', async () => {
    const { container } = render(
      <NumberedSection {...meta.args} {...LongContentClampedHeading.args} />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: LongContentClampedHeading.args?.heading,
      })
    ).toHaveClass('line-clamp-2');
    expect(container.querySelector('#numbered-long')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Profile, links and every listening service/,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic section copy in a right-to-left document', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <NumberedSection {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'ابدأ بالإصدار.' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /الملف/ }));
    expect(screen.getByText('أكد واجهة الملف العامة.')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
