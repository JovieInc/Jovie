import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Container } from './Container';

describe('Container certificate', () => {
  it('renders the boxed page width by default axe-clean', async () => {
    const { container } = render(
      <Container className='py-4'>
        <p>Public content</p>
      </Container>
    );

    const box = container.firstElementChild;
    expect(box).toHaveClass('public-container', 'py-4');
    expect(box).not.toHaveClass('public-container--bleed');
    expect(screen.getByText('Public content')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long content inside the box', async () => {
    const long = 'https://jov.ie/a-very-long-unbroken-profile-address'.repeat(
      3
    );
    const { container } = render(
      <Container>
        <p className='break-words'>{long}</p>
      </Container>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the full-bleed override right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Container size='bleed'>
          <p>محتوى عام بعرض كامل.</p>
        </Container>
      </div>
    );

    expect(container.querySelector('.public-container')).toHaveClass(
      'public-container--bleed'
    );
    await expectNoA11yViolations(container);
  });
});
